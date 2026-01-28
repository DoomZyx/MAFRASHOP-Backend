import {
  getAllStats,
  exportStatsCSV,
} from "../../controllers/admin/stats.js";
import { verifyToken } from "../../middleware/auth.js";

export default async function adminStatsRoutes(fastify, options) {
  // Récupérer toutes les statistiques
  fastify.get(
    "/api/admin/stats",
    { preHandler: verifyToken },
    getAllStats
  );

  // Exporter les statistiques en CSV
  fastify.get(
    "/api/admin/stats/export",
    { preHandler: verifyToken },
    exportStatsCSV
  );
}

