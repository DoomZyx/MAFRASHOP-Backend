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

async function addScheduledDeliveryDateTime() {
  try {
    console.log("=== Ajout du champ scheduled_delivery_datetime à la table deliveries ===\n");

    // Vérifier si la colonne existe déjà
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'deliveries' 
      AND column_name = 'scheduled_delivery_datetime'
    `);

    if (checkColumn.rows.length > 0) {
      console.log("⚠️  La colonne 'scheduled_delivery_datetime' existe déjà");
      await pool.end();
      process.exit(0);
    }

    // Ajouter la colonne
    await pool.query(`
      ALTER TABLE deliveries 
      ADD COLUMN scheduled_delivery_datetime TIMESTAMP NULL
    `);

    console.log("✅ Colonne 'scheduled_delivery_datetime' ajoutée avec succès");

  } catch (error) {
    console.error("❌ Erreur lors de l'ajout de la colonne:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addScheduledDeliveryDateTime()
  .then(() => {
    console.log("\nScript terminé.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erreur fatale:", error);
    process.exit(1);
  });

