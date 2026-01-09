import dotenv from "dotenv";
dotenv.config();
import Fastify from "fastify";
import cors from "@fastify/cors";
import mongoose from "mongoose";
import productsRoutes from "./routes/products.js";
import authRoutes from "./routes/auth.js";
import cartRoutes from "./routes/cart.js";
import favoritesRoutes from "./routes/favorites.js";
import websocketRoutes from "./routes/websocket.js";
import { sendToUser } from "./routes/websocket.js";

export { sendToUser };

async function connectDB() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI manquant dans le fichier .env");
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connexion MongoDB réussie");
  } catch (err) {
    console.error("Erreur de connexion MongoDB :", err);
    process.exit(1);
  }
}
await connectDB();

// createDefaultAdmin()

const fastify = Fastify();

await fastify.register(cors, {
  origin: (origin, cb) => {
    const allowedOrigins = [
      "http://localhost:5173",
      "http://192.168.1.14:5173",
      "http://172.31.112.1:5173",
      "mafrashop-frontend.vercel.app"
    ];

    // Autoriser les requêtes sans origin (comme Postman, curl, etc.)
    if (!origin) {
      cb(null, true);
      return;
    }

    // Vérifier si l'origin est autorisée
    const isAllowed = allowedOrigins.some((allowed) => {
      if (typeof allowed === "string") return allowed === origin;
      return allowed.test(origin);
    });

    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"), false);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true,
});

// Hook pour capturer les erreurs
fastify.setErrorHandler((error, request, reply) => {
  console.error("ERREUR:", error.message || "Erreur serveur");
  if (process.env.NODE_ENV === "development") {
    console.error("Stack:", error.stack);
  }
  reply.code(error.statusCode || 500).send({
    success: false,
    message: error.message || "Erreur serveur",
  });
});

fastify.register(productsRoutes);
fastify.register(authRoutes);
fastify.register(cartRoutes);
fastify.register(favoritesRoutes);
fastify.register(websocketRoutes);

export default fastify;
