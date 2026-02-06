// Chargement des variables d'environnement selon NODE_ENV
// .env.preprod et .env.prod sont présents uniquement sur le VPS, jamais dans le repo
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env.NODE_ENV || "development";

let envFile = ".env";
if (env === "preprod") envFile = ".env.preprod";
else if (env === "production") envFile = ".env.prod";

// Si NODE_ENV n'est pas défini, détecter automatiquement le fichier existant
if (!process.env.NODE_ENV) {
  const preprodPath = path.resolve(__dirname, ".env.preprod");
  const prodPath = path.resolve(__dirname, ".env.prod");
  const defaultPath = path.resolve(__dirname, ".env");
  
  if (existsSync(preprodPath) && !existsSync(defaultPath)) {
    envFile = ".env.preprod";
    console.log("ℹNODE_ENV non défini, détection automatique: .env.preprod trouvé");
  } else if (existsSync(prodPath) && !existsSync(defaultPath) && !existsSync(preprodPath)) {
    envFile = ".env.prod";
    console.log("ℹNODE_ENV non défini, détection automatique: .env.prod trouvé");
  }
}

const envPath = path.resolve(__dirname, envFile);

if (!existsSync(envPath)) {
  console.warn(`Fichier ${envFile} non trouvé dans ${__dirname}`);
  console.warn(`les variables d'environnement ne seront pas chargées depuis le fichier`);
} else {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error(`Erreur lors du chargement de ${envFile}:`, result.error);
  } else {
    console.log(`Variables d'environnement chargées depuis ${envFile}`);
  }
}
