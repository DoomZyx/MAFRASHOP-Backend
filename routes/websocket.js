import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

// Store pour les connexions WebSocket par userId
const connections = new Map();

export function getConnections() {
  return connections;
}

export function sendToUser(userId, event, data) {
  const userConnections = connections.get(userId.toString());
  if (userConnections) {
    userConnections.forEach((socket) => {
      if (socket.readyState === 1) {
        // WebSocket.OPEN
        socket.send(JSON.stringify({ event, data }));
      }
    });
  }
}

export default async function websocketRoutes(fastify, options) {
  await fastify.register(async function (fastify) {
    const websocket = await import("@fastify/websocket");
    await fastify.register(websocket.default);

    fastify.get("/ws", { websocket: true }, (connection, request) => {
      // Dans Fastify WebSocket, la socket est dans connection.socket
      // Mais vérifions aussi si connection a directement les méthodes
      let socket = null;

      // Essayer différentes propriétés possibles
      if (connection.socket && typeof connection.socket.send === "function") {
        socket = connection.socket;
      } else if (connection && typeof connection.send === "function") {
        socket = connection;
      } else if (connection.ws && typeof connection.ws.send === "function") {
        socket = connection.ws;
      }

      if (!socket) {
        console.error("Erreur: socket WebSocket non trouvée", {
          connectionKeys: Object.keys(connection || {}),
          hasSocket: !!connection?.socket,
          hasWs: !!connection?.ws,
        });
        return;
      }

      // Extraire le token de l'URL
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get("token");

      if (!token) {
        socket.close(1008, "Token manquant");
        return;
      }

      let userId = null;

      try {
        if (!config.JWT_SECRET) {
          socket.close(1011, "Configuration serveur invalide");
          return;
        }

        const decoded = jwt.verify(token, config.JWT_SECRET);
        userId =
          typeof decoded === "object" && decoded !== null
            ? decoded.userId
            : null;

        if (!userId) {
          socket.close(1008, "Token invalide - userId manquant");
          return;
        }

        // Stocker la connexion
        if (!connections.has(userId.toString())) {
          connections.set(userId.toString(), new Set());
        }
        connections.get(userId.toString()).add(socket);

        console.log(`✅ WebSocket connecté pour userId: ${userId}`);

        // Envoyer un message de bienvenue (attendre que la socket soit ouverte)
        if (socket.readyState === 1) {
          socket.send(
            JSON.stringify({
              event: "connected",
              data: { message: "WebSocket connecté avec succès" },
            })
          );
        } else {
          socket.once("open", () => {
            socket.send(
              JSON.stringify({
                event: "connected",
                data: { message: "WebSocket connecté avec succès" },
              })
            );
          });
        }

        // Gérer la déconnexion
        socket.on("close", () => {
          const userConnections = connections.get(userId.toString());
          if (userConnections) {
            userConnections.delete(socket);
            if (userConnections.size === 0) {
              connections.delete(userId.toString());
            }
          }
          console.log(`🔌 WebSocket déconnecté pour userId: ${userId}`);
        });

        // Gérer les erreurs
        socket.on("error", (error) => {
          console.error(`❌ Erreur WebSocket pour userId ${userId}:`, error);
        });
      } catch (error) {
        console.error("Erreur de vérification du token WebSocket:", error);
        if (socket && socket.readyState !== 3) {
          // WebSocket.CLOSED
          socket.close(1008, "Token invalide");
        }
      }
    });
  });
}
