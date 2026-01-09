import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from "../controllers/cart.js";
import { verifyToken } from "../middleware/auth.js";

export default async function cartRoutes(fastify, options) {
  fastify.get("/api/cart", { preHandler: verifyToken }, getCart);

  fastify.post("/api/cart", { preHandler: verifyToken }, addToCart);

  fastify.put("/api/cart/:productId", { preHandler: verifyToken }, updateCartItem);

  fastify.delete("/api/cart/:productId", {
    preHandler: verifyToken,
    handler: removeFromCart,
  });

  fastify.delete("/api/cart", { preHandler: verifyToken }, clearCart);
}

