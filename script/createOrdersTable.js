import "../loadEnv.js";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parser DATABASE_URL si elle existe, sinon utiliser les variables individuelles
const parseDatabaseUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432", 10),
      database: parsed.pathname.slice(1),
      user: parsed.username,
      password: parsed.password,
    };
  } catch (error) {
    return null;
  }
};

const dbConfig = process.env.DATABASE_URL
  ? parseDatabaseUrl(process.env.DATABASE_URL)
  : {
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD,
    };

if (!dbConfig || !dbConfig.database) {
  console.error("❌ Configuration de base de données manquante");
  console.error("Vérifiez vos variables d'environnement DATABASE_URL ou POSTGRES_*");
  process.exit(1);
}

const pool = new Pool(dbConfig);

async function createOrdersTable() {
  try {
    console.log("=== Création de la table orders ===\n");

    const sqlPath = path.join(__dirname, "createOrdersTable.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("✅ Table 'orders' créée avec succès");
    console.log("✅ Table 'order_items' créée avec succès");
    console.log("✅ Index créés avec succès");
  } catch (error) {
    console.error("❌ Erreur lors de la création des tables:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createOrdersTable();

