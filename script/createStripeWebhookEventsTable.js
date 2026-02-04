import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createStripeWebhookEventsTable() {
  try {
    console.log("=== Création de la table stripe_webhook_events ===\n");

    const sqlPath = path.join(__dirname, "createStripeWebhookEventsTable.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("Table 'stripe_webhook_events' créée avec succès");
    console.log("Index créés avec succès");
  } catch (error) {
    console.error("Erreur lors de la création de la table:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createStripeWebhookEventsTable();

