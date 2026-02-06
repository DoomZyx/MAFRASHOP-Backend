import { downloadInvoicesZip } from "../../controllers/admin/invoices.js";
import { verifyToken, isAdmin } from "../../middleware/auth.js";

export default async function adminInvoicesRoutes(fastify, options) {
  // Export ZIP des factures par mois/année (admin seulement)
  fastify.get(
    "/admin/invoices/export",
    { preHandler: [verifyToken, isAdmin] },
    downloadInvoicesZip
  );
}
