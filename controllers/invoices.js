import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Order from "../models/orders.js";
import Invoice from "../models/invoices.js";
import User from "../models/user.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Créer le dossier invoices s'il n'existe pas
const invoicesDir = path.join(__dirname, "..", "invoices");
if (!fs.existsSync(invoicesDir)) {
  fs.mkdirSync(invoicesDir, { recursive: true });
}

/**
 * Fonction utilitaire pour générer le PDF (réutilisable)
 */
async function generateInvoicePDF(invoice, order, items, user) {
  // Calculer les totaux
  const totalHT = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const TVA_RATE = 0.2; // 20% - appliqué à tous (particuliers et pros)
  const totalTVA = totalHT * TVA_RATE;
  const totalTTC = totalHT + totalTVA;

  // Générer le PDF
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const pdfFileName = `invoice-${invoice.invoiceNumber}.pdf`;
  const pdfPath = path.join(invoicesDir, pdfFileName);
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  // En-tête
  doc.fontSize(20).font("Helvetica-Bold").text("FACTURE", 50, 50);
  doc.fontSize(10).font("Helvetica").text(`N° ${invoice.invoiceNumber}`, 50, 75);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString("fr-FR")}`, 50, 90);

  // Informations entreprise (à personnaliser)
  doc.fontSize(10).font("Helvetica-Bold").text("MAFRASHOP", 400, 50);
  doc.fontSize(9).font("Helvetica");
  doc.text("Adresse de l'entreprise", 400, 70);
  doc.text("Code postal, Ville", 400, 85);
  doc.text("France", 400, 100);
  doc.text("SIRET: [À compléter]", 400, 115);
  doc.text("TVA: [À compléter]", 400, 130);

  // Informations client
  doc.fontSize(12).font("Helvetica-Bold").text("Facturé à:", 50, 160);
  doc.fontSize(10).font("Helvetica");
  doc.text(`${user.firstName} ${user.lastName}`, 50, 180);
  doc.text(user.email, 50, 195);
  if (user.address) {
    doc.text(user.address, 50, 210);
    if (user.zipCode && user.city) {
      doc.text(`${user.zipCode} ${user.city}`, 50, 225);
    }
  }

  // Adresse de livraison si différente
  if (order.shippingAddress) {
    doc.fontSize(12).font("Helvetica-Bold").text("Livré à:", 300, 160);
    doc.fontSize(10).font("Helvetica");
    const shipping = order.shippingAddress;
    if (shipping.name) doc.text(shipping.name, 300, 180);
    if (shipping.line1) doc.text(shipping.line1, 300, 195);
    if (shipping.line2) doc.text(shipping.line2, 300, 210);
    if (shipping.postal_code && shipping.city) {
      doc.text(`${shipping.postal_code} ${shipping.city}`, 300, 225);
    }
    if (shipping.country) doc.text(shipping.country, 300, 240);
  }

  // Tableau des items
  let y = 280;
  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Description", 50, y);
  doc.text("Qté", 350, y);
  doc.text("Prix unit.", 400, y);
  doc.text("Total", 480, y);

  y += 20;
  doc.moveTo(50, y).lineTo(550, y).stroke();
  y += 10;

  doc.fontSize(9).font("Helvetica");
  items.forEach((item) => {
    const itemName = item.productName || "Produit";
    const itemRef = item.productRef ? ` (${item.productRef})` : "";
    const description = `${itemName}${itemRef}`;
    
    // Gérer le retour à la ligne si description trop longue
    const maxWidth = 280;
    const lines = doc.heightOfString(description, { width: maxWidth });
    
    doc.text(description, 50, y, { width: maxWidth });
    doc.text(item.quantity.toString(), 350, y);
    doc.text(
      new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(item.unitPrice),
      400,
      y
    );
    doc.text(
      new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(item.totalPrice),
      480,
      y
    );
    
    y += Math.max(20, lines * 15);
  });

  y += 10;
  doc.moveTo(50, y).lineTo(550, y).stroke();
  y += 20;

  // Totaux
  doc.fontSize(10).font("Helvetica");
  doc.text("Sous-total HT:", 400, y);
  doc.text(
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(totalHT),
    480,
    y
  );

  y += 20;
  doc.text("TVA (20%):", 400, y);
  doc.text(
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(totalTVA),
    480,
    y
  );

  y += 20;
  doc.fontSize(12).font("Helvetica-Bold");
  doc.text("Total TTC:", 400, y);
  doc.text(
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(totalTTC),
    480,
    y
  );

  // Informations de paiement
  y += 40;
  doc.fontSize(9).font("Helvetica");
  doc.text("Paiement effectué via Stripe", 50, y);
  if (order.stripePaymentIntentId) {
    doc.text(`Payment Intent: ${order.stripePaymentIntentId}`, 50, y + 15);
  }

  // Pied de page
  const pageHeight = doc.page.height;
  doc.fontSize(8).font("Helvetica");
  doc.text(
    "Merci pour votre achat !",
    50,
    pageHeight - 50,
    { align: "center", width: 500 }
  );

  // Finaliser le PDF
  doc.end();

  // Attendre que le stream soit terminé
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return pdfPath;
}

/**
 * Génère un PDF de facture pour une commande
 */
export const generateInvoice = async (request, reply) => {
  try {
    const { orderId } = request.params;
    const userId = request.user.id;

    // Récupérer la commande avec les items
    const order = await Order.findById(orderId);
    if (!order) {
      return reply.code(404).send({
        success: false,
        message: "Commande non trouvée",
      });
    }

    // Vérifier que la commande appartient à l'utilisateur
    if (order.userId !== userId.toString() && request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès non autorisé",
      });
    }

    // Vérifier que la commande est payée
    if (order.status !== "paid") {
      return reply.code(400).send({
        success: false,
        message: "La commande doit être payée pour générer une facture",
      });
    }

    // Récupérer ou créer la facture
    let invoice = await Invoice.findByOrderId(orderId);
    if (!invoice) {
      invoice = await Invoice.createFromOrder(orderId);
    }

    // Récupérer les items de la commande
    const items = await Order.findOrderItems(orderId);

    // Récupérer les informations utilisateur
    const user = await User.findById(order.userId);

    // Générer le PDF
    const pdfPath = await generateInvoicePDF(invoice, order, items, user);

    // Mettre à jour le chemin du PDF dans la base
    await Invoice.updatePdfPath(invoice.id, pdfPath);

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Facture générée avec succès",
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        pdfPath: pdfFileName,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la génération de la facture:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la génération de la facture",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Télécharge le PDF de facture
 */
export const downloadInvoice = async (request, reply) => {
  try {
    const { orderId } = request.params;
    const userId = request.user.id;

    // Récupérer la commande
    const order = await Order.findById(orderId);
    if (!order) {
      return reply.code(404).send({
        success: false,
        message: "Commande non trouvée",
      });
    }

    // Vérifier que la commande appartient à l'utilisateur
    if (order.userId !== userId.toString() && request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès non autorisé",
      });
    }

    // Récupérer ou créer la facture
    let invoice = await Invoice.findByOrderId(orderId);
    
    if (!invoice) {
      invoice = await Invoice.createFromOrder(orderId);
    }

    // Si le PDF n'existe pas, le générer
    if (!invoice.pdfPath || !fs.existsSync(invoice.pdfPath)) {
      const items = await Order.findOrderItems(orderId);
      const user = await User.findById(order.userId);
      const pdfPath = await generateInvoicePDF(invoice, order, items, user);
      await Invoice.updatePdfPath(invoice.id, pdfPath);
      invoice.pdfPath = pdfPath;
    }

    // Envoyer le fichier
    const pdfFileName = path.basename(invoice.pdfPath);
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="${pdfFileName}"`)
      .send(fs.createReadStream(invoice.pdfPath));
  } catch (error) {
    console.error("Erreur lors du téléchargement de la facture:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors du téléchargement de la facture",
    });
  }
};

