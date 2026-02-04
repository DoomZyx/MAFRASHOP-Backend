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
 * Exportée pour l'export ZIP admin (factures par mois/année).
 */
export async function generateInvoicePDF(invoice, order, items, user) {
  // Calculer les totaux
  const totalHT = items.reduce((sum, item) => sum + item.totalPrice, 0);
  
  // Déterminer le taux de TVA selon le statut de validation TVA intracommunautaire
  const hasValidatedVat = user.company?.vatStatus === "validated";
  const TVA_RATE = hasValidatedVat ? 0 : 0.2; // 0% si TVA UE validée, sinon 20%
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
  doc.fontSize(10).font("Helvetica");
  doc.text(`N° Facture: ${invoice.invoiceNumber}`, 50, 70);
  doc.text(`N° Commande: ${order.id}`, 50, 82);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString("fr-FR")}`, 50, 94);

  // Informations entreprise (à personnaliser)
  doc.fontSize(10).font("Helvetica-Bold").text("MAFRASHOP", 400, 50);
  doc.fontSize(9).font("Helvetica");
  doc.text("20 rue des ponts", 400, 65);
  doc.text("57300, Mondelange", 400, 77);
  doc.text("France", 400, 89);
  doc.text("SIRET: [À compléter]", 400, 101);
  doc.text("TVA: [À compléter]", 400, 113);

  // Informations client
  let clientY = 130;
  doc.fontSize(12).font("Helvetica-Bold").text("Facturé à:", 50, clientY);
  doc.fontSize(10).font("Helvetica");
  clientY += 15;
  doc.text(`${user.firstName} ${user.lastName}`, 50, clientY);
  if (user.company?.name) {
    clientY += 12;
    doc.text(user.company.name, 50, clientY);
    clientY += 12;
    doc.text(user.email, 50, clientY);
    if (user.company.siret) {
      clientY += 12;
      doc.text(`SIRET: ${user.company.siret}`, 50, clientY);
    }
    if (hasValidatedVat && user.company.vatNumber) {
      clientY += 12;
      doc.text(`N° TVA: ${user.company.vatNumber}`, 50, clientY);
    }
  } else {
    clientY += 12;
    doc.text(user.email, 50, clientY);
    if (user.address) {
      clientY += 12;
      doc.text(user.address, 50, clientY);
      if (user.zipCode && user.city) {
        clientY += 12;
        doc.text(`${user.zipCode} ${user.city}`, 50, clientY);
      }
    }
  }

  // Adresse de livraison si différente
  if (order.shippingAddress) {
    let shippingY = 130;
    doc.fontSize(12).font("Helvetica-Bold").text("Livré à:", 300, shippingY);
    doc.fontSize(10).font("Helvetica");
    const shipping = order.shippingAddress;
    shippingY += 15;
    if (shipping.name) {
      doc.text(shipping.name, 300, shippingY);
      shippingY += 12;
    }
    if (shipping.line1) {
      doc.text(shipping.line1, 300, shippingY);
      shippingY += 12;
    }
    if (shipping.line2) {
      doc.text(shipping.line2, 300, shippingY);
      shippingY += 12;
    }
    if (shipping.postal_code && shipping.city) {
      doc.text(`${shipping.postal_code} ${shipping.city}`, 300, shippingY);
      shippingY += 12;
    }
    if (shipping.country) {
      doc.text(shipping.country, 300, shippingY);
    }
  }

  // Tableau des items
  let y = Math.max(clientY, order.shippingAddress ? 200 : clientY) + 20;
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
    const textHeight = doc.heightOfString(description, { width: maxWidth });
    const lineHeight = Math.max(14, textHeight);
    
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
    
    y += lineHeight;
  });

  y += 8;
  doc.moveTo(50, y).lineTo(550, y).stroke();
  y += 12;

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

  y += 14;
  if (hasValidatedVat) {
    doc.text("TVA (0% - Autoliquidation):", 400, y);
  } else {
    doc.text("TVA (20%):", 400, y);
  }
  doc.text(
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(totalTVA),
    480,
    y
  );

  const deliveryFee = order.deliveryFee != null ? parseFloat(order.deliveryFee) : 0;
  if (deliveryFee > 0) {
    y += 14;
    doc.fontSize(10).font("Helvetica");
    doc.text("Frais de livraison:", 400, y);
    doc.text(
      new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(deliveryFee),
      480,
      y
    );
  }

  y += 14;
  doc.fontSize(12).font("Helvetica-Bold");
  doc.text("Total TTC:", 400, y);
  doc.text(
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(parseFloat(order.totalAmount)),
    480,
    y
  );

  // Mention TVA intracommunautaire si applicable
  if (hasValidatedVat && user.company?.vatNumber) {
    y += 20;
    doc.fontSize(9).font("Helvetica-Oblique");
    doc.text(
      "TVA intracommunautaire - Autoliquidation par le client",
      50,
      y,
      { width: 500, align: "center" }
    );
    y += 12;
    doc.text(
      `N° TVA intracommunautaire du client: ${user.company.vatNumber}`,
      50,
      y,
      { width: 500, align: "center" }
    );
  }

  // Informations de paiement
  y += 25;
  doc.fontSize(9).font("Helvetica");
  doc.text("Paiement effectué via Stripe", 50, y);
  if (order.stripePaymentIntentId) {
    doc.text(`Payment Intent: ${order.stripePaymentIntentId}`, 50, y + 12);
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

    // Supprimer l'ancien PDF s'il existe pour forcer la régénération avec le nouveau format
    if (invoice.pdfPath && fs.existsSync(invoice.pdfPath)) {
      try {
        fs.unlinkSync(invoice.pdfPath);
      } catch (error) {
        console.warn("Impossible de supprimer l'ancien PDF:", error.message);
      }
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
        pdfPath: path.basename(pdfPath),
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

    // Supprimer l'ancien PDF s'il existe pour forcer la régénération avec le nouveau format
    if (invoice.pdfPath && fs.existsSync(invoice.pdfPath)) {
      try {
        fs.unlinkSync(invoice.pdfPath);
      } catch (error) {
        console.warn("Impossible de supprimer l'ancien PDF:", error.message);
      }
    }

    // Toujours régénérer le PDF pour s'assurer qu'il est à jour
    const items = await Order.findOrderItems(orderId);
    const user = await User.findById(order.userId);
    const pdfPath = await generateInvoicePDF(invoice, order, items, user);
    await Invoice.updatePdfPath(invoice.id, pdfPath);
    invoice.pdfPath = pdfPath;

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

