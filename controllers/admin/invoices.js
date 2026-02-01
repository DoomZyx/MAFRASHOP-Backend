import archiver from "archiver";
import fs from "fs";
import path from "path";
import Order from "../../models/orders.js";
import Invoice from "../../models/invoices.js";
import User from "../../models/user.js";
import { generateInvoicePDF } from "../invoices.js";

/**
 * Exporte toutes les factures des commandes payées pour un mois/année donnés en ZIP (admin seulement).
 * GET /api/admin/invoices/export?month=1&year=2025
 */
export const downloadInvoicesZip = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const month = parseInt(request.query.month, 10);
    const year = parseInt(request.query.year, 10);

    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100
    ) {
      return reply.code(400).send({
        success: false,
        message: "Paramètres invalides: month (1-12) et year (2000-2100) requis",
      });
    }

    const invoices = await Invoice.findByMonthYear(month, year);

    if (invoices.length === 0) {
      reply.type("application/json");
      return reply.send({
        success: true,
        message: "Aucune facture pour cette période",
        data: { count: 0 },
      });
    }

    // S'assurer que chaque facture a un PDF (générer si absent)
    for (const invoice of invoices) {
      if (!invoice.pdfPath || !fs.existsSync(invoice.pdfPath)) {
        const order = await Order.findById(invoice.orderId);
        const items = await Order.findOrderItems(invoice.orderId);
        const user = await User.findById(order.userId);
        const pdfPath = await generateInvoicePDF(invoice, order, items, user);
        await Invoice.updatePdfPath(invoice.id, pdfPath);
        invoice.pdfPath = pdfPath;
      }
    }

    const zipFileName = `factures-${year}-${String(month).padStart(2, "0")}.zip`;
    reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${zipFileName}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("Erreur archiver:", err);
      if (!reply.sent) {
        reply.code(500).send({
          success: false,
          message: "Erreur lors de la création du fichier ZIP",
        });
      }
    });

    archive.pipe(reply.raw);

    for (const invoice of invoices) {
      if (invoice.pdfPath && fs.existsSync(invoice.pdfPath)) {
        archive.file(invoice.pdfPath, {
          name: path.basename(invoice.pdfPath),
        });
      }
    }

    archive.finalize();
  } catch (error) {
    console.error("Erreur export factures ZIP:", error);
    if (!reply.sent) {
      reply.type("application/json");
      return reply.code(500).send({
        success: false,
        message: "Erreur lors de l'export des factures",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
};
