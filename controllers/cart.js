import Cart from "../models/cart.js";
import Product from "../models/products.js";
import ProMinimumQuantity from "../models/proMinimumQuantities.js";
import { validatePerfumeMinimum } from "../utils/perfumeValidation.js";
import { sendToUser } from "../app.js";

export const getCart = async (request, reply) => {
  try {
    const cart = await Cart.findByUserId(request.user.id);
    const cartItems = cart || [];

    // Validation parfums (minimum 6) : uniquement pour les professionnels
    const perfumeValidation = request.user.isPro
      ? validatePerfumeMinimum(cartItems)
      : { isValid: true, totalCount: 0, missing: 0, message: null, minimumRequired: 6 };

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        cart: cartItems,
        perfumeValidation: perfumeValidation,
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

    // VALIDATION SÉCURITÉ : Vérifier les types et valeurs
    if (!productId) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: "ID du produit requis",
      });
    }

    // Protection contre valeurs invalides
    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > 10000) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: "Quantité invalide. Doit être entre 1 et 10000",
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

    // VÉRIFICATION QUANTITÉ MINIMALE POUR PROS
    // Si l'utilisateur est professionnel, ajuster automatiquement la quantité
    let adjustedQuantity = parsedQuantity;
    if (request.user.isPro) {
      const minimumQuantityRule = await ProMinimumQuantity.findByProductId(productId);

      if (minimumQuantityRule) {
        const existingCartItem = await Cart.findItemByUserAndProduct(request.user.id, productId);
        const currentQuantityInCart = existingCartItem ? existingCartItem.quantity : 0;
        const requestedTotalQuantity = currentQuantityInCart + parsedQuantity;

        // Ajuster automatiquement la quantité pour respecter la règle
        if (requestedTotalQuantity % minimumQuantityRule.minimumQuantity !== 0) {
          // Calculer la quantité totale valide (multiple de la quantité minimale)
          const nextValidTotalQuantity = Math.ceil(requestedTotalQuantity / minimumQuantityRule.minimumQuantity) * minimumQuantityRule.minimumQuantity;
          // Calculer la quantité à ajouter pour atteindre cette quantité totale valide
          adjustedQuantity = nextValidTotalQuantity - currentQuantityInCart;
        }
      }
    }

    // VÉRIFICATION STOCK : Vérifier que le stock est suffisant
    const existingCartItem = await Cart.findItemByUserAndProduct(request.user.id, productId);
    const currentQuantityInCart = existingCartItem ? existingCartItem.quantity : 0;
    const requestedTotalQuantity = currentQuantityInCart + adjustedQuantity;

    if (product.stockQuantity < requestedTotalQuantity) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: `Stock insuffisant. Stock disponible : ${product.stockQuantity}, Quantité demandée : ${requestedTotalQuantity}`,
        availableStock: product.stockQuantity,
        requestedQuantity: requestedTotalQuantity,
      });
    }

    const cart = await Cart.addItem(request.user.id, productId, adjustedQuantity);

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user.id.toString(), "cart:updated", {
      cart: cart,
    });

    reply.type("application/json");
    const message = adjustedQuantity !== parsedQuantity && request.user.isPro
      ? `Produit ajouté au panier (quantité ajustée à ${adjustedQuantity} pour respecter la règle de quantité minimale)`
      : "Produit ajouté au panier";
    
    return reply.send({
      success: true,
      message: message,
      data: {
        cart: cart,
        quantityAdded: adjustedQuantity,
        quantityRequested: parsedQuantity,
        wasAdjusted: adjustedQuantity !== parsedQuantity,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout au panier:", error);
    reply.type("application/json");
    
    // Panier verrouillé (commande pending)
    if (error.message && error.message.includes("commande est en cours")) {
      return reply.code(409).send({
        success: false,
        message: error.message,
      });
    }
    
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

    // VALIDATION SÉCURITÉ : Vérifier les types et valeurs
    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > 10000) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: "Quantité invalide. Doit être entre 1 et 10000",
      });
    }

    // Vérifier que le produit existe et que le stock est suffisant
    const product = await Product.findById(productId);
    if (!product) {
      reply.type("application/json");
      return reply.code(404).send({
        success: false,
        message: "Produit introuvable",
      });
    }

    // VÉRIFICATION QUANTITÉ MINIMALE POUR PROS
    // Si l'utilisateur est professionnel, ajuster automatiquement la quantité
    let adjustedQuantity = parsedQuantity;
    if (request.user.isPro) {
      const minimumQuantityRule = await ProMinimumQuantity.findByProductId(productId);

      if (minimumQuantityRule) {
        // Récupérer la quantité actuelle dans le panier pour savoir si on incrémente ou décrémente
        const existingCartItem = await Cart.findItemByUserAndProduct(request.user.id, productId);
        const currentQuantityInCart = existingCartItem ? existingCartItem.quantity : 0;
        
        // Ajuster automatiquement la quantité pour respecter la règle
        if (parsedQuantity % minimumQuantityRule.minimumQuantity !== 0) {
          if (parsedQuantity < currentQuantityInCart) {
            // Décrémentation : arrondir vers le bas au multiple inférieur
            adjustedQuantity = Math.floor(parsedQuantity / minimumQuantityRule.minimumQuantity) * minimumQuantityRule.minimumQuantity;
            // S'assurer qu'on ne descende pas en dessous de la quantité minimale
            if (adjustedQuantity < minimumQuantityRule.minimumQuantity) {
              adjustedQuantity = minimumQuantityRule.minimumQuantity;
            }
          } else {
            // Incrémentation : arrondir vers le haut au multiple supérieur
            adjustedQuantity = Math.ceil(parsedQuantity / minimumQuantityRule.minimumQuantity) * minimumQuantityRule.minimumQuantity;
          }
        }
      }
    }

    // VÉRIFICATION STOCK : Vérifier que le stock est suffisant
    if (product.stockQuantity < adjustedQuantity) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: `Stock insuffisant. Stock disponible : ${product.stockQuantity}, Quantité demandée : ${adjustedQuantity}`,
        availableStock: product.stockQuantity,
        requestedQuantity: adjustedQuantity,
      });
    }

    const cart = await Cart.updateQuantity(
      request.user.id,
      productId,
      adjustedQuantity
    );

    // Envoyer une mise à jour WebSocket
    sendToUser(request.user.id.toString(), "cart:updated", {
      cart: cart,
    });

    reply.type("application/json");
    const message = adjustedQuantity !== parsedQuantity && request.user.isPro
      ? `Panier mis à jour (quantité ajustée à ${adjustedQuantity} pour respecter la règle de quantité minimale)`
      : "Panier mis à jour";
    
    return reply.send({
      success: true,
      message: message,
      data: {
        cart: cart,
        quantitySet: adjustedQuantity,
        quantityRequested: parsedQuantity,
        wasAdjusted: adjustedQuantity !== parsedQuantity,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du panier:", error);
    reply.type("application/json");
    
    // Panier verrouillé (commande pending)
    if (error.message && error.message.includes("commande est en cours")) {
      return reply.code(409).send({
        success: false,
        message: error.message,
      });
    }
    
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
    
    // Panier verrouillé (commande pending)
    if (error.message && error.message.includes("commande est en cours")) {
      return reply.code(409).send({
        success: false,
        message: error.message,
      });
    }
    
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