import {
  getDashboardStats,
  getAllStats,
  exportStatsCSV,
} from "../../controllers/admin/stats.js";
import { verifyToken } from "../../middleware/auth.js";

export default async function adminStatsRoutes(fastify, options) {
  // Statistiques dashboard (commandes mois en cours, livraisons en attente)
  fastify.get(
    "/admin/stats/dashboard",
    { preHandler: verifyToken },
    getDashboardStats
  );

  // Récupérer toutes les statistiques
  fastify.get(
    "/admin/stats",
    { preHandler: verifyToken },
    getAllStats
  );

  // Exporter les statistiques en CSV
  fastify.get(
    "/admin/stats/export",
    { preHandler: verifyToken },
    exportStatsCSV
  );
}

