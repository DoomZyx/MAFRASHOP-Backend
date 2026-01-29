import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addStockAndSkuColumns() {
  try {
    console.log("=== Ajout des colonnes stock et sku à la table products ===\n");

    const sqlPath = path.join(__dirname, "addStockAndSkuToProducts.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("Colonnes 'stock' et 'sku' ajoutées avec succès");
    console.log("Index créés avec succès");
  } catch (error) {
    console.error("Erreur lors de l'ajout des colonnes:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addStockAndSkuColumns();

