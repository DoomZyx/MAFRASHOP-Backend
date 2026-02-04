import Stripe from "stripe";
import Order from "../models/orders.js";
import Cart from "../models/cart.js";
import Invoice from "../models/invoices.js";
import Delivery from "../models/deliveries.js";
import Product from "../models/products.js";
import StripeWebhookEvent from "../models/stripeWebhookEvents.js";
import pool from "../db.js";
import { calculateCartTotal, getDeliveryFee } from "../utils/priceCalculation.js";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY n'est pas défini dans les variables d'environnement");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Crée une session de paiement Stripe Checkout
 * 
 * Flow sécurisé :
 * 1. Calcul des prix côté backend (SEULE source de vérité)
 * 2. Création de l'Order en base AVANT redirection Stripe
 * 3. Stockage du snapshot des items et du montant attendu
 * 4. Stripe gère la TVA automatiquement (automatic_tax)
 * 5. Le webhook vérifie la cohérence des montants
 */
/**
 * Valide le format d'un sessionId Stripe
 */
const validateStripeSessionId = (sessionId) => {
  if (!sessionId || typeof sessionId !== "string") {
    return false;
  }
  // Format Stripe Checkout Session: cs_test_... ou cs_live_...
  return /^cs_(test|live)_[a-zA-Z0-9]{24,}$/.test(sessionId);
};

/**
 * Valide et sanitize l'adresse de livraison
 * Protection contre injection, validation métier, pays autorisés
 */
const validateShippingAddress = (address) => {
  if (!address) return null;

  // Vérifier que c'est un objet
  if (typeof address !== "object" || Array.isArray(address)) {
    return null;
  }

  // Pays autorisés (selon shipping_address_collection Stripe)
  const ALLOWED_COUNTRIES = ["FR", "BE", "CH", "LU"];

  // Fonction pour nettoyer et valider les chaînes (protection Unicode invisible)
  const sanitizeString = (value, maxLength) => {
    if (typeof value !== "string") return null;
    // Supprimer les caractères Unicode invisibles et contrôles
    const cleaned = value.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "").trim();
    return cleaned.substring(0, maxLength) || null;
  };

  // Structure attendue et validation
  const sanitized = {
    firstName: sanitizeString(address.firstName, 100),
    lastName: sanitizeString(address.lastName, 100),
    address: sanitizeString(address.address, 255),
    city: sanitizeString(address.city, 100),
    zipCode: sanitizeString(address.zipCode, 20),
    country: sanitizeString(address.country, 100),
    phone: sanitizeString(address.phone, 20),
  };

  // Vérifier les champs requis minimum
  if (!sanitized.address || !sanitized.city || !sanitized.zipCode) {
    return null;
  }

  // Validation format postal selon pays
  if (sanitized.country === "FR" && sanitized.zipCode) {
    // Code postal français : 5 chiffres
    if (!/^\d{5}$/.test(sanitized.zipCode)) {
      return null;
    }
  } else if (sanitized.country === "BE" && sanitized.zipCode) {
    // Code postal belge : 4 chiffres
    if (!/^\d{4}$/.test(sanitized.zipCode)) {
      return null;
    }
  } else if (sanitized.country === "CH" && sanitized.zipCode) {
    // Code postal suisse : 4 chiffres
    if (!/^\d{4}$/.test(sanitized.zipCode)) {
      return null;
    }
  } else if (sanitized.country === "LU" && sanitized.zipCode) {
    // Code postal luxembourgeois : 4 chiffres
    if (!/^\d{4}$/.test(sanitized.zipCode)) {
      return null;
    }
  }

  // Validation pays autorisé
  if (sanitized.country && !ALLOWED_COUNTRIES.includes(sanitized.country.toUpperCase())) {
    return null;
  }

  // Normaliser le pays en majuscules
  if (sanitized.country) {
    sanitized.country = sanitized.country.toUpperCase();
  }

  return sanitized;
};

