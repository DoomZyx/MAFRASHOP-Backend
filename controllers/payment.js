import Stripe from "stripe";
import Order from "../models/orders.js";
import Cart from "../models/cart.js";
import Invoice from "../models/invoices.js";
import Delivery from "../models/deliveries.js";
import Product from "../models/products.js";
import StripeWebhookEvent from "../models/stripeWebhookEvents.js";
import User from "../models/user.js";
import pool from "../db.js";
import { calculateCartTotal, getDeliveryFee } from "../utils/priceCalculation.js";
import { validatePerfumeMinimum } from "../utils/perfumeValidation.js";
import { sendNewOrder } from "../services/notifyAdmin.js";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY n'est pas défini dans les variables d'environnement");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Crée une session de paiement Stripe Checkout
 *
 * Flow sécurisé :
 * 1. Calcul des prix côté backend (source de vérité)
 * 2. Commande `pending` + lignes `order_items` en base (évite metadata Stripe > 500 car. par clé)
 * 3. Session Stripe avec metadata.orderId, expectedAmount, etc.
 * 4. Webhook `checkout.session.completed` : passage à `paid`, déstockage, facture, livraison
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

/**
 * Récupère une commande pending créée au checkout (métadonnée orderId).
 * Gère la course rare webhook avant updateStripeSessionId : on attache alors la session.
 */
const resolvePendingOrderFromSessionMetadata = async (session) => {
  const orderIdRaw = session.metadata?.orderId;
  if (!orderIdRaw) return null;
  const orderId = parseInt(String(orderIdRaw), 10);
  const userIdMeta =
    session.metadata?.userId != null ? parseInt(String(session.metadata.userId), 10) : NaN;
  if (!orderId || Number.isNaN(orderId) || Number.isNaN(userIdMeta)) return null;

  const candidate = await Order.findById(String(orderId));
  if (!candidate || candidate.status !== "pending") return null;
  if (parseInt(String(candidate.userId), 10) !== userIdMeta) return null;

  if (!candidate.stripeSessionId) {
    await Order.updateStripeSessionId(candidate.id, session.id);
    return Order.findByStripeSessionId(session.id);
  }
  if (candidate.stripeSessionId === session.id) {
    return candidate;
  }
  return null;
};

