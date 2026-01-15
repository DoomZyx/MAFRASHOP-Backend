import Products from "../models/products.js";

export const getAllProducts = async (request, reply) => {
  try {
    console.log("Tentative de récupération des produits...");
    const products = await Products.findAll();
    console.log(`Nombre de produits récupérés: ${products.length}`);
    
    // Définir explicitement le Content-Type
    reply.type("application/json");
    return reply.status(200).send(products);
  } catch (err) {
    console.error("Erreur complète lors de la récupération des produits:");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    
    reply.type("application/json");
    return reply.status(500).send({
      message: "Erreur serveur",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

export const getProductById = async (request, reply) => {
  try {
    const { id } = request.params;
    const product = await Products.findById(id);
    if (!product) {
      reply.type("application/json");
      return reply.status(404).send({ message: "Produit non trouvé" });
    }
    
    reply.type("application/json");
    return reply.status(200).send(product);
  } catch (err) {
    reply.type("application/json");
    return reply.status(500).send({ message: "Erreur serveur" });
  }
};