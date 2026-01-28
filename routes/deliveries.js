import {
  getUserDeliveries,
  getDeliveryById,
  getDeliveryByOrderId,
  getAllDeliveries,
  updateDeliveryStatus,
  updateTracking,
} from "../controllers/deliveries.js";
import { verifyToken } from "../middleware/auth.js";

export default async function deliveriesRoutes(fastify, options) {
  // Récupérer les livraisons de l'utilisateur connecté
  fastify.get("/api/deliveries", { preHandler: verifyToken }, getUserDeliveries);

  // Récupérer une livraison spécifique
  fastify.get("/api/deliveries/:id", { preHandler: verifyToken }, getDeliveryById);

  // Récupérer la livraison d'une commande
  fastify.get("/api/orders/:orderId/delivery", { preHandler: verifyToken }, getDeliveryByOrderId);

  // Routes admin
  // Récupérer toutes les livraisons (admin seulement)
  fastify.get("/api/admin/deliveries", { preHandler: verifyToken }, getAllDeliveries);

  // Mettre à jour le statut d'une livraison (admin seulement)
  fastify.patch(
    "/api/admin/deliveries/:id/status",
    { preHandler: verifyToken },
    updateDeliveryStatus
  );

  // Mettre à jour le numéro de suivi (admin seulement)
  fastify.patch(
    "/api/admin/deliveries/:id/tracking",
    { preHandler: verifyToken },
    updateTracking
  );
}