export const createCheckoutSession = async (request, reply) => {
  let pendingOrder = null;
  try {
    const userId = request.user.id;
    const { shippingAddress: rawShippingAddress } = request.body;
    const isPro = request.user.isPro || false;

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

    // VÉRIFICATION PARFUMS : minimum 6 produits parfum (quantité totale) — uniquement pour les pros
    if (isPro) {
      const perfumeValidation = validatePerfumeMinimum(cartItems);
      if (!perfumeValidation.isValid) {
        return reply.code(400).send({
          success: false,
          message: perfumeValidation.message || "Vous devez commander au minimum 6 produits parfum.",
          perfumeValidation: {
            totalCount: perfumeValidation.totalCount,
            missing: perfumeValidation.missing,
            minimumRequired: perfumeValidation.minimumRequired,
          },
        });
      }
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
    const deliveryFeeInCents = Math.round(deliveryFee * 100);
    // Utiliser la somme des centimes (arrondis individuellement) pour correspondre à Stripe
    const totalInCentsWithDelivery = cartCalculation.totalInCents + deliveryFeeInCents;
    const totalWithDelivery = totalInCentsWithDelivery / 100; // Pour affichage et métadonnées
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

    // Préparer les données du panier pour les métadonnées Stripe
    // (nécessaire pour recréer la commande dans le webhook après paiement)
    const orderItems = cartCalculation.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPriceHT, // Prix unitaire HT en euros
      totalPrice: item.totalPriceHT, // Total HT en euros
    }));

    // Commande pending + lignes en base AVANT Stripe : les métadonnées Stripe sont limitées
    // à 500 caractères par clé — orderItems en JSON dépassait souvent et cassait le webhook.
    pendingOrder = await Order.create({
      userId,
      stripePaymentIntentId: null,
      stripeSessionId: null,
      status: "pending",
      totalAmount: totalWithDelivery,
      totalAmountHT,
      expectedAmount: totalInCentsWithDelivery,
      deliveryFee,
      isPro,
      shippingAddress: shippingAddress || null,
      items: orderItems,
    });

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
        orderId: pendingOrder.id.toString(),
        isPro: isPro.toString(),
        totalAmount: totalWithDelivery.toString(),
        totalAmountHT: totalAmountHT.toString(),
        expectedAmount: totalInCentsWithDelivery.toString(),
        deliveryFee: deliveryFee.toString(),
        vatRate: vatRate.toString(),
      },
      shipping_address_collection: {
        allowed_countries: ["FR", "BE", "CH", "LU"],
      },
    });

    await Order.updateStripeSessionId(pendingOrder.id, session.id);

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    if (pendingOrder?.id) {
      try {
        await Order.updateStatus(pendingOrder.id, "cancelled");
      } catch (cancelErr) {
        console.error(
          "Impossible d'annuler la commande pending après échec Stripe:",
          cancelErr.message
        );
      }
    }
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

  // 🔐 PROTECTION REPLAY WEBHOOK : Rejeter les événements trop anciens (> 5 minutes)
  // Protection contre rejeu d'événements interceptés
  const eventAge = Date.now() / 1000 - event.created;
  // Stripe peut livrer avec délai ; 5 min rejetait des événements légitimes
  const MAX_EVENT_AGE_SECONDS = 60 * 60; // 1 heure
  
  if (eventAge > MAX_EVENT_AGE_SECONDS) {
    console.warn(
      `[AUDIT PAYMENT] Webhook rejeté (trop ancien) | ` +
      `Event: ${event.id} | Type: ${event.type} | Age: ${Math.round(eventAge)}s | IP: ${request.ip || "unknown"}`
    );
    return reply.code(400).send({
      error: "Webhook trop ancien (replay protection)",
    });
  }

  try {
    // IDEMPOTENCE CRITIQUE : Utiliser INSERT directement (atomicité DB)
    // Protection contre race condition : UNIQUE constraint garantit qu'un seul webhook peut traiter l'événement
    let eventMarkResult;
    
    // Gérer uniquement les événements de checkout session
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      let order = await Order.findByStripeSessionId(session.id);
      if (!order) {
        order = await resolvePendingOrderFromSessionMetadata(session);
      }

      // Legacy : anciennes sessions sans orderId (orderItems entiers dans metadata, souvent > 500 car.)
      if (!order) {
        // Vérifier que les métadonnées nécessaires sont présentes
        if (!session.metadata || !session.metadata.userId) {
          console.error(`Métadonnées manquantes pour la session ${session.id} (event ${event.id})`);
          await StripeWebhookEvent.markAsOrphan(event.id, event.type);
          return reply.send({ received: true, orphan: true });
        }

        try {
          // ============================================
          // VALIDATION 1 : Récupérer et valider les métadonnées
          // ============================================
          const userId = parseInt(session.metadata.userId, 10);
          if (!userId || isNaN(userId)) {
            console.error(
              `[WEBHOOK VALIDATION] userId invalide dans métadonnées pour session ${session.id}: ${session.metadata.userId}`
            );
            await StripeWebhookEvent.markAsOrphan(event.id, event.type);
            return reply.code(400).send({ 
              received: true, 
              error: "userId invalide dans métadonnées" 
            });
          }

          // Vérifier que l'utilisateur existe
          const userCheck = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
          if (userCheck.rows.length === 0) {
            console.error(
              `[WEBHOOK VALIDATION] Utilisateur ${userId} introuvable pour session ${session.id} (event ${event.id})`
            );
            await StripeWebhookEvent.markAsOrphan(event.id, event.type);
            return reply.code(400).send({ 
              received: true, 
              error: `Utilisateur ${userId} introuvable` 
            });
          }

          let orderItems;
          try {
            orderItems = session.metadata.orderItems
              ? JSON.parse(session.metadata.orderItems)
              : [];
          } catch (parseErr) {
            console.error(
              `[WEBHOOK] orderItems metadata invalide (session ${session.id}): ${parseErr.message}`
            );
            await StripeWebhookEvent.markAsOrphan(event.id, event.type);
            return reply.code(400).send({
              received: true,
              error: "orderItems invalides",
            });
          }
          if (!Array.isArray(orderItems) || orderItems.length === 0) {
            console.error(
              `Aucune commande en base et pas d'orderItems legacy pour session ${session.id} (event ${event.id})`
            );
            await StripeWebhookEvent.markAsOrphan(event.id, event.type);
            return reply.send({ received: true, orphan: true });
          }

          const isPro = session.metadata.isPro === "true";
          const totalAmount = parseFloat(session.metadata.totalAmount);
          const totalAmountHT = parseFloat(session.metadata.totalAmountHT);
          const expectedAmount = parseInt(session.metadata.expectedAmount, 10);
          const deliveryFee = parseFloat(session.metadata.deliveryFee || "0");

          let shippingAddress = null;
          if (session.metadata.shippingAddress) {
            try {
              shippingAddress = JSON.parse(session.metadata.shippingAddress);
            } catch (addrErr) {
              console.error(
                `[WEBHOOK] shippingAddress metadata invalide (session ${session.id}): ${addrErr.message}`
              );
              await StripeWebhookEvent.markAsOrphan(event.id, event.type);
              return reply.code(400).send({
                received: true,
                error: "shippingAddress invalide",
              });
            }
          } else if (session.shipping_details?.address) {
            shippingAddress = {
              line1: session.shipping_details.address.line1,
              line2: session.shipping_details.address.line2 || null,
              city: session.shipping_details.address.city,
              postal_code: session.shipping_details.address.postal_code,
              country: session.shipping_details.address.country,
            };
          }

          // ============================================
          // VALIDATION 2 : Vérifier le montant total (totalAmount)
          // ============================================
          const stripeAmountTotal = session.amount_total; // Montant total en centimes depuis Stripe
          const expectedAmountInCents = expectedAmount;

          if (expectedAmountInCents === null || expectedAmountInCents === undefined || isNaN(expectedAmountInCents)) {
            console.error(
              `[WEBHOOK VALIDATION] expectedAmount invalide pour session ${session.id}: ${expectedAmount}`
            );
            await StripeWebhookEvent.markAsOrphan(event.id, event.type);
            return reply.code(400).send({ 
              received: true, 
              error: "expectedAmount invalide dans métadonnées" 
            });
          }

          // Vérifier que le montant Stripe correspond au montant attendu
          const amountDifference = Math.abs((stripeAmountTotal || 0) - expectedAmountInCents);
          const climateTolerance = Math.ceil(expectedAmountInCents * 0.005); // 0.5% pour Stripe Climate
          const roundingTolerance = isPro ? 5 : 1;
          const tolerance = climateTolerance + roundingTolerance;

          if (amountDifference > tolerance) {
            console.error(
              `[WEBHOOK VALIDATION] Incohérence de montant pour session ${session.id}: ` +
              `Stripe=${stripeAmountTotal} centimes, Attendu=${expectedAmountInCents} centimes, ` +
              `Différence=${amountDifference}, Tolérance=${tolerance}, isPro=${isPro}, Event=${event.id}`
            );
            await StripeWebhookEvent.markAsOrphan(event.id, event.type);
            return reply.code(400).send({ 
              received: true, 
              error: "Incohérence de montant détectée",
              stripeAmount: stripeAmountTotal,
              expectedAmount: expectedAmountInCents,
              difference: amountDifference,
              tolerance,
            });
          }

          // Log si différence dans la tolérance (pour monitoring)
          if (amountDifference > 0) {
            console.log(
              `[WEBHOOK VALIDATION] Différence de montant acceptée (dans tolérance) pour session ${session.id}: ` +
              `Différence=${amountDifference} centimes, Tolérance=${tolerance}, isPro=${isPro}`
            );
          }

          // ============================================
          // VALIDATION 3 : Vérifier le stock avant de créer la commande
          // ============================================
          const stockIssues = [];
          for (const item of orderItems) {
            if (!item || !item.productId) {
              stockIssues.push({
                item,
                reason: "Item invalide (productId manquant)",
              });
              continue;
            }

            const product = await Product.findById(item.productId);
            if (!product) {
              stockIssues.push({
                productId: item.productId,
                reason: "Produit introuvable",
              });
              continue;
            }

            if (product.stockQuantity < item.quantity) {
              stockIssues.push({
                productId: item.productId,
                productName: product.nom || "Produit inconnu",
                availableStock: product.stockQuantity,
                requestedQuantity: item.quantity,
                reason: "Stock insuffisant",
              });
            }
          }

          if (stockIssues.length > 0) {
            console.error(
              `[WEBHOOK VALIDATION] Stock insuffisant pour session ${session.id} (event ${event.id}):`,
              stockIssues
            );
            // Ne pas créer la commande si le stock est insuffisant
            // Le paiement a déjà été effectué, il faudra un refund manuel
            await StripeWebhookEvent.markAsOrphan(event.id, event.type);
            return reply.code(400).send({ 
              received: true, 
              error: "Stock insuffisant pour certains produits",
              stockIssues,
              // TODO: Notifier l'admin pour refund manuel
            });
          }

          // ============================================
          // LOGS : Historique complet avant création
          // ============================================
          console.log(
            `[WEBHOOK] Création de commande pour session ${session.id} (event ${event.id}):\n` +
            `  - userId: ${userId}\n` +
            `  - isPro: ${isPro}\n` +
            `  - totalAmount: ${totalAmount}€\n` +
            `  - totalAmountHT: ${totalAmountHT}€\n` +
            `  - expectedAmount: ${expectedAmountInCents} centimes\n` +
            `  - stripeAmountTotal: ${stripeAmountTotal} centimes\n` +
            `  - deliveryFee: ${deliveryFee}€\n` +
            `  - items: ${orderItems.length} produit(s)\n` +
            `  - payment_intent: ${session.payment_intent || "N/A"}`
          );

          // ============================================
          // CRÉATION DE LA COMMANDE
          // ============================================
          order = await Order.create({
            userId,
            stripeSessionId: session.id,
            status: "paid",
            totalAmount,
            totalAmountHT,
            expectedAmount: expectedAmountInCents,
            deliveryFee,
            isPro,
            shippingAddress,
            items: orderItems,
          });

          // Mettre à jour avec le Payment Intent si disponible
          if (session.payment_intent) {
            await Order.updatePaymentIntent(order.id, session.payment_intent);
          }

          console.log(
            `[WEBHOOK] ✅ Commande ${order.id} créée avec succès depuis webhook Stripe pour session ${session.id}`
          );

          // Notification admin (email propriétaire)
          User.findById(userId)
            .then((user) => {
              const userName = user
                ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
                : "Utilisateur";
              return sendNewOrder(order.id, userName);
            })
            .catch((err) => console.error("[WEBHOOK] Erreur récupération user pour notification admin:", err.message));

          // ============================================
          // POST-CRÉATION : Livraison, Facture, Panier
          // ============================================
          
          // Vider le panier de l'utilisateur
          try {
            await Cart.clear(userId);
            console.log(`[WEBHOOK] Panier vidé pour utilisateur ${userId}`);
          } catch (cartError) {
            console.error(`[WEBHOOK] Erreur lors du vidage du panier pour utilisateur ${userId}:`, cartError);
            // Ne pas bloquer le processus
          }

          // Générer automatiquement la facture
          try {
            const invoice = await Invoice.createFromOrder(order.id);
            if (invoice) {
              console.log(`[WEBHOOK] Facture ${invoice.invoiceNumber} créée pour la commande ${order.id}`);
            }
          } catch (invoiceError) {
            // Ne pas bloquer le processus si la génération de facture échoue
            console.error(`[WEBHOOK] Erreur lors de la création de la facture pour la commande ${order.id}:`, invoiceError);
          }

          // Créer automatiquement la livraison avec date estimée
          // Tous les utilisateurs : 72h max
          try {
            const delivery = await Delivery.createFromOrder(order.id, order.isPro);
            if (delivery) {
              console.log(
                `[WEBHOOK] Livraison créée pour la commande ${order.id} ` +
                `(date estimée: ${delivery.estimatedDeliveryDate}, ` +
                `type: ${order.isPro ? "Pro" : "Particulier"} - 72h)`
              );
            }
          } catch (deliveryError) {
            // Ne pas bloquer le processus si la création de livraison échoue
            console.error(`[WEBHOOK] Erreur lors de la création de la livraison pour la commande ${order.id}:`, deliveryError);
          }

          console.log(`[WEBHOOK] ✅ Commande ${order.id} complètement finalisée (livraison + facture + panier vidé)`);
        } catch (createError) {
          console.error(`Erreur lors de la création de la commande depuis webhook:`, createError);
          await StripeWebhookEvent.markAsOrphan(event.id, event.type);
          return reply.code(500).send({ 
            received: true, 
            error: "Erreur lors de la création de la commande" 
          });
        }
      }

      // Tenter de marquer l'événement comme traité (atomicité DB)
      eventMarkResult = await StripeWebhookEvent.tryMarkAsProcessed(event.id, event.type, order.id);
      
      if (eventMarkResult.alreadyProcessed) {
        console.log(`Événement ${event.id} déjà traité à ${eventMarkResult.event.processed_at}`);
        return reply.send({ received: true, idempotent: true });
      }

      // Si la commande est déjà payée, ne rien faire
      if (order.status === "paid") {
        console.log(`Commande ${order.id} déjà payée, webhook idempotent`);
        return reply.send({ received: true, alreadyPaid: true });
      }

      // Vérifier le paiement
      if (session.payment_status === "paid") {
        // Si la commande vient d'être créée avec le statut "paid", on a déjà tout fait
        // Sinon, on doit valider et mettre à jour le statut
        if (order.status !== "paid") {
          // Comparer le montant Stripe avec le montant attendu
          const stripeAmountTotal = session.amount_total; // Montant total en centimes depuis Stripe
          const expectedAmount = order.expectedAmount; // Montant attendu en centimes

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
          const amountDifference = Math.abs((stripeAmountTotal || 0) - expectedAmount);
          const climateTolerance = Math.ceil(expectedAmount * 0.005);
          const roundingTolerance = order.isPro ? 5 : 1;
          const tolerance = climateTolerance + roundingTolerance;
          
          if (amountDifference > tolerance) {
            console.error(
              `[AUDIT] Incohérence de montant pour la commande ${order.id}: ` +
              `Stripe=${stripeAmountTotal} centimes, Attendu=${expectedAmount} centimes, ` +
              `Différence=${amountDifference}, Tolérance=${tolerance}, isPro=${order.isPro}, Event=${event.id}`
            );
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

          // Les montants correspondent, confirmer le paiement
          await Order.updateStatus(order.id, "paid");
          if (session.payment_intent) {
            await Order.updatePaymentIntent(order.id, session.payment_intent);
          }
        }

        // JOURNALISATION AUDIT : Paiement validé
        console.log(
          `[AUDIT] Paiement validé pour commande ${order.id}: ` +
          `Montant=${session.amount_total} centimes, Currency=${session.currency}, ` +
          `PaymentIntent=${session.payment_intent}, Event=${event.id}`
        );

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

        // Créer automatiquement la livraison avec date estimée
        // Tous les utilisateurs : 72h max
        try {
          const delivery = await Delivery.createFromOrder(order.id, order.isPro);
          if (delivery) {
            console.log(
              `Livraison créée pour la commande ${order.id} ` +
              `(date estimée: ${delivery.estimatedDeliveryDate}, ` +
              `type: ${order.isPro ? "Pro" : "Particulier"} - 72h)`
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
    let order = await Order.findByStripeSessionId(sessionId);

    if (!order) {
      // Commande pas encore en base (webhook peut être en retard). Vérifier Stripe et ownership.
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const sessionUserId = session.metadata?.userId ? parseInt(session.metadata.userId, 10) : null;
        const currentUserId = userId ? parseInt(userId.toString(), 10) : null;
        if (
          sessionUserId === currentUserId &&
          session.payment_status === "paid"
        ) {
          // Paiement OK, commande en cours de création par le webhook → demander au client de réessayer
          reply.type("application/json");
          return reply.code(202).send({
            success: true,
            data: {
              session: {
                id: session.id,
                status: session.payment_status,
                customerEmail: session.customer_email,
              },
              order: null,
              processing: true,
              message: "Commande en cours de création, veuillez réessayer dans quelques secondes",
            },
          });
        }
      } catch (e) {
        if (e.type !== "StripeInvalidRequestError") {
          console.error("getSessionStatus: erreur Stripe (order null):", e.message);
        }
      }
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
