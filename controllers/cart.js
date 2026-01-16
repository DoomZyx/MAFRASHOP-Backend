import Cart from "../models/cart.js";
import Product from "../models/products.js";
import { sendToUser } from "../app.js";

export const getCart = async (request, reply) => {
  try {
    const cart = await Cart.findByUserId(request.user.id);

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        cart: cart || [],
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du panier:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération du panier",
    });
  }
};

export const addToCart = async (request, reply) => {
  try {
    const { productId, quantity = 1 } = request.body;

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

    const cart = await Cart.addItem(request.user.id, productId, quantity);

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user.id.toString(), "cart:updated", {
      cart: cart,
    });

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Produit ajouté au panier",
      data: {
        cart: cart,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout au panier:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de l'ajout au panier",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateCartItem = async (request, reply) => {
  try {
    const { productId } = request.params;
    const { quantity } = request.body;

    if (!quantity || quantity < 1) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: "La quantité doit être supérieure à 0",
      });
    }

    const cart = await Cart.updateQuantity(
      request.user.id,
      productId,
      quantity
    );

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user.id.toString(), "cart:updated", {
      cart: cart,
    });

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Panier mis à jour",
      data: {
        cart: cart,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du panier:", error);
    reply.type("application/json");
    
    if (error.message === "Produit non trouvé dans le panier") {
      return reply.code(404).send({
        success: false,
        message: error.message,
      });
    }

    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour du panier",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const removeFromCart = async (request, reply) => {
  try {
    const { productId } = request.params;

    if (!productId) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: "ID du produit requis",
      });
    }

    const cart = await Cart.removeItem(request.user.id, productId);

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user.id.toString(), "cart:updated", {
      cart: cart,
    });

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Produit retiré du panier",
      data: {
        cart: cart,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du panier:", error);
    reply.type("application/json");
    
    if (error.message === "Produit non trouvé dans le panier") {
      return reply.code(404).send({
        success: false,
        message: error.message,
      });
    }

    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la suppression du panier",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const clearCart = async (request, reply) => {
  try {
    await Cart.clear(request.user.id);

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user.id.toString(), "cart:updated", {
      cart: [],
    });

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Panier vidé",
    });
  } catch (error) {
    console.error("Erreur lors du vidage du panier:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors du vidage du panier",
    });
  }
};