import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addDeliveryFeeToOrders() {
  try {
    console.log("=== Ajout de la colonne delivery_fee à la table orders ===\n");

    const sqlPath = path.join(__dirname, "addDeliveryFeeToOrders.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("Colonne 'delivery_fee' ajoutée avec succès");
  } catch (error) {
    console.error("Erreur lors de l'ajout de la colonne:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addDeliveryFeeToOrders();
