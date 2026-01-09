import User from "../models/user.js";
import Product from "../models/products.js";
import mongoose from "mongoose";
import { sendToUser } from "../app.js";

export const getCart = async (request, reply) => {
  try {
    const user = await User.findById(request.user._id).populate(
      "cart.productId"
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
        cart: user.cart || [],
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du panier:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération du panier",
    });
  }
};

export const addToCart = async (request, reply) => {
  try {
    const { productId, quantity = 1 } = request.body;

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

    const existingItemIndex = user.cart.findIndex(
      (item) => item.productId && item.productId.toString() === productId
    );

    if (existingItemIndex !== -1) {
      user.cart[existingItemIndex].quantity += quantity;
    } else {
      user.cart.push({
        productId: productId,
        quantity: quantity,
      });
    }

    await user.save();

    // Envoyer une mise à jour WebSocket
    const updatedUser = await User.findById(request.user._id).populate(
      "cart.productId"
    );
    if (updatedUser) {
      sendToUser(request.user._id.toString(), "cart:updated", {
        cart: updatedUser.cart,
      });
    }

    reply.send({
      success: true,
      message: "Produit ajouté au panier",
      data: {
        cart: user.cart,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout au panier:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors de l'ajout au panier",
    });
  }
};

export const updateCartItem = async (request, reply) => {
  try {
    const { productId } = request.params;
    const { quantity } = request.body;

    if (!quantity || quantity < 1) {
      return reply.code(400).send({
        success: false,
        message: "La quantité doit être supérieure à 0",
      });
    }

    const user = await User.findById(request.user._id);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    const itemIndex = user.cart.findIndex(
      (item) => item.productId && item.productId.toString() === productId
    );

    if (itemIndex === -1) {
      return reply.code(404).send({
        success: false,
        message: "Produit non trouvé dans le panier",
      });
    }

    user.cart[itemIndex].quantity = quantity;
    await user.save();

    // Envoyer une mise à jour WebSocket
    const updatedUser = await User.findById(request.user._id).populate(
      "cart.productId"
    );
    if (updatedUser) {
      sendToUser(request.user._id.toString(), "cart:updated", {
        cart: updatedUser.cart,
      });
    }

    reply.send({
      success: true,
      message: "Panier mis à jour",
      data: {
        cart: user.cart,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du panier:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour du panier",
    });
  }
};

export const removeFromCart = async (request, reply) => {
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

    const initialLength = user.cart.length;
    const productObjectId = new mongoose.Types.ObjectId(productId);

    // @ts-ignore - Mongoose DocumentArray type limitation
    const filteredCart = user.cart.filter((item) => {
      if (!item.productId) return true;
      const itemProductId =
        item.productId instanceof mongoose.Types.ObjectId
          ? item.productId
          : new mongoose.Types.ObjectId(String(item.productId));
      return !itemProductId.equals(productObjectId);
    });

    // @ts-ignore - Mongoose DocumentArray type limitation
    user.cart = filteredCart;

    if (user.cart.length === initialLength) {
      return reply.code(404).send({
        success: false,
        message: "Produit non trouvé dans le panier",
      });
    }

    await user.save();

    const updatedUser = await User.findById(request.user._id).populate(
      "cart.productId"
    );

    if (!updatedUser) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable après mise à jour",
      });
    }

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user._id.toString(), "cart:updated", {
      cart: updatedUser.cart || [],
    });

    reply.send({
      success: true,
      message: "Produit retiré du panier",
      data: {
        cart: updatedUser.cart || [],
      },
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du panier:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la suppression du panier",
      error: error.message,
    });
  }
};

export const clearCart = async (request, reply) => {
  try {
    const user = await User.findById(request.user._id);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    // @ts-ignore - Mongoose DocumentArray type limitation
    user.cart = [];
    await user.save();

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user._id.toString(), "cart:updated", {
      cart: [],
    });

    reply.send({
      success: true,
      message: "Panier vidé",
    });
  } catch (error) {
    console.error("Erreur lors du vidage du panier:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors du vidage du panier",
    });
  }
};
