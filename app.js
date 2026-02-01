import Fastify from "fastify";
import cors from "@fastify/cors";
import pool from "./db.js";
import productsRoutes from "./routes/products.js";
import authRoutes from "./routes/auth.js";
import cartRoutes from "./routes/cart.js";
import favoritesRoutes from "./routes/favorites.js";
import websocketRoutes from "./routes/websocket.js";
import paymentRoutes from "./routes/payment.js";
import ordersRoutes from "./routes/orders.js";
import invoicesRoutes from "./routes/invoices.js";
import deliveriesRoutes from "./routes/deliveries.js";
import adminProductsRoutes from "./routes/admin/products.js";
import adminStockRoutes from "./routes/admin/stock.js";
import adminStatsRoutes from "./routes/admin/stats.js";
import adminOrdersRoutes from "./routes/admin/orders.js";
import adminInvoicesRoutes from "./routes/admin/invoices.js";
import { sendToUser } from "./routes/websocket.js";

export { sendToUser };

async function connectDB() {
  try {
    await pool.query("SELECT 1");
    const isSupabase = process.env.DATABASE_URL?.includes("supabase");
    const dbType = isSupabase ? "Supabase" : "PostgreSQL local";
    if (isSupabase) {
      console.log(`Connexion ${dbType} réussie`);
    }
  } catch (err) {
    console.error("Erreur de connexion PostgreSQL:", err);
    throw err;
  }
}

const fastify = Fastify({
  logger: false, // Désactiver les logs Fastify (y compris "Server listening")
});

// Parser CORS_ORIGINS
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:5173", "http://192.168.1.14:5173", "http://172.31.112.1:5173"];

// Enregistrer CORS
await fastify.register(cors, {
  origin: (origin, cb) => {
    const allowedOrigins = corsOrigins;

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
      console.warn(`CORS: Origine non autorisée: ${origin}`);
      cb(new Error("Not allowed by CORS"), false);
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
fastify.register(paymentRoutes);
fastify.register(ordersRoutes);
fastify.register(invoicesRoutes);
fastify.register(deliveriesRoutes);
fastify.register(adminProductsRoutes);
fastify.register(adminStockRoutes);
fastify.register(adminStatsRoutes);
fastify.register(adminOrdersRoutes);
fastify.register(adminInvoicesRoutes);

// Initialiser la connexion à la base de données
await connectDB();

export default fastify;