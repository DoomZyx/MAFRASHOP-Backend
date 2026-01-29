import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createOrdersTable() {
  try {
    console.log("=== Création de la table orders ===\n");

    const sqlPath = path.join(__dirname, "createOrdersTable.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("Table 'orders' créée avec succès");
    console.log("Table 'order_items' créée avec succès");
    console.log("Index créés avec succès");
  } catch (error) {
    console.error("Erreur lors de la création des tables:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createOrdersTable();

