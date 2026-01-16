import Favorites from "../models/favorites.js";
import Product from "../models/products.js";
import { sendToUser } from "../app.js";

export const getFavorites = async (request, reply) => {
  try {
    const favorites = await Favorites.findByUserId(request.user.id);

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        favorites: favorites || [],
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des favoris:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des favoris",
    });
  }
};

export const addToFavorites = async (request, reply) => {
  try {
    const { productId } = request.body;

    if (!productId) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: "ID du produit requis",
      });
    }

    // Vérifier que le produit existe
    const product = await Product.findById(productId);
    if (!product) {
      reply.type("application/json");
      return reply.code(404).send({
        success: false,
        message: "Produit introuvable",
      });
    }

    const favorites = await Favorites.addItem(request.user.id, productId);

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user.id.toString(), "favorites:updated", {
      favorites: favorites,
    });

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Produit ajouté aux favoris",
      data: {
        favorites: favorites,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout aux favoris:", error);
    reply.type("application/json");
    
    if (error.message === "Le produit est déjà dans les favoris") {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }

    return reply.code(500).send({
      success: false,
      message: "Erreur lors de l'ajout aux favoris",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const removeFromFavorites = async (request, reply) => {
  try {
    const { productId } = request.params;

    if (!productId) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: "ID du produit requis",
      });
    }

    const favorites = await Favorites.removeItem(request.user.id, productId);

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user.id.toString(), "favorites:updated", {
      favorites: favorites,
    });

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Produit retiré des favoris",
      data: {
        favorites: favorites,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la suppression des favoris:", error);
    reply.type("application/json");
    
    if (error.message === "Produit non trouvé dans les favoris") {
      return reply.code(404).send({
        success: false,
        message: error.message,
      });
    }

    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la suppression des favoris",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};