export const createCheckoutSession = async (request, reply) => {
  try {
    const userId = request.user.id;
    const { shippingAddress: rawShippingAddress } = request.body;
    const isPro = request.user.isPro || false;

    // IDEMPOTENCE : Vérifier s'il existe déjà une commande pending pour cet utilisateur
    // Évite la création de multiples sessions pour le même panier
    const existingPendingOrders = await Order.findPendingByUserId(userId);
    if (existingPendingOrders.length > 0) {
      // Si une commande pending existe avec une session Stripe, réutiliser la session
      const orderWithSession = existingPendingOrders.find(
        (o) => o && o.stripeSessionId !== null
      );
      
      if (orderWithSession && orderWithSession.stripeSessionId) {
        try {
          // Vérifier que la session Stripe existe toujours et est valide
          const existingSession = await stripe.checkout.sessions.retrieve(
            orderWithSession.stripeSessionId
          );
          
          // Si la session est toujours ouverte (expired_at dans le futur ou null)
          if (
            !existingSession.expires_at ||
            existingSession.expires_at * 1000 > Date.now()
          ) {
            return reply.send({
              success: true,
              data: {
                sessionId: existingSession.id,
                url: existingSession.url,
                orderId: orderWithSession.id,
                reused: true,
              },
            });
          }
        } catch (stripeError) {
          // Session invalide ou expirée, on continue pour créer une nouvelle
          console.warn(
            `Session Stripe ${orderWithSession.stripeSessionId} invalide, création nouvelle session`
          );
        }
      }
      
      // Si pas de session valide, annuler les commandes pending orphelines
      // (elles seront recréées avec la nouvelle session)
      for (const pendingOrder of existingPendingOrders) {
        if (pendingOrder && !pendingOrder.stripeSessionId) {
          await Order.updateStatus(pendingOrder.id, "cancelled");
        }
      }
    }

    // Valider et sanitizer l'adresse de livraison
    const shippingAddress = validateShippingAddress(rawShippingAddress);

    // Récupérer le panier
    const cartItems = await Cart.findByUserId(userId);

    if (!cartItems || cartItems.length === 0) {
      return reply.code(400).send({
        success: false,
        message: "Le panier est vide",
      });
    }

    // VÉRIFICATION STOCK FINALE : Vérifier que tous les produits ont un stock suffisant
    // (protection contre changement de stock entre ajout au panier et checkout)
    const stockIssues = [];
    for (const cartItem of cartItems) {
      if (!cartItem || !cartItem.productId) continue;
      
      const product = await Product.findById(cartItem.productId.id);
      if (!product) {
        stockIssues.push({
          productId: cartItem.productId.id,
          productName: cartItem.productId.nom || "Produit inconnu",
          reason: "Produit introuvable",
        });
        continue;
      }

      if (product.stockQuantity < cartItem.quantity) {
        stockIssues.push({
          productId: cartItem.productId.id,
          productName: cartItem.productId.nom || "Produit inconnu",
          availableStock: product.stockQuantity,
          requestedQuantity: cartItem.quantity,
          reason: "Stock insuffisant",
        });
      }
    }

    if (stockIssues.length > 0) {
      return reply.code(400).send({
        success: false,
        message: "Certains produits ne sont plus disponibles en quantité suffisante",
        stockIssues,
      });
    }

    // Calculer les prix côté backend (SEULE source de vérité)
    // TVA : 0% si pro UE avec vatStatus="validated", sinon 20%
    const cartCalculation = await calculateCartTotal(cartItems, isPro, request.user);

    if (cartCalculation.items.length === 0) {
      return reply.code(400).send({
        success: false,
        message: "Aucun produit valide dans le panier",
      });
    }

    const deliveryFee = getDeliveryFee(cartCalculation.totalTTC);
    const totalWithDelivery = cartCalculation.totalTTC + deliveryFee;
    const totalInCentsWithDelivery = Math.round(totalWithDelivery * 100);
    const vatRate = cartCalculation.vatRate ?? 0.2;
    const totalAmountHT = cartCalculation.totalHT + deliveryFee / (1 + vatRate);

    // Préparer les line items pour Stripe
    // IMPORTANT : 
    // Pour tous (particuliers et pros) : on envoie le prix TTC (HT + 20% TVA) avec tax_behavior: "inclusive"
    const lineItems = cartCalculation.items.map((item) => {
      // Trouver l'item du panier correspondant
      const cartItem = cartItems.find((ci) => ci && ci.productId && ci.productId.id === item.productId);
      const product = cartItem?.productId;

      return {
        price_data: {
          currency: "eur",
          product_data: {
            name: product?.nom || "Produit",
            description: product?.description || product?.ref || "",
            images: product?.url_image ? [product.url_image] : [],
          },
          // Prix unitaire en centimes (TTC pour tous : HT + 20% TVA)
          unit_amount: item.unitPriceInCents,
          // Prix déjà TTC (TVA incluse) pour tous
          tax_behavior: "inclusive",
        },
        quantity: item.quantity,
      };
    });

    if (deliveryFee > 0) {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: "Frais de livraison",
            description: "Livraison standard",
          },
          unit_amount: Math.round(deliveryFee * 100),
          tax_behavior: "inclusive",
        },
        quantity: 1,
      });
    }

    // Créer la commande EN BASE AVANT la redirection Stripe
    // On stocke le snapshot des items, les frais de livraison et le montant attendu
    // totalAmount = sous-total TTC + frais de livraison ; totalAmountHT = HT pour stats exactes
    const order = await Order.create({
      userId,
      stripeSessionId: null,
      status: "pending",
      totalAmount: totalWithDelivery,
      totalAmountHT,
      expectedAmount: totalInCentsWithDelivery,
      deliveryFee,
      isPro,
      shippingAddress: shippingAddress || null,
      items: cartCalculation.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPriceHT, // Prix unitaire HT en euros (toujours stocké en HT)
        totalPrice: item.totalPriceHT, // Total HT en euros (toujours stocké en HT)
      })),
    });

    if (!order || !order.id) {
      throw new Error("Erreur lors de la création de la commande");
    }

    // Créer la session Stripe Checkout
    // automatic_tax désactivé : les prix sont déjà calculés côté backend (TTC pour tous)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      customer_creation: "always", // Toujours créer un customer Stripe
      success_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/checkout/cancel`,
      customer_email: request.user.email,
      metadata: {
        userId: userId.toString(),
        orderId: order.id.toString(),
      },
      shipping_address_collection: {
        allowed_countries: ["FR", "BE", "CH", "LU"],
      },
    });
    

    // Mettre à jour l'Order avec le stripeSessionId
    await Order.updateStripeSessionId(order.id, session.id);

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        orderId: order.id,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la création de la session Stripe:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la création de la session de paiement",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Webhook Stripe pour confirmer les paiements
 * 
 * Sécurité :
 * - Vérification de la signature Stripe
 * - Gestion uniquement de checkout.session.completed et checkout.session.async_payment_failed
 * - Comparaison stricte des montants (session.amount_total vs order.expectedAmount)
 * - Passage à "paid" uniquement si les montants correspondent
 * - Vidage du panier uniquement après paiement confirmé
 */
export const stripeWebhook = async (request, reply) => {
  const sig = request.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET non configuré");
    return reply.code(500).send({ error: "Configuration manquante" });
  }

  let event;

  try {
    // Utiliser le body brut (requis pour vérifier la signature Stripe)
    if (!request.rawBody) {
      // Fallback : essayer de récupérer le body depuis request.body si c'est une string
      if (typeof request.body === "string") {
        request.rawBody = request.body;
      } else {
        throw new Error("Body brut non disponible. Vérifiez la configuration de la route webhook.");
      }
    }
    event = stripe.webhooks.constructEvent(
      request.rawBody,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error("Erreur de signature webhook:", err.message);
    return reply.code(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // IDEMPOTENCE CRITIQUE : Utiliser INSERT directement (atomicité DB)
    // Protection contre race condition : UNIQUE constraint garantit qu'un seul webhook peut traiter l'événement
    let eventMarkResult;
    
    // Gérer uniquement les événements de checkout session
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Trouver la commande par session ID AVANT de marquer l'événement
      const order = await Order.findByStripeSessionId(session.id);

      if (!order) {
        console.error(`Commande non trouvée pour la session ${session.id} (event ${event.id})`);
        // Marquer comme orphelin (pas traité) pour permettre retry si commande créée avec retard
        await StripeWebhookEvent.markAsOrphan(event.id, event.type);
        // Retourner 200 pour éviter retry immédiat Stripe, mais garder possibilité de retry manuel
        return reply.send({ received: true, orphan: true });
      }

      // Tenter de marquer l'événement comme traité (atomicité DB)
      eventMarkResult = await StripeWebhookEvent.tryMarkAsProcessed(event.id, event.type, order.id);
      
      if (eventMarkResult.alreadyProcessed) {
        console.log(`Événement ${event.id} déjà traité à ${eventMarkResult.event.processed_at}`);
        return reply.send({ received: true, idempotent: true });
      }

      // GÉRER COMMANDE EXPIRÉE : Si commande cancelled mais paiement valide
      if (order.status === "cancelled") {
        console.warn(
          `Paiement reçu pour commande ${order.id} expirée/annulée. ` +
          `Session Stripe ${session.id} toujours valide.`
        );
        
        // Option 1 : Refund automatique (recommandé pour éviter fraude)
        if (session.payment_status === "paid" && session.payment_intent) {
          try {
            // session.payment_intent peut être un string ou un objet PaymentIntent
            const paymentIntentId = typeof session.payment_intent === "string" 
              ? session.payment_intent 
              : session.payment_intent.id;
            
            const refund = await stripe.refunds.create({
              payment_intent: paymentIntentId,
              reason: "requested_by_customer",
            });
            console.log(`Refund ${refund.id} créé pour commande expirée ${order.id}`);
            
            // Marquer l'événement comme traité
            return reply.send({ 
              received: true, 
              action: "refunded_expired_order",
              refund_id: refund.id 
            });
          } catch (refundError) {
            console.error(`Erreur lors du refund pour commande expirée ${order.id}:`, refundError);
            // Continuer pour permettre traitement manuel
          }
        }
        
        // Si refund échoue, retourner pour traitement manuel
        return reply.send({ 
          received: true, 
          warning: "expired_order_payment",
          order_id: order.id 
        });
      }

      // Vérifier que la commande est en statut pending
      if (order.status !== "pending") {
        console.warn(`Commande ${order.id} déjà traitée (statut: ${order.status})`);
        return reply.send({ received: true });
      }

      // Vérifier le paiement
      if (session.payment_status === "paid") {
        // Comparer le montant Stripe avec le montant attendu
        const stripeAmountTotal = session.amount_total; // Montant total en centimes depuis Stripe
        const expectedAmount = order.expectedAmount; // Montant attendu en centimes

        // Pour les particuliers : expectedAmount est en TTC (calculé côté backend)
        // Pour les pros : expectedAmount est en HT
        // On compare directement avec le montant total de Stripe
        // (qui sera TTC pour particuliers, HT pour pros)
        
        // Vérifier que expectedAmount existe
        if (expectedAmount === null || expectedAmount === undefined) {
          console.error(`expectedAmount manquant pour la commande ${order.id}`);
          await Order.updateStatus(order.id, "failed");
          return reply.code(400).send({ error: "expectedAmount manquant" });
        }

        // VÉRIFICATION CRITIQUE : Currency doit être EUR
        if (session.currency && session.currency.toUpperCase() !== "EUR") {
          console.error(
            `[AUDIT] Currency invalide pour la commande ${order.id}: ` +
            `Stripe=${session.currency}, Attendu=EUR, Event=${event.id}`
          );
          await Order.updateStatus(order.id, "failed");
          return reply.code(400).send({ 
            error: "Currency invalide",
            currency: session.currency,
          });
        }

        // VÉRIFICATION CRITIQUE : Montant Stripe doit correspondre au montant attendu
        // Protection contre fraude coupon/dashboard/rounding
        // Note : Stripe Climate peut ajouter 0.5% au montant si activé dans les paramètres
        const amountDifference = Math.abs((stripeAmountTotal || 0) - expectedAmount);
        
        // Tolérance selon type utilisateur :
        // - Stripe Climate : 0.5% du montant (peut être ajouté automatiquement)
        // - Arrondis : 1 centime (particuliers) ou 5 centimes (pros)
        const climateTolerance = Math.ceil(expectedAmount * 0.005); // 0.5% en centimes
        const roundingTolerance = order.isPro ? 5 : 1;
        const tolerance = climateTolerance + roundingTolerance;
        
        if (amountDifference > tolerance) {
          console.error(
            `[AUDIT] Incohérence de montant pour la commande ${order.id}: ` +
            `Stripe=${stripeAmountTotal} centimes, Attendu=${expectedAmount} centimes, ` +
            `Différence=${amountDifference}, Tolérance=${tolerance}, isPro=${order.isPro}, Event=${event.id}`
          );
          // Ne pas confirmer le paiement en cas d'incohérence
          await Order.updateStatus(order.id, "failed");
          return reply.code(400).send({ 
            error: "Incohérence de montant détectée",
            stripeAmount: stripeAmountTotal,
            expectedAmount,
            difference: amountDifference,
            tolerance,
            isPro: order.isPro,
          });
        }
        
        // Log si différence dans la tolérance (pour monitoring)
        if (amountDifference > 0) {
          console.log(
            `[AUDIT] Différence de montant acceptée (dans tolérance) pour commande ${order.id}: ` +
            `Différence=${amountDifference} centimes, Tolérance=${tolerance}, isPro=${order.isPro}`
          );
        }

        // JOURNALISATION AUDIT : Paiement validé
        console.log(
          `[AUDIT] Paiement validé pour commande ${order.id}: ` +
          `Montant=${stripeAmountTotal} centimes, Currency=${session.currency}, ` +
          `PaymentIntent=${session.payment_intent}, Event=${event.id}`
        );

        // Les montants correspondent, confirmer le paiement
        await Order.updateStatus(order.id, "paid");
        await Order.updatePaymentIntent(order.id, session.payment_intent);
        
        // L'événement est déjà marqué comme traité (atomicité DB au début)

        // DÉCOMPTER LE STOCK : Récupérer les items de la commande et décrémenter le stock
        // Utilisation d'une transaction batch pour garantir la cohérence
        try {
          const orderItems = await Order.findOrderItems(order.id);
          
          if (orderItems && orderItems.length > 0) {
            // VÉRIFICATION STOCK AVANT DÉCOMPTE (double protection)
            const stockCheckIssues = [];
            for (const item of orderItems) {
              const product = await Product.findById(item.productId);
              if (!product) {
                stockCheckIssues.push({
                  productId: item.productId,
                  reason: "Produit introuvable",
                });
              } else if (product.stockQuantity < item.quantity) {
                stockCheckIssues.push({
                  productId: item.productId,
                  productName: product.nom || "Produit inconnu",
                  availableStock: product.stockQuantity,
                  requestedQuantity: item.quantity,
                  reason: "Stock insuffisant",
                });
              }
            }

            if (stockCheckIssues.length > 0) {
              console.error(
                `[AUDIT] Stock insuffisant lors du décompte pour commande ${order.id}:`,
                stockCheckIssues
              );
              // Ne pas bloquer le paiement mais logger l'erreur pour investigation manuelle
              // Le stock sera quand même décompté (peut être un problème de timing)
            }

            // DÉCOMPTE ATOMIQUE EN BATCH (transaction)
            const itemsToDecrement = orderItems.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
            }));

            const updatedProducts = await Product.decrementStockBatch(itemsToDecrement);
            
            console.log(
              `[AUDIT] Stock décompté pour commande ${order.id}: ` +
              `${updatedProducts.length} produit(s) mis à jour`
            );
            
            // Log détaillé pour chaque produit
            orderItems.forEach((item, index) => {
              const updatedProduct = updatedProducts[index];
              if (updatedProduct) {
                console.log(
                  `  - Produit ${item.productId}: -${item.quantity} unité(s), ` +
                  `stock restant: ${updatedProduct.stockQuantity}`
                );
              }
            });
          }
        } catch (stockError) {
          // Erreur critique : le décompte a échoué
          // Ne pas bloquer le paiement (déjà confirmé par Stripe) mais logger l'erreur
          console.error(
            `[AUDIT] ERREUR CRITIQUE lors du décompte du stock pour commande ${order.id}:`,
            stockError
          );
          // TODO: Notifier l'admin pour traitement manuel
        }

        // Vider le panier UNIQUEMENT après confirmation du paiement
        await Cart.clear(order.userId);

        // Générer automatiquement la facture
        try {
          const invoice = await Invoice.createFromOrder(order.id);
          if (invoice) {
            console.log(`Facture ${invoice.invoiceNumber} créée pour la commande ${order.id}`);
          }
        } catch (invoiceError) {
          // Ne pas bloquer le processus si la génération de facture échoue
          console.error(`Erreur lors de la création de la facture pour la commande ${order.id}:`, invoiceError);
        }

        // Créer automatiquement la livraison avec date estimée selon le type de compte
        // Pro : 24h max, Particuliers : 72h max
        try {
          const delivery = await Delivery.createFromOrder(order.id, order.isPro);
          if (delivery) {
            console.log(
              `Livraison créée pour la commande ${order.id} ` +
              `(date estimée: ${delivery.estimatedDeliveryDate}, ` +
              `type: ${order.isPro ? "Pro (24h)" : "Particulier (72h)"})`
            );
          }
        } catch (deliveryError) {
          // Ne pas bloquer le processus si la création de livraison échoue
          console.error(`Erreur lors de la création de la livraison pour la commande ${order.id}:`, deliveryError);
        }

        console.log(`[AUDIT] Commande ${order.id} confirmée et panier vidé`);
      } else {
        console.warn(`[AUDIT] Session ${session.id} non payée (statut: ${session.payment_status}), Event=${event.id}`);
        // L'événement est déjà marqué comme traité (atomicité DB au début)
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object;

      // Tenter de marquer l'événement (atomicité DB)
      const eventMarkResult = await StripeWebhookEvent.tryMarkAsProcessed(
        event.id,
        event.type,
        null
      );
      
      if (eventMarkResult.alreadyProcessed) {
        return reply.send({ received: true, idempotent: true });
      }

      // Trouver la commande par session ID
      const order = await Order.findByStripeSessionId(session.id);

      if (order && order.status === "pending") {
        await Order.updateStatus(order.id, "failed");
        console.log(`[AUDIT] Commande ${order.id} marquée comme échouée (paiement asynchrone échoué), Event=${event.id}`);
        
        // Mettre à jour l'order_id dans l'événement
        await pool.query(
          "UPDATE stripe_webhook_events SET order_id = $1 WHERE event_id = $2",
          [order.id, event.id]
        );
      }
    } else {
      // Pour les autres types d'événements, marquer comme traité pour éviter le spam
      await StripeWebhookEvent.tryMarkAsProcessed(event.id, event.type, null);
    }

    reply.send({ received: true });
  } catch (error) {
    console.error("Erreur lors du traitement du webhook:", error);
    reply.code(500).send({ error: "Erreur serveur" });
  }
};

/**
 * Vérifier le statut d'une session
 * 
 * Sécurité anti-enumeration :
 * - Validation format sessionId AVANT appel Stripe
 * - Vérification ownership en DB AVANT appel Stripe
 * - Vérification cohérence session/commande
 * - Support rôle admin
 */
export const getSessionStatus = async (request, reply) => {
  try {
    const { sessionId } = request.params;
    const userId = request.user.id;
    const isAdmin = request.user.role === "admin";

    // 1. Validation format sessionId AVANT tout appel externe (anti-enumeration)
    if (!validateStripeSessionId(sessionId)) {
      return reply.code(400).send({
        success: false,
        message: "Format de session invalide",
      });
    }

    // 2. Vérifier ownership en DB AVANT appel Stripe (anti-enumeration)
    const order = await Order.findByStripeSessionId(sessionId);

    if (!order) {
      // Ne pas révéler si la session existe ou non (anti-enumeration)
      return reply.code(404).send({
        success: false,
        message: "Session non trouvée",
      });
    }

    // 3. Vérification ownership (sauf admin)
    if (!isAdmin) {
      const orderUserId = order.userId ? order.userId.toString() : null;
      const currentUserId = userId ? userId.toString() : null;

      if (orderUserId !== currentUserId) {
        return reply.code(403).send({
          success: false,
          message: "Accès non autorisé",
        });
      }
    }

    // 4. Maintenant seulement, appeler Stripe (ownership vérifié)
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // 5. Vérification cohérence session/commande (sécurité supplémentaire)
    if (order.stripeSessionId !== session.id) {
      console.error(
        `Incohérence détectée: order.stripeSessionId=${order.stripeSessionId}, session.id=${session.id}`
      );
      return reply.code(500).send({
        success: false,
        message: "Erreur de cohérence des données",
      });
    }

    // 6. Vérifier que les métadonnées correspondent
    if (
      session.metadata &&
      session.metadata.orderId &&
      session.metadata.orderId !== order.id.toString()
    ) {
      console.error(
        `Incohérence métadonnées: session.metadata.orderId=${session.metadata.orderId}, order.id=${order.id}`
      );
      return reply.code(500).send({
        success: false,
        message: "Erreur de cohérence des données",
      });
    }

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        session: {
          id: session.id,
          status: session.payment_status,
          customerEmail: session.customer_email,
        },
        order: order,
      },
    });
  } catch (error) {
    // Ne pas exposer les détails d'erreur Stripe (sécurité)
    if (error.type === "StripeInvalidRequestError") {
      return reply.code(404).send({
        success: false,
        message: "Session non trouvée",
      });
    }

    console.error("Erreur lors de la récupération de la session:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération de la session",
    });
  }
};
