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
      // Pour la route webhook uniquement, garder le body en string brute
      // Utiliser routerPath ou url pour identifier la route
      const isWebhookRoute = 
        (request.routerPath && request.routerPath.includes("/webhook")) ||
        (request.url && request.url.includes("/api/payment/webhook"));
      
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

  fastify.post("/api/payment/webhook", async (request, reply) => {
    // Le body est maintenant une string brute (non parsée) grâce au parser personnalisé
    // C'est nécessaire pour la vérification de signature Stripe
    if (typeof request.body === "string") {
      request.rawBody = request.body;
    } else {
      // Fallback : si le body a été parsé, essayer de le reconstruire
      // (ne devrait pas arriver avec le parser personnalisé)
      request.rawBody = JSON.stringify(request.body || {});
    }
    
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

