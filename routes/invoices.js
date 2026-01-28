import {
  generateInvoice,
  downloadInvoice,
} from "../controllers/invoices.js";
import { verifyToken } from "../middleware/auth.js";

export default async function invoicesRoutes(fastify, options) {
  // Générer une facture pour une commande
  fastify.post(
    "/api/invoices/:orderId/generate",
    { preHandler: verifyToken },
    generateInvoice
  );

  // Télécharger le PDF de facture
  fastify.get(
    "/api/invoices/:orderId/download",
    { preHandler: verifyToken },
    downloadInvoice
  );
}

