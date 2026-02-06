import {
  getUserDeliveries,
  getDeliveryById,
  getDeliveryByOrderId,
  getAllDeliveries,
  updateDeliveryStatus,
  updateTracking,
  updateScheduledDeliveryDateTime,
} from "../controllers/deliveries.js";
import { verifyToken } from "../middleware/auth.js";

export default async function deliveriesRoutes(fastify, options) {
  // Récupérer les livraisons de l'utilisateur connecté
  fastify.get("/deliveries", { preHandler: verifyToken }, getUserDeliveries);

  // Récupérer une livraison spécifique
  fastify.get("/deliveries/:id", { preHandler: verifyToken }, getDeliveryById);

  // Récupérer la livraison d'une commande
  fastify.get("/orders/:orderId/delivery", { preHandler: verifyToken }, getDeliveryByOrderId);

  // Routes admin
  // Récupérer toutes les livraisons (admin seulement)
  fastify.get("/admin/deliveries", { preHandler: verifyToken }, getAllDeliveries);

  // Mettre à jour le statut d'une livraison (admin seulement)
  fastify.patch(
    "/admin/deliveries/:id/status",
    { preHandler: verifyToken },
    updateDeliveryStatus
  );

  // Mettre à jour le numéro de suivi (admin seulement)
  fastify.patch(
    "/admin/deliveries/:id/tracking",
    { preHandler: verifyToken },
    updateTracking
  );

  // Mettre à jour la date et heure de livraison programmée (admin seulement)
  fastify.patch(
    "/admin/deliveries/:id/scheduled-delivery-datetime",
    { preHandler: verifyToken },
    updateScheduledDeliveryDateTime
  );
}

