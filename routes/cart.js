import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from "../controllers/cart.js";
import { verifyToken } from "../middleware/auth.js";

export default async function cartRoutes(fastify, options) {
  fastify.get("/cart", { preHandler: verifyToken }, getCart);

  fastify.post("/cart", { preHandler: verifyToken }, addToCart);

  fastify.put("/cart/:productId", { preHandler: verifyToken }, updateCartItem);

  fastify.delete("/cart/:productId", {
    preHandler: verifyToken,
    handler: removeFromCart,
  });

  fastify.delete("/cart", { preHandler: verifyToken }, clearCart);
}

