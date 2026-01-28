import {
  getAllProductsStock,
  updateProductStock,
  updateStockAlertThreshold,
  getStockHistory,
  getLowStockProducts,
} from "../../controllers/admin/stock.js";
import { verifyToken } from "../../middleware/auth.js";

export default async function adminStockRoutes(fastify, options) {
  // Récupérer tous les produits avec leur stock
  fastify.get(
    "/api/admin/stock/products",
    { preHandler: verifyToken },
    getAllProductsStock
  );

  // Récupérer les produits en stock faible
  fastify.get(
    "/api/admin/stock/products/low",
    { preHandler: verifyToken },
    getLowStockProducts
  );

  // Mettre à jour le stock d'un produit
  fastify.put(
    "/api/admin/stock/products/:id",
    { preHandler: verifyToken },
    updateProductStock
  );

  // Mettre à jour le seuil d'alerte de stock
  fastify.patch(
    "/api/admin/stock/products/:id/alert-threshold",
    { preHandler: verifyToken },
    updateStockAlertThreshold
  );

  // Récupérer l'historique des mouvements de stock
  fastify.get(
    "/api/admin/stock/history",
    { preHandler: verifyToken },
    getStockHistory
  );
}

