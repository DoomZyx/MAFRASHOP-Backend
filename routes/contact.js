import { sendContactEmail, sendResponseToClient } from "../controllers/contact.js";
import { verifyToken, isAdmin } from "../middleware/auth.js";

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

  // Envoyer une réponse au client (admin seulement)
  fastify.post(
    "/contact/response",
    {
      preHandler: [verifyToken, isAdmin],
      schema: {
        description: "Envoyer une réponse au client depuis le service client",
        tags: ["contact"],
        body: {
          type: "object",
          required: ["clientEmail", "responseMessage"],
          properties: {
            clientEmail: {
              type: "string",
              format: "email",
              description: "Email du client à qui répondre",
            },
            responseMessage: {
              type: "string",
              description: "Message de réponse à envoyer au client",
            },
            originalSubject: {
              type: "string",
              description: "Sujet original de la demande (optionnel)",
            },
            orderNumber: {
              type: "string",
              description: "Numéro de commande (optionnel)",
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
    },
    sendResponseToClient
  );
}

export default contactRoutes;

