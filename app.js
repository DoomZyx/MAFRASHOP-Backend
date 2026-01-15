import dotenv from "dotenv";
dotenv.config();
import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";
import productsRoutes from "./routes/products.js";
import authRoutes from "./routes/auth.js";
import cartRoutes from "./routes/cart.js";
import favoritesRoutes from "./routes/favorites.js";
import websocketRoutes from "./routes/websocket.js";
import { sendToUser } from "./routes/websocket.js";

export { sendToUser };

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD,
});

async function connectDB() {
  try {
    await pool.query("SELECT 1");
    console.log("Connexion PostgreSQL réussie");
  } catch (err) {
    console.error("Erreur de connexion PostgreSQL:", err);
    throw err;
  }
}

const fastify = Fastify({
  logger: true, // Activer les logs Fastify
});

// Enregistrer CORS
await fastify.register(cors, {
  origin: (origin, cb) => {
    const allowedOrigins = [
      "http://localhost:5173",
      "http://192.168.1.14:5173",
      "http://172.31.112.1:5173",
      "https://mafrashop-frontend.vercel.app",
    ];

    if (!origin) {
      cb(null, true);
      return;
    }

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

// Hook pour définir le Content-Type JSON par défaut
fastify.addHook("onSend", async (request, reply, payload) => {
  if (typeof payload === "object") {
    reply.type("application/json");
  }
  return payload;
});

// Hook pour capturer les erreurs
fastify.setErrorHandler((error, request, reply) => {
  console.error("ERREUR:", error.message || "Erreur serveur");
  if (process.env.NODE_ENV === "development") {
    console.error("Stack:", error.stack);
  }
  reply.type("application/json");
  reply.code(error.statusCode || 500).send({
    success: false,
    message: error.message || "Erreur serveur",
  });
});

// Enregistrer les routes
fastify.register(productsRoutes);
fastify.register(authRoutes);
fastify.register(cartRoutes);
fastify.register(favoritesRoutes);
fastify.register(websocketRoutes);

// Initialiser la connexion à la base de données
await connectDB();

export default fastify;