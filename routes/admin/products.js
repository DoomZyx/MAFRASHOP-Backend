import {
  createProduct,
  updateProduct,
  deleteProduct,
} from "../../controllers/admin/products.js";
import { verifyToken } from "../../middleware/auth.js";

export default async function adminProductsRoutes(fastify, options) {
  // Créer un produit (admin seulement)
  fastify.post(
    "/api/admin/products",
    { preHandler: verifyToken },
    createProduct
  );

  // Mettre à jour un produit (admin seulement)
  fastify.put(
    "/api/admin/products/:id",
    { preHandler: verifyToken },
    updateProduct
  );

  // Supprimer un produit (admin seulement)
  fastify.delete(
    "/api/admin/products/:id",
    { preHandler: verifyToken },
    deleteProduct
  );
}

