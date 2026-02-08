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
 * Génère le template HTML pour une réponse au client
 */
const generateResponseEmailTemplate = (responseMessage, originalSubject, orderNumber) => {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Réponse à votre demande</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #27292a 0%, #3a3c3d 100%); padding: 30px 40px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">
                    Réponse à votre demande
                  </h1>
                  <div style="width: 100px; height: 4px; background: #d32f2f; margin: 15px auto 0;"></div>
                </td>
              </tr>

              <!-- Message de réponse -->
              <tr>
                <td style="padding: 30px 40px;">
                  ${orderNumber ? `
                  <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid #059669; padding: 15px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <p style="margin: 0; color: #065f46; font-size: 14px; font-weight: 600;">
                      <strong>Référence :</strong> Commande ${orderNumber}
                    </p>
                  </div>
                  ` : ''}

                  <div style="background-color: #ffffff; border: 2px solid #e0e0e0; border-left: 4px solid #d32f2f; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
                    <h2 style="margin: 0 0 15px 0; color: #27292a; font-size: 18px; font-weight: 700;">
                      Notre réponse
                    </h2>
                    <div style="color: #333; font-size: 15px; line-height: 1.8; white-space: pre-wrap;">${responseMessage.replace(/\n/g, "<br>")}</div>
                  </div>

                  <!-- Informations supplémentaires -->
                  <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #e0e0e0;">
                    <p style="margin: 0 0 10px 0; color: #666; font-size: 14px; line-height: 1.6;">
                      Si vous avez d'autres questions, n'hésitez pas à nous contacter.
                    </p>
                    <p style="margin: 0; color: #666; font-size: 14px;">
                      <strong>Service Client MAFRASHOP</strong><br>
                      Du lundi au vendredi, de 9h à 18h
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #27292a; padding: 20px 40px; text-align: center;">
                  <p style="margin: 0; color: #999; font-size: 12px; line-height: 1.6;">
                    Ce message vous a été envoyé par le 
                    <strong style="color: #ffffff;">Service Client MAFRASHOP</strong>.
                  </p>
                  <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
                    Merci de votre confiance
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
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

    // Contenu de l'email avec design professionnel
    const mailOptions = {
      from: `"MAFRASHOP Contact" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      replyTo: email,
      subject: `[Contact SAV] ${subjectLabel} - Commande ${orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Nouveau message de contact</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5; padding: 20px 0;">
            <tr>
              <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #27292a 0%, #3a3c3d 100%); padding: 30px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">
                        Nouveau Message
                      </h1>
                      <div style="width: 100px; height: 4px; background: #d32f2f; margin: 15px auto 0;"></div>
                    </td>
                  </tr>

                  <!-- Informations client -->
                  <tr>
                    <td style="padding: 30px 40px;">
                      <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-left: 4px solid #d32f2f; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                        <h2 style="margin: 0 0 15px 0; color: #991b1b; font-size: 18px; font-weight: 700;">
                          Informations du client
                        </h2>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                          <tr>
                            <td style="padding: 8px 0; color: #555; font-size: 14px;">
                              <strong style="color: #27292a; min-width: 140px; display: inline-block;">Email :</strong>
                              <a href="mailto:${email}" style="color: #d32f2f; text-decoration: none; font-weight: 600;">${email}</a>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #555; font-size: 14px;">
                              <strong style="color: #27292a; min-width: 140px; display: inline-block;">Commande :</strong>
                              <span style="color: #27292a; font-weight: 600;">${orderNumber}</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #555; font-size: 14px;">
                              <strong style="color: #27292a; min-width: 140px; display: inline-block;">Sujet :</strong>
                              <span style="color: #27292a; font-weight: 600;">${subjectLabel}</span>
                            </td>
                          </tr>
                        </table>
                      </div>

                      <!-- Message -->
                      <div style="background-color: #ffffff; border: 2px solid #e0e0e0; border-left: 4px solid #d32f2f; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
                        <h2 style="margin: 0 0 15px 0; color: #27292a; font-size: 18px; font-weight: 700;">
                          Message
                        </h2>
                        <div style="color: #333; font-size: 15px; line-height: 1.8; white-space: pre-wrap;">${message.replace(/\n/g, "<br>")}</div>
                      </div>

                      <!-- Call to action -->
                      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #e0e0e0;">
                        <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">
                          Vous pouvez répondre directement à cet email pour contacter le client.
                        </p>
                        <a href="mailto:${email}?subject=Re: ${subjectLabel} - Commande ${orderNumber}" style="display: inline-block; background: #d32f2f; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                          Répondre au client
                        </a>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #27292a; padding: 20px 40px; text-align: center;">
                      <p style="margin: 0; color: #999; font-size: 12px; line-height: 1.6;">
                        Ce message a été envoyé depuis le formulaire de contact du site 
                        <strong style="color: #ffffff;">MAFRASHOP</strong>.
                      </p>
                      <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
                        Service Client - Réponse sous 48h ouvrées
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
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

/**
 * Envoyer une réponse au client depuis le service client
 */
export const sendResponseToClient = async (request, reply) => {
  try {
    const { clientEmail, responseMessage, originalSubject, orderNumber } = request.body;

    // Validation des champs requis
    if (!clientEmail || !responseMessage) {
      return reply.code(400).send({
        success: false,
        message: "L'email du client et le message de réponse sont requis",
      });
    }

    // Validation de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail)) {
      return reply.code(400).send({
        success: false,
        message: "Format d'email invalide",
      });
    }

    // Créer le transporteur
    const transporter = createTransporter();

    // Générer le sujet de l'email
    const emailSubject = orderNumber 
      ? `Re: ${originalSubject || "Votre demande"} - Commande ${orderNumber}`
      : `Re: ${originalSubject || "Votre demande"}`;

    // Contenu de l'email avec design professionnel
    const mailOptions = {
      from: `"MAFRASHOP Service Client" <${process.env.SMTP_USER}>`,
      to: clientEmail,
      subject: emailSubject,
      html: generateResponseEmailTemplate(responseMessage, originalSubject, orderNumber),
      text: `
Réponse à votre demande${orderNumber ? ` - Commande ${orderNumber}` : ''}

${responseMessage}

---
Service Client MAFRASHOP
Du lundi au vendredi, de 9h à 18h
      `,
    };

    // Envoyer l'email
    await transporter.sendMail(mailOptions);

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Votre réponse a été envoyée au client avec succès.",
    });
  } catch (error) {
    console.error("Erreur lors de l'envoi de la réponse:", error);

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
      message: "Erreur lors de l'envoi de la réponse. Veuillez réessayer plus tard.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

