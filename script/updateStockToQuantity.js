import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function updateStockToQuantity() {
  try {
    console.log("=== Mise à jour du modèle de stock ===\n");

    const sqlPath = path.join(__dirname, "updateStockToQuantity.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("Colonne stock_quantity ajoutée avec succès");
    console.log("Colonne stock_alert_threshold ajoutée avec succès");
    console.log("Table stock_movements créée avec succès");
    console.log("Index créés avec succès");
  } catch (error) {
    console.error("Erreur lors de la mise à jour du stock:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateStockToQuantity();

