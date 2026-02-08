import ProMinimumQuantity from "../../models/proMinimumQuantities.js";

/**
 * Récupérer toutes les règles de quantité minimale (admin seulement)
 */
export const getAllRules = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      reply.type("application/json");
      return reply.code(403).send({
        success: false,
        message: "Accès refusé. Admin seulement.",
      });
    }

    const rules = await ProMinimumQuantity.findAll();

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        rules: rules,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des règles:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des règles",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Créer une nouvelle règle de quantité minimale (admin seulement)
 */
export const createRule = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      reply.type("application/json");
      return reply.code(403).send({
        success: false,
        message: "Accès refusé. Admin seulement.",
      });
    }

    const { productId, minimumQuantity } = request.body;

    // Validation
    if (!productId || !minimumQuantity) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: "productId et minimumQuantity sont requis",
      });
    }

    const parsedQuantity = parseInt(minimumQuantity, 10);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      reply.type("application/json");
      return reply.code(400).send({
        success: false,
        message: "minimumQuantity doit être un nombre positif",
      });
    }

    const rule = await ProMinimumQuantity.create({
      productId,
      minimumQuantity: parsedQuantity,
    });

    reply.type("application/json");
    return reply.code(201).send({
      success: true,
      message: "Règle créée avec succès",
      data: {
        rule: rule,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la création de la règle:", error);
    reply.type("application/json");
    
    // Gérer les erreurs de contrainte unique
    if (error.message && error.message.includes("UNIQUE")) {
      return reply.code(409).send({
        success: false,
        message: "Une règle existe déjà pour ce produit",
      });
    }
    
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la création de la règle",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Mettre à jour une règle de quantité minimale (admin seulement)
 */
export const updateRule = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      reply.type("application/json");
      return reply.code(403).send({
        success: false,
        message: "Accès refusé. Admin seulement.",
      });
    }

    const { id } = request.params;
    const { productId, minimumQuantity } = request.body;

    // Validation
    if (minimumQuantity !== undefined) {
      const parsedQuantity = parseInt(minimumQuantity, 10);
      if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
        reply.type("application/json");
        return reply.code(400).send({
          success: false,
          message: "minimumQuantity doit être un nombre positif",
        });
      }
    }

    const rule = await ProMinimumQuantity.update(id, {
      productId: productId ? parseInt(productId, 10) : undefined,
      minimumQuantity: minimumQuantity ? parseInt(minimumQuantity, 10) : undefined,
    });

    if (!rule) {
      reply.type("application/json");
      return reply.code(404).send({
        success: false,
        message: "Règle introuvable",
      });
    }

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Règle mise à jour avec succès",
      data: {
        rule: rule,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la règle:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour de la règle",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Supprimer une règle de quantité minimale (admin seulement)
 */
export const deleteRule = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      reply.type("application/json");
      return reply.code(403).send({
        success: false,
        message: "Accès refusé. Admin seulement.",
      });
    }

    const { id } = request.params;

    const deleted = await ProMinimumQuantity.delete(id);

    if (!deleted) {
      reply.type("application/json");
      return reply.code(404).send({
        success: false,
        message: "Règle introuvable",
      });
    }

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Règle supprimée avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la règle:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la suppression de la règle",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

