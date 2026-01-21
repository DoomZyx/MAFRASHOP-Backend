import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

// Obtenir le répertoire du fichier actuel
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Déterminer l'environnement
const env = process.env.NODE_ENV || "development";

// Définir le chemin du fichier .env selon l'environnement
const envFiles = {
  development: ".env.dev",
  test: ".env.test",
  production: ".env.prod",
};

const envFile = envFiles[env] || ".env.dev";
const envPath = join(__dirname, "..", envFile);
const envPathFallback = join(__dirname, "..", ".env");

// Charger le fichier .env approprié
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`Fichier .env chargé: ${envFile} (${env})`);
} else if (fs.existsSync(envPathFallback)) {
  dotenv.config({ path: envPathFallback });
  console.log(`Fichier .env par défaut chargé: .env (${envFile} non trouvé)`);
} else {
  dotenv.config();
  console.log(`Aucun fichier .env trouvé, utilisation des variables système`);
}

// Fonction pour parser DATABASE_URL
const parseDatabaseUrl = (databaseUrl) => {
  if (!databaseUrl) return null;
  
  try {
    // Format: postgresql://user:password@host:port/database
    // ou: postgres://user:password@host:port/database
    const url = new URL(databaseUrl);
    
    return {
      host: url.hostname,
      port: parseInt(url.port || "5432", 10),
      database: url.pathname.slice(1), // Enlever le '/' du début
      user: url.username,
      password: url.password,
    };
  } catch (error) {
    console.error("Erreur lors du parsing de DATABASE_URL:", error);
    return null;
  }
};

// Parser DATABASE_URL si elle existe, sinon utiliser les variables individuelles
const databaseConfig = process.env.DATABASE_URL 
  ? parseDatabaseUrl(process.env.DATABASE_URL)
  : null;

// Parser les origines CORS (séparées par des virgules)
const parseCorsOrigins = () => {
  const corsOrigins = process.env.CORS_ORIGINS;
  if (!corsOrigins) {
    // Origines par défaut pour le développement
    return [
      "http://localhost:5173",
      "http://192.168.1.14:5173",
      "http://172.31.112.1:5173",
    ];
  }
  // Séparer par virgule et nettoyer les espaces
  return corsOrigins.split(",").map(origin => origin.trim()).filter(origin => origin);
};

export const config = {
  NODE_ENV: env,
  PORT: process.env.PORT || 8080,
  // PostgreSQL - Utiliser DATABASE_URL en priorité, sinon les variables individuelles
  POSTGRES_HOST: databaseConfig?.host || process.env.POSTGRES_HOST,
  POSTGRES_PORT: databaseConfig?.port || parseInt(process.env.POSTGRES_PORT || "5432", 10),
  POSTGRES_DB: databaseConfig?.database || process.env.POSTGRES_DB,
  POSTGRES_USER: databaseConfig?.user || process.env.POSTGRES_USER,
  POSTGRES_PASSWORD: databaseConfig?.password || process.env.POSTGRES_PASSWORD,
  // CORS
  CORS_ORIGINS: parseCorsOrigins(),
  // JWT
  JWT_SECRET: process.env.JWT_SECRET,
  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  // INSEE (optionnel)
  INSEE_CONSUMER_KEY: process.env.INSEE_CONSUMER_KEY,
  INSEE_CONSUMER_SECRET: process.env.INSEE_CONSUMER_SECRET,
};

// Log de la configuration (sans les secrets)
console.log("📋 Configuration chargée:", {
  NODE_ENV: config.NODE_ENV,
  PORT: config.PORT,
  POSTGRES_HOST: config.POSTGRES_HOST,
  POSTGRES_PORT: config.POSTGRES_PORT,
  POSTGRES_DB: config.POSTGRES_DB,
  POSTGRES_USER: config.POSTGRES_USER,
  CORS_ORIGINS: config.CORS_ORIGINS,
  JWT_SECRET: config.JWT_SECRET ? "défini" : "manquant",
  GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID ? "défini" : "manquant",
});

export default config;
