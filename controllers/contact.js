import nodemailer from "nodemailer";
import "../loadEnv.js";

/**
 * Configuration du transporteur email
 * Utilise les variables d'environnement pour la configuration SMTP
 */
const createTransporter = () => {
  // Vérifier que les variables d'environnement sont définies
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error(
      "Configuration SMTP manquante. Vérifiez SMTP_HOST, SMTP_USER et SMTP_PASS dans .env"
    );
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true", // true pour 465, false pour autres ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Envoyer un email de contact depuis le formulaire SAV
 */
export const sendContactEmail = async (request, reply) => {
  try {
    const { orderNumber, email, subject, message } = request.body;

    // Validation des champs requis
    if (!orderNumber || !email || !subject || !message) {
      return reply.code(400).send({
        success: false,
        message: "Tous les champs sont requis",
      });
    }

    // Validation de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.code(400).send({
        success: false,
        message: "Format d'email invalide",
      });
    }

    // Créer le transporteur
    const transporter = createTransporter();

    // Email de destination (celui qui recevra les messages)
    const recipientEmail = process.env.CONTACT_EMAIL || process.env.SMTP_USER;

    // Mapper les sujets pour un affichage plus lisible
    const subjectMap = {
      produit: "Question sur un produit",
      commande: "Suivi de commande",
      livraison: "Question sur la livraison",
      defaut: "Produit défectueux",
      retour: "Demande de retour",
      facturation: "Question de facturation",
      autre: "Autre demande",
    };

    const subjectLabel = subjectMap[subject] || subject;

    // Contenu de l'email
    const mailOptions = {
      from: `"MAFRASHOP Contact" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      replyTo: email,
      subject: `[Contact SAV] ${subjectLabel} - Commande ${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #059669; padding-bottom: 10px;">
            Nouveau message de contact
          </h2>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #059669; margin-top: 0;">Informations du client</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Numéro de commande:</strong> ${orderNumber}</p>
            <p><strong>Sujet:</strong> ${subjectLabel}</p>
          </div>

          <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #059669; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Message</h3>
            <p style="white-space: pre-wrap; line-height: 1.6;">${message.replace(/\n/g, "<br>")}</p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
            <p>Ce message a été envoyé depuis le formulaire de contact du site MAFRASHOP.</p>
            <p>Vous pouvez répondre directement à cet email pour contacter le client.</p>
          </div>
        </div>
      `,
      text: `
Nouveau message de contact

Informations du client:
- Email: ${email}
- Numéro de commande: ${orderNumber}
- Sujet: ${subjectLabel}

Message:
${message}
      `,
    };

    // Envoyer l'email
    await transporter.sendMail(mailOptions);

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Votre message a été envoyé avec succès. Nous vous répondrons sous 48h ouvrées.",
    });
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email:", error);

    // Gérer les erreurs spécifiques
    if (error.message.includes("Configuration SMTP")) {
      return reply.code(500).send({
        success: false,
        message: "Erreur de configuration serveur. Veuillez contacter l'administrateur.",
      });
    }

    if (error.code === "EAUTH" || error.code === "ECONNECTION") {
      return reply.code(500).send({
        success: false,
        message: "Erreur d'authentification email. Veuillez réessayer plus tard.",
      });
    }

    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de l'envoi du message. Veuillez réessayer plus tard.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

