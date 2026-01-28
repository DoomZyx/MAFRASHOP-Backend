import {
  getUserOrders,
  getOrderById,
} from "../controllers/orders.js";
import { verifyToken } from "../middleware/auth.js";

export default async function ordersRoutes(fastify, options) {
  // Récupérer les commandes de l'utilisateur connecté
  fastify.get("/api/orders", { preHandler: verifyToken }, getUserOrders);

  // Récupérer une commande spécifique
  fastify.get("/api/orders/:id", { preHandler: verifyToken }, getOrderById);
}






