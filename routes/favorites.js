import {
  getFavorites,
  addToFavorites,
  removeFromFavorites,
} from "../controllers/favorites.js";
import { verifyToken } from "../middleware/auth.js";

export default async function favoritesRoutes(fastify, options) {
  fastify.get("/api/favorites", { preHandler: verifyToken }, getFavorites);

  fastify.post("/api/favorites", { preHandler: verifyToken }, addToFavorites);

  fastify.delete("/api/favorites/:productId", {
    preHandler: verifyToken,
    handler: removeFromFavorites,
  });
}
