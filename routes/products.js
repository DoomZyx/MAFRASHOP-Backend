import {
  getAllProducts,
  getProductById,
  getBestsellers,
  getPromotions,
  updateBestsellerStatus,
  updatePromotionStatus,
  getCategories,
  getSubcategories,
} from "../controllers/products.js";

export default async function productsRoutes(fastify) {
  fastify.get("/products", getAllProducts);
  // Route qui accepte slug ou ID
  fastify.get("/products/:id", getProductById);
  fastify.get("/products/bestsellers/all", getBestsellers);
  fastify.get("/products/promotions/all", getPromotions);
  // Pour les routes PATCH, on garde l'ID numérique
  fastify.patch("/products/:id/bestseller", updateBestsellerStatus);
  fastify.patch("/products/:id/promotion", updatePromotionStatus);
  fastify.get("/products/categories/all", getCategories);
  fastify.get("/products/subcategories/all", getSubcategories);
}
