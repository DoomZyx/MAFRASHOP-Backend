import Products from "../models/products.js";

export const getAllProducts = async (request, reply) => {
  try {
    const products = await Products.find();
    return reply.status(200).send(products);
  } catch (err) {
    console.error("Erreur lors de la récupération des produits:", err);
    return reply.status(500).send({ message: "Erreur serveur" });
  }
};

export const getProductById = async (request, reply) => {
  try {
    const { id } = request.params;
    const product = await Products.findById(id);
    if (!product) return reply.status(404).send({ message: "Produit non trouvé" });
    return reply.status(200).send(product);
  } catch (err) {
    return reply.status(500).send({ message: "Erreur serveur" });
  }
};
