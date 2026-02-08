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

async function migrateProMinimumQuantitiesToProductId() {
  const client = await pool.connect();
  try {
    console.log("=== Migration de pro_minimum_quantities vers product_id ===\n");

    // Vérifier si la table existe
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'pro_minimum_quantities'
      )
    `);

    if (!checkTable.rows[0].exists) {
      console.log("⚠️  La table 'pro_minimum_quantities' n'existe pas encore");
      console.log("💡 Exécutez d'abord: npm run migrate:pro-minimum-quantities");
      await pool.end();
      process.exit(0);
    }

    // Vérifier si la colonne product_id existe déjà
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pro_minimum_quantities' 
      AND column_name = 'product_id'
    `);

    if (checkColumn.rows.length > 0) {
      console.log("✅ La colonne 'product_id' existe déjà - migration déjà effectuée");
      await pool.end();
      process.exit(0);
    }

    console.log("🔄 Début de la migration...");

    await client.query("BEGIN");

    // Supprimer les anciennes colonnes et index
    await client.query(`
      DROP INDEX IF EXISTS idx_pro_minimum_quantities_category
    `);
    await client.query(`
      DROP INDEX IF EXISTS idx_pro_minimum_quantities_subcategory
    `);

    // Supprimer la contrainte UNIQUE sur category/subcategory
    await client.query(`
      ALTER TABLE pro_minimum_quantities 
      DROP CONSTRAINT IF EXISTS pro_minimum_quantities_category_subcategory_key
    `);

    // Supprimer les anciennes colonnes
    await client.query(`
      ALTER TABLE pro_minimum_quantities 
      DROP COLUMN IF EXISTS category,
      DROP COLUMN IF EXISTS subcategory
    `);

    // Ajouter la nouvelle colonne product_id
    await client.query(`
      ALTER TABLE pro_minimum_quantities 
      ADD COLUMN product_id INTEGER REFERENCES products(id) ON DELETE CASCADE
    `);

    // Créer la contrainte UNIQUE sur product_id
    await client.query(`
      ALTER TABLE pro_minimum_quantities 
      ADD CONSTRAINT pro_minimum_quantities_product_id_key UNIQUE (product_id)
    `);

    // Créer l'index
    await client.query(`
      CREATE INDEX idx_pro_minimum_quantities_product_id 
      ON pro_minimum_quantities(product_id)
    `);

    await client.query("COMMIT");

    console.log("✅ Migration terminée avec succès");
    console.log("⚠️  ATTENTION: Les anciennes règles basées sur catégorie ont été supprimées");
    console.log("💡 Vous devez recréer les règles en les liant aux produits spécifiques");

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Erreur lors de la migration:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateProMinimumQuantitiesToProductId()
  .then(() => {
    console.log("\nScript terminé.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erreur fatale:", error);
    process.exit(1);
  });

