import User from "../models/user.js";
import Product from "../models/products.js";
import mongoose from "mongoose";
import { sendToUser } from "../app.js";

export const getFavorites = async (request, reply) => {
  try {
    const user = await User.findById(request.user._id).populate(
      "favorites.productId"
    );

    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    reply.send({
      success: true,
      data: {
        favorites: user.favorites || [],
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des favoris:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des favoris",
    });
  }
};

export const addToFavorites = async (request, reply) => {
  try {
    const { productId } = request.body;

    if (!productId) {
      return reply.code(400).send({
        success: false,
        message: "ID du produit requis",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return reply.code(404).send({
        success: false,
        message: "Produit introuvable",
      });
    }

    const user = await User.findById(request.user._id);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    const isAlreadyFavorite = user.favorites.some(
      (fav) => fav.productId && fav.productId.toString() === productId
    );

    if (isAlreadyFavorite) {
      return reply.code(400).send({
        success: false,
        message: "Le produit est déjà dans les favoris",
      });
    }

    user.favorites.push({
      productId: productId,
    });

    await user.save();

    // Envoyer une mise à jour WebSocket
    const updatedUser = await User.findById(request.user._id).populate(
      "favorites.productId"
    );
    if (updatedUser) {
      sendToUser(request.user._id.toString(), "favorites:updated", {
        favorites: updatedUser.favorites,
      });
    }

    reply.send({
      success: true,
      message: "Produit ajouté aux favoris",
      data: {
        favorites: user.favorites,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout aux favoris:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors de l'ajout aux favoris",
    });
  }
};

export const removeFromFavorites = async (request, reply) => {
  try {
    const { productId } = request.params;

    if (!productId) {
      return reply.code(400).send({
        success: false,
        message: "ID du produit requis",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return reply.code(400).send({
        success: false,
        message: "ID du produit invalide",
      });
    }

    const user = await User.findById(request.user._id);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    const initialLength = user.favorites.length;
    const productObjectId = new mongoose.Types.ObjectId(productId);

    // Filtrer les favoris
    // @ts-ignore - Mongoose DocumentArray type limitation
    user.favorites = user.favorites.filter((fav) => {
      if (!fav.productId) return true;
      const favProductId =
        fav.productId instanceof mongoose.Types.ObjectId
          ? fav.productId
          : new mongoose.Types.ObjectId(String(fav.productId));
      return !favProductId.equals(productObjectId);
    });

    if (user.favorites.length === initialLength) {
      return reply.code(404).send({
        success: false,
        message: "Produit non trouvé dans les favoris",
      });
    }

    await user.save();

    const updatedUser = await User.findById(request.user._id).populate(
      "favorites.productId"
    );

    if (!updatedUser) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable après mise à jour",
      });
    }

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user._id.toString(), "favorites:updated", {
      favorites: updatedUser.favorites || [],
    });

    reply.send({
      success: true,
      message: "Produit retiré des favoris",
      data: {
        favorites: updatedUser.favorites || [],
      },
    });
  } catch (error) {
    console.error("Erreur lors de la suppression des favoris:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la suppression des favoris",
      error: error.message,
    });
  }
};
