import {
  getFavorites,
  addToFavorites,
  removeFromFavorites,
} from "../controllers/favorites.js";
import { verifyToken } from "../middleware/auth.js";

export default async function favoritesRoutes(fastify, options) {
  fastify.get("/favorites", { preHandler: verifyToken }, getFavorites);

  fastify.post("/favorites", { preHandler: verifyToken }, addToFavorites);

  fastify.delete("/favorites/:productId", {
    preHandler: verifyToken,
    handler: removeFromFavorites,
  });
}
