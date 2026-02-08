import {
  getAllRules,
  createRule,
  updateRule,
  deleteRule,
} from "../../controllers/admin/proMinimumQuantities.js";
import { verifyToken } from "../../middleware/auth.js";

export default async function adminProMinimumQuantitiesRoutes(fastify, options) {
  // Récupérer toutes les règles (admin seulement)
  fastify.get(
    "/admin/pro-minimum-quantities",
    { preHandler: verifyToken },
    getAllRules
  );

  // Créer une nouvelle règle (admin seulement)
  fastify.post(
    "/admin/pro-minimum-quantities",
    { preHandler: verifyToken },
    createRule
  );

  // Mettre à jour une règle (admin seulement)
  fastify.put(
    "/admin/pro-minimum-quantities/:id",
    { preHandler: verifyToken },
    updateRule
  );

  // Supprimer une règle (admin seulement)
  fastify.delete(
    "/admin/pro-minimum-quantities/:id",
    { preHandler: verifyToken },
    deleteRule
  );
}

