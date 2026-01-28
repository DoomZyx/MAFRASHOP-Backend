import "../loadEnv.js";
import pg from "pg";

const { Pool } = pg;

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
  console.error("Configuration de base de données manquante");
  console.error("Vérifiez vos variables d'environnement DATABASE_URL ou POSTGRES_*");
  process.exit(1);
}

const pool = new Pool(dbConfig);

async function addExpectedAmountColumn() {
  try {
    console.log("=== Ajout de la colonne expected_amount à la table orders ===\n");

    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS expected_amount INTEGER;
      
      COMMENT ON COLUMN orders.expected_amount IS 'Montant total attendu en centimes (pour comparaison avec Stripe)';
    `);

    console.log("Colonne 'expected_amount' ajoutée avec succès");
  } catch (error) {
    console.error("Erreur lors de l'ajout de la colonne:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addExpectedAmountColumn();

