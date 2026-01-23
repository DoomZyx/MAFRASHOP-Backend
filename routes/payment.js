import {
  createCheckoutSession,
  stripeWebhook,
  getSessionStatus,
} from "../controllers/payment.js";
import { verifyToken } from "../middleware/auth.js";

export default async function paymentRoutes(fastify, options) {
  // Webhook Stripe (doit être avant les autres routes pour éviter la vérification du token)
  // Note: Pour les webhooks Stripe, nous devons utiliser le body brut
  fastify.post("/api/payment/webhook", async (request, reply) => {
    // Récupérer le body brut depuis le stream
    const chunks = [];
    for await (const chunk of request.raw) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    request.rawBody = rawBody;
    
    return stripeWebhook(request, reply);
  });

  // Routes protégées
  fastify.post(
    "/api/payment/create-checkout-session",
    { preHandler: verifyToken },
    createCheckoutSession
  );

  fastify.get(
    "/api/payment/session/:sessionId",
    { preHandler: verifyToken },
    getSessionStatus
  );
}

