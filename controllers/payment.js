import Stripe from "stripe";
import Order from "../models/orders.js";
import Cart from "../models/cart.js";
import Invoice from "../models/invoices.js";
import Delivery from "../models/deliveries.js";
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
export const createCheckoutSession = async (request, reply) => {
  try {
    const userId = request.user.id;
    const { shippingAddress } = request.body;
    const isPro = request.user.isPro || false;

    // Récupérer le panier
    const cartItems = await Cart.findByUserId(userId);

    if (!cartItems || cartItems.length === 0) {
      return reply.code(400).send({
        success: false,
        message: "Le panier est vide",
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
    // totalAmount = sous-total TTC + frais de livraison
    const order = await Order.create({
      userId,
      stripeSessionId: null,
      status: "pending",
      totalAmount: totalWithDelivery,
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

    // Créer la session Stripe Checkout avec automatic_tax
    // Stripe vérifiera la TVA automatiquement même si on envoie déjà le TTC pour les particuliers
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      customer_creation: "always", // Toujours créer un customer Stripe
      automatic_tax: {
        enabled: true, // Stripe vérifie automatiquement la TVA française (même si prix déjà en TTC)
      },
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
    // Gérer uniquement les événements de checkout session
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Trouver la commande par session ID
      const order = await Order.findByStripeSessionId(session.id);

      if (!order) {
        console.error(`Commande non trouvée pour la session ${session.id}`);
        return reply.code(404).send({ error: "Commande non trouvée" });
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

        // Comparer avec une tolérance de 1 centime pour les arrondis
        // Pour les particuliers : on compare TTC avec TTC
        // Pour les pros : on compare HT avec HT
        const amountDifference = Math.abs((stripeAmountTotal || 0) - expectedAmount);
        
        if (amountDifference > 1) {
          console.error(
            `Incohérence de montant pour la commande ${order.id}: ` +
            `Stripe=${stripeAmountTotal}, Attendu=${expectedAmount}, Différence=${amountDifference}, isPro=${order.isPro}`
          );
          // Ne pas confirmer le paiement en cas d'incohérence
          await Order.updateStatus(order.id, "failed");
          return reply.code(400).send({ 
            error: "Incohérence de montant détectée",
            stripeAmount: stripeAmountTotal,
            expectedAmount,
            isPro: order.isPro,
          });
        }

        // Les montants correspondent, confirmer le paiement
        await Order.updateStatus(order.id, "paid");
        await Order.updatePaymentIntent(order.id, session.payment_intent);

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

        console.log(`Commande ${order.id} confirmée et panier vidé`);
      } else {
        console.warn(`Session ${session.id} non payée (statut: ${session.payment_status})`);
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object;

      // Trouver la commande par session ID
      const order = await Order.findByStripeSessionId(session.id);

      if (order && order.status === "pending") {
        await Order.updateStatus(order.id, "failed");
        console.log(`Commande ${order.id} marquée comme échouée (paiement asynchrone échoué)`);
      }
    }

    reply.send({ received: true });
  } catch (error) {
    console.error("Erreur lors du traitement du webhook:", error);
    reply.code(500).send({ error: "Erreur serveur" });
  }
};

/**
 * Vérifier le statut d'une session
 */
export const getSessionStatus = async (request, reply) => {
  try {
    const { sessionId } = request.params;

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Trouver la commande associée
    const order = await Order.findByStripeSessionId(sessionId);

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        session: {
          id: session.id,
          status: session.payment_status,
          customerEmail: session.customer_email,
        },
        order: order || null,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de la session:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération de la session",
    });
  }
};
