import {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
} from "../../controllers/admin/orders.js";
import { verifyToken } from "../../middleware/auth.js";

export default async function adminOrdersRoutes(fastify, options) {
  // Récupérer toutes les commandes avec filtres (admin seulement)
  fastify.get(
    "/admin/orders",
    { preHandler: verifyToken },
    getAllOrders
  );

  // Récupérer une commande par ID (admin seulement)
  fastify.get(
    "/admin/orders/:id",
    { preHandler: verifyToken },
    getOrderById
  );

  // Mettre à jour le statut d'une commande (admin seulement)
  fastify.patch(
    "/admin/orders/:id/status",
    { preHandler: verifyToken },
    updateOrderStatus
  );
}

