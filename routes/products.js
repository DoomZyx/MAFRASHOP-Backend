import { getAllProducts, getProductById } from "../controllers/products.js";

export default async function productsRoutes(fastify) {
  fastify.get("/products", getAllProducts);
  fastify.get("/products/:id", getProductById);
  // fastify.post("/products", createProduct);
  // fastify.put("/products/:id", updateProduct);
  // fastify.delete("/products/:id", deleteProduct);
}
