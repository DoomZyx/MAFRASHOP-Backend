import Product from "../../models/products.js";
import StockMovement from "../../models/stockMovements.js";

/**
 * Récupérer tous les produits avec leur stock
 */
export const getAllProductsStock = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const products = await Product.findAll();

    // Calculer les alertes de stock faible
    const productsWithAlerts = products.map((product) => {
      const isLowStock =
        product.stockQuantity <= (product.stockAlertThreshold || 10);
      const isOutOfStock = product.stockQuantity === 0;

      return {
        ...product,
        isLowStock,
        isOutOfStock,
      };
    });

    reply.type("application/json");
    return reply.send({
      success: true,
      data: { products: productsWithAlerts },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du stock:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération du stock",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Mettre à jour le stock d'un produit
 */
export const updateProductStock = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { id } = request.params;
    const { quantity, movementType, reason } = request.body;

    // Validation
    if (quantity === undefined || quantity === null) {
      return reply.code(400).send({
        success: false,
        message: "La quantité est obligatoire",
      });
    }

    const quantityInt = parseInt(quantity, 10);
    if (isNaN(quantityInt)) {
      return reply.code(400).send({
        success: false,
        message: "La quantité doit être un nombre",
      });
    }

    // Récupérer le produit actuel
    const product = await Product.findById(id);
    if (!product) {
      return reply.code(404).send({
        success: false,
        message: "Produit non trouvé",
      });
    }

    const previousQuantity = product.stockQuantity || 0;
    let newQuantity = previousQuantity;

    // Calculer la nouvelle quantité selon le type de mouvement
    const validMovementType = movementType || "adjustment";
    switch (validMovementType) {
      case "entry":
        // Entrée de stock (ajout)
        newQuantity = previousQuantity + Math.abs(quantityInt);
        break;
      case "exit":
        // Sortie de stock (retrait)
        newQuantity = Math.max(0, previousQuantity - Math.abs(quantityInt));
        break;
      case "adjustment":
        // Ajustement direct
        newQuantity = Math.max(0, quantityInt);
        break;
      case "sale":
        // Vente (retrait)
        newQuantity = Math.max(0, previousQuantity - Math.abs(quantityInt));
        break;
      case "return":
        // Retour (ajout)
        newQuantity = previousQuantity + Math.abs(quantityInt);
        break;
      default:
        return reply.code(400).send({
          success: false,
          message: "Type de mouvement invalide",
        });
    }

    // Mettre à jour le stock du produit
    const updatedProduct = await Product.update(id, {
      stock_quantity: newQuantity,
    });

    // Enregistrer le mouvement dans l'historique
    const movement = await StockMovement.create({
      productId: id,
      movementType: validMovementType,
      quantity: quantityInt,
      previousQuantity,
      newQuantity,
      reason: reason || null,
      createdBy: request.user.id,
    });

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Stock mis à jour avec succès",
      data: {
        product: updatedProduct,
        movement,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du stock:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour du stock",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Mettre à jour le seuil d'alerte de stock
 */
export const updateStockAlertThreshold = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { id } = request.params;
    const { stockAlertThreshold } = request.body;

    if (stockAlertThreshold === undefined || stockAlertThreshold === null) {
      return reply.code(400).send({
        success: false,
        message: "Le seuil d'alerte est obligatoire",
      });
    }

    const thresholdInt = parseInt(stockAlertThreshold, 10);
    if (isNaN(thresholdInt) || thresholdInt < 0) {
      return reply.code(400).send({
        success: false,
        message: "Le seuil d'alerte doit être un nombre positif",
      });
    }

    const product = await Product.update(id, {
      stock_alert_threshold: thresholdInt,
    });

    if (!product) {
      return reply.code(404).send({
        success: false,
        message: "Produit non trouvé",
      });
    }

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Seuil d'alerte mis à jour avec succès",
      data: { product },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du seuil d'alerte:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour du seuil d'alerte",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Récupérer l'historique des mouvements de stock
 */
export const getStockHistory = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { productId } = request.query;
    const limit = parseInt(request.query.limit || "100", 10);
    const offset = parseInt(request.query.offset || "0", 10);

    const movements = await StockMovement.findAll(
      limit,
      offset,
      productId || null
    );
    const total = await StockMovement.count(productId || null);

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        movements,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de l'historique:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération de l'historique",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Récupérer les produits en stock faible
 */
export const getLowStockProducts = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const products = await Product.findAll();

    // Filtrer les produits en stock faible
    const lowStockProducts = products
      .filter((product) => {
        const threshold = product.stockAlertThreshold || 10;
        return product.stockQuantity <= threshold;
      })
      .map((product) => ({
        ...product,
        isLowStock: true,
        isOutOfStock: product.stockQuantity === 0,
      }));

    reply.type("application/json");
    return reply.send({
      success: true,
      data: { products: lowStockProducts },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des produits en stock faible:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des produits en stock faible",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

