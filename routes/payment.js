import {
  createCheckoutSession,
  stripeWebhook,
  getSessionStatus,
} from "../controllers/payment.js";
import { verifyToken } from "../middleware/auth.js";

export default async function paymentRoutes(fastify, options) {
  // Webhook Stripe (doit être avant les autres routes pour éviter la vérification du token)
  // IMPORTANT : Pour les webhooks Stripe, on doit avoir accès au body brut (non parsé)
  // On utilise un parser personnalisé qui garde le body en string pour le webhook uniquement
  
  // Enregistrer un parser pour application/json qui garde le body brut pour le webhook
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    function (request, body, done) {
      // Webhook Stripe : body brut pour la signature (route finale = /api/payment/webhook)
      const isWebhookRoute =
        (request.routerPath && request.routerPath.includes("/webhook")) ||
        (request.url && request.url.includes("/payment/webhook"));
      
      if (isWebhookRoute) {
        done(null, body);
      } else {
        // Pour toutes les autres routes, parser normalement en JSON
        try {
          const json = JSON.parse(body);
          done(null, json);
        } catch (err) {
          done(err, undefined);
        }
      }
    }
  );

  const runStripeWebhook = async (request, reply) => {
    if (typeof request.body === "string") {
      request.rawBody = request.body;
    } else {
      request.rawBody = JSON.stringify(request.body || {});
    }
    return stripeWebhook(request, reply);
  };

  fastify.post("/payment/webhook", runStripeWebhook);

  // Routes protégées
  fastify.post(
    "/payment/create-checkout-session",
    { preHandler: verifyToken },
    createCheckoutSession
  );

  fastify.get(
    "/payment/session/:sessionId",
    { preHandler: verifyToken },
    getSessionStatus
  );
}

