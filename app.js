import './loadEnv.js';
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
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
import adminUploadRoutes from "./routes/admin/upload.js";
import contactRoutes from "./routes/contact.js";
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
  ? process.env.CORS_ORIGINS.split(",").map(o => o.trim()).filter(o => o.length > 0)
  : [];

// Normaliser les origines (supprimer trailing slash, normaliser)
const normalizeOrigin = (url) => {
  if (!url) return url;
  try {
    const urlObj = new URL(url);
    // Reconstruire l'URL sans trailing slash : protocol + host + port (sans pathname)
    let normalized = `${urlObj.protocol}//${urlObj.host}`;
    // Si le pathname existe et n'est pas juste "/", l'ajouter sans trailing slash
    if (urlObj.pathname && urlObj.pathname !== '/') {
      normalized += urlObj.pathname.replace(/\/$/, '');
    }
    return normalized;
  } catch {
    // Fallback simple si URL invalide : supprimer trailing slash
    return url.replace(/\/$/, '');
  }
};

const normalizedCorsOrigins = corsOrigins.map(normalizeOrigin);

if (!process.env.CORS_ORIGINS) {
  console.warn("⚠️  CORS_ORIGINS non défini dans les variables d'environnement - aucune origine autorisée par défaut");
} else {
  console.log("✅ Origines CORS autorisées (brutes):", corsOrigins);
  console.log("✅ Origines CORS autorisées (normalisées):", normalizedCorsOrigins);
}

// Enregistrer CORS
await fastify.register(cors, {
  origin: (origin, cb) => {
    // Autorise Postman / curl / server-side requests
    if (!origin) {
      console.log("🔵 CORS: Requête sans origin (server-side) - autorisée");
      return cb(null, true);
    }

    console.log("🔍 CORS: Origin reçue:", origin);
    const normalizedOrigin = normalizeOrigin(origin);
    console.log("🔍 CORS: Origin normalisée:", normalizedOrigin);
    
    // Vérifier avec l'origine normalisée
    if (normalizedCorsOrigins.includes(normalizedOrigin)) {
      console.log("✅ CORS: Origin autorisée (normalisée)");
      return cb(null, true);
    }

    // Vérifier aussi avec l'origine brute (au cas où)
    if (corsOrigins.includes(origin)) {
      console.log("✅ CORS: Origin autorisée (brute)");
      return cb(null, true);
    }

    console.warn("❌ CORS bloqué pour:", origin);
    console.warn("   Origin normalisée:", normalizedOrigin);
    console.warn("   Origines autorisées (brutes):", corsOrigins);
    console.warn("   Origines autorisées (normalisées):", normalizedCorsOrigins);
    return cb(new Error("Not allowed by CORS"), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true,
});

// Enregistrer multipart pour l'upload de fichiers
await fastify.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

// Headers de sécurité pour protéger contre XSS et autres attaques
fastify.addHook("onRequest", async (request, reply) => {
  // Content Security Policy : empêche l'exécution de scripts non autorisés
  reply.header("Content-Security-Policy", 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://api.insee.fr https://api.stripe.com https://oauth2.googleapis.com https://www.googleapis.com wss: ws:; " +
    "frame-src 'self' https://js.stripe.com; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
  
  // XSS Protection (navigateurs anciens)
  reply.header("X-XSS-Protection", "1; mode=block");
  
  // Empêcher le site d'être intégré dans une iframe (protection clickjacking)
  reply.header("X-Frame-Options", "DENY");
  
  // Empêcher le navigateur de deviner le type MIME
  reply.header("X-Content-Type-Options", "nosniff");
  
  // Referrer Policy : limiter les informations envoyées dans le referrer
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Permissions Policy : désactiver certaines fonctionnalités
  reply.header("Permissions-Policy", 
    "geolocation=(), " +
    "microphone=(), " +
    "camera=(), " +
    "payment=()"
  );
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
fastify.register(adminUploadRoutes);
fastify.register(contactRoutes);

// Initialiser la connexion à la base de données
await connectDB();

export default fastify;