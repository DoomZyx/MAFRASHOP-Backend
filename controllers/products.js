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
    
    // Essayer d'abord par slug, puis par ID si ce n'est pas un slug valide
    let product = await Products.findBySlug(id);
    
    // Si pas trouvé par slug, essayer par ID (si c'est un nombre)
    if (!product && /^\d+$/.test(id)) {
      product = await Products.findById(id);
    }
    
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

export const getBestsellers = async (request, reply) => {
  try {
    const products = await Products.findBestsellers();
    reply.type("application/json");
    return reply.status(200).send(products);
  } catch (err) {
    console.error("Erreur lors de la récupération des bestsellers:", err);
    reply.type("application/json");
    return reply.status(500).send({ message: "Erreur serveur" });
  }
};

export const getPromotions = async (request, reply) => {
  try {
    const products = await Products.findPromotions();
    reply.type("application/json");
    return reply.status(200).send(products);
  } catch (err) {
    console.error("Erreur lors de la récupération des promotions:", err);
    reply.type("application/json");
    return reply.status(500).send({ message: "Erreur serveur" });
  }
};

export const updateBestsellerStatus = async (request, reply) => {
  try {
    const { id } = request.params;
    const { is_bestseller } = request.body;
    
    if (typeof is_bestseller !== "boolean") {
      reply.type("application/json");
      return reply.status(400).send({ message: "is_bestseller doit être un booléen" });
    }
    
    const product = await Products.updateBestsellerStatus(id, is_bestseller);
    if (!product) {
      reply.type("application/json");
      return reply.status(404).send({ message: "Produit non trouvé" });
    }
    
    reply.type("application/json");
    return reply.status(200).send(product);
  } catch (err) {
    console.error("Erreur lors de la mise à jour du statut bestseller:", err);
    reply.type("application/json");
    return reply.status(500).send({ message: "Erreur serveur" });
  }
};

export const updatePromotionStatus = async (request, reply) => {
  try {
    const { id } = request.params;
    const { is_promotion, promotion_percentage } = request.body;
    
    if (typeof is_promotion !== "boolean") {
      reply.type("application/json");
      return reply.status(400).send({ message: "is_promotion doit être un booléen" });
    }
    
    // Valider le pourcentage si fourni
    let validPercentage = null;
    if (promotion_percentage !== undefined && promotion_percentage !== null && promotion_percentage !== "") {
      const percentage = parseInt(promotion_percentage);
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        reply.type("application/json");
        return reply.status(400).send({ message: "promotion_percentage doit être un nombre entre 0 et 100" });
      }
      validPercentage = percentage;
    }
    
    const product = await Products.updatePromotionStatus(
      id, 
      is_promotion, 
      validPercentage
    );
    if (!product) {
      reply.type("application/json");
      return reply.status(404).send({ message: "Produit non trouvé" });
    }
    
    reply.type("application/json");
    return reply.status(200).send(product);
  } catch (err) {
    console.error("Erreur lors de la mise à jour du statut promotion:", err);
    reply.type("application/json");
    return reply.status(500).send({ message: "Erreur serveur" });
  }
};

export const getCategories = async (request, reply) => {
  try {
    const categories = await Products.getDistinctCategories();
    reply.type("application/json");
    return reply.status(200).send(categories);
  } catch (err) {
    console.error("Erreur lors de la récupération des catégories:", err);
    reply.type("application/json");
    return reply.status(500).send({ message: "Erreur serveur" });
  }
};

export const getSubcategories = async (request, reply) => {
  try {
    const { category } = request.query;
    const subcategories = await Products.getDistinctSubcategories(category || null);
    reply.type("application/json");
    return reply.status(200).send(subcategories);
  } catch (err) {
    console.error("Erreur lors de la récupération des sous-catégories:", err);
    reply.type("application/json");
    return reply.status(500).send({ message: "Erreur serveur" });
  }
};