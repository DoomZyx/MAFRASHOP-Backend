import { sendContactEmail } from "../controllers/contact.js";

/**
 * Routes pour le formulaire de contact
 */
async function contactRoutes(fastify, options) {
  // Envoyer un email de contact
  fastify.post("/contact", {
    schema: {
      description: "Envoyer un message de contact depuis le formulaire SAV",
      tags: ["contact"],
      body: {
        type: "object",
        required: ["orderNumber", "email", "subject", "message"],
        properties: {
          orderNumber: {
            type: "string",
            description: "Numéro de commande",
          },
          email: {
            type: "string",
            format: "email",
            description: "Email du client",
          },
          subject: {
            type: "string",
            description: "Sujet de la demande",
          },
          message: {
            type: "string",
            description: "Message du client",
          },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
          },
        },
        400: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
          },
        },
        500: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
          },
        },
      },
    },
    handler: sendContactEmail,
  });
}

export default contactRoutes;

