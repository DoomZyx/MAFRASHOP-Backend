import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env.NODE_ENV || "development";

let envFile = ".env";
if (env === "preprod") envFile = ".env.preprod";
else if (env === "production") envFile = ".env.prod";

dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

async function createProMinimumQuantitiesTable() {
  try {
    console.log("=== Création de la table pro_minimum_quantities ===\n");

    // Vérifier si la table existe déjà
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'pro_minimum_quantities'
      )
    `);

    if (checkTable.rows[0].exists) {
      console.log("⚠️  La table 'pro_minimum_quantities' existe déjà");
      await pool.end();
      process.exit(0);
    }

    // Créer la table
    await pool.query(`
      CREATE TABLE pro_minimum_quantities (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        minimum_quantity INTEGER NOT NULL CHECK (minimum_quantity > 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id)
      )
    `);

    console.log("✅ Table 'pro_minimum_quantities' créée avec succès");

    // Créer un index pour améliorer les performances
    await pool.query(`
      CREATE INDEX idx_pro_minimum_quantities_product_id 
      ON pro_minimum_quantities(product_id)
    `);

    console.log("✅ Index créés avec succès");

  } catch (error) {
    console.error("❌ Erreur lors de la création de la table:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createProMinimumQuantitiesTable()
  .then(() => {
    console.log("\nScript terminé.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erreur fatale:", error);
    process.exit(1);
  });

