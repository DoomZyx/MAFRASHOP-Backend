import Stripe from "stripe";
import Order from "../models/orders.js";
import Cart from "../models/cart.js";
import Product from "../models/products.js";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY n'est pas défini dans les variables d'environnement");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Créer une session de paiement Stripe
export const createCheckoutSession = async (request, reply) => {
  try {
    const userId = request.user.id;
    const { shippingAddress } = request.body;

    // Récupérer le panier
    const cartItems = await Cart.findByUserId(userId);

    if (!cartItems || cartItems.length === 0) {
      return reply.code(400).send({
        success: false,
        message: "Le panier est vide",
      });
    }

    // Calculer le total et préparer les line items pour Stripe
    let totalAmount = 0;
    const lineItems = [];

    const isPro = request.user.isPro || false;

    for (const item of cartItems) {
      if (!item || !item.productId) continue;
      const product = item.productId;
      
      // Déterminer le prix selon le type d'utilisateur
      // Pour les pros : utiliser garage, sinon public_ht
      let unitPrice = isPro 
        ? (product.garage || product.public_ht || 0)
        : (product.public_ht || product.net_socofra || 0);
      
      // Appliquer la promotion si elle existe
      const fullProduct = await Product.findById(product.id);
      if (fullProduct?.is_promotion && fullProduct?.promotion_percentage) {
        const discount = (unitPrice * fullProduct.promotion_percentage) / 100;
        unitPrice = unitPrice - discount;
      }

      // Ajouter la TVA (20%) uniquement pour les particuliers
      if (!isPro) {
        unitPrice = unitPrice * 1.2; // TTC
      }

      const itemTotal = unitPrice * item.quantity;
      totalAmount += itemTotal;

      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: product.nom,
            description: product.description || `${product.ref} - ${product.category}`,
            images: product.url_image ? [product.url_image] : [],
          },
          unit_amount: Math.round(unitPrice * 100), // Stripe utilise les centimes
        },
        quantity: item.quantity,
      });
    }

    // Créer la session Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/checkout/cancel`,
      customer_email: request.user.email,
      metadata: {
        userId: userId.toString(),
      },
      shipping_address_collection: {
        allowed_countries: ["FR", "BE", "CH", "LU"],
      },
    });

    // Créer une commande en statut "pending"
    const order = await Order.create({
      userId,
      stripeSessionId: session.id,
      status: "pending",
      totalAmount,
      isPro: isPro,
      shippingAddress: shippingAddress || null,
      items: cartItems
        .filter((item) => item && item.productId)
        .map((item) => {
          if (!item || !item.productId) return null;
          const product = item.productId;
          // Utiliser le même calcul de prix que pour Stripe
          let unitPrice = isPro 
            ? (product.garage || product.public_ht || 0)
            : (product.public_ht || product.net_socofra || 0);
          
          // Appliquer la promotion si elle existe
          // Note: on devrait récupérer le produit complet, mais pour simplifier on utilise le prix déjà calculé
          if (!isPro) {
            unitPrice = unitPrice * 1.2; // TTC
          }
          
          return {
            productId: product.id,
            quantity: item.quantity,
            unitPrice,
            totalPrice: unitPrice * item.quantity,
          };
        })
        .filter((item) => item !== null),
    });

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        orderId: order?.id || null,
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

// Webhook Stripe pour confirmer les paiements
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
      throw new Error("Body brut non disponible");
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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Trouver la commande par session ID
      const order = await Order.findByStripeSessionId(session.id);

      if (order) {
        // Mettre à jour le statut de la commande
        await Order.updateStatus(order.id, "paid");
        await Order.updatePaymentIntent(order.id, session.payment_intent);

        // Vider le panier de l'utilisateur
        await Cart.clear(order.userId);

        console.log(`Commande ${order.id} confirmée et panier vidé`);
      }
    } else if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      console.log("Paiement réussi:", paymentIntent.id);
    } else if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      
      // Trouver la commande par payment intent
      const order = await Order.findByStripePaymentIntentId(paymentIntent.id);
      if (order) {
        await Order.updateStatus(order.id, "failed");
        console.log(`Commande ${order.id} marquée comme échouée`);
      }
    }

    reply.send({ received: true });
  } catch (error) {
    console.error("Erreur lors du traitement du webhook:", error);
    reply.code(500).send({ error: "Erreur serveur" });
  }
};

// Vérifier le statut d'une session
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

