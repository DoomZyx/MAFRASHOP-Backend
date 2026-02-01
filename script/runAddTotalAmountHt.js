import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAddTotalAmountHt() {
  try {
    console.log("=== Ajout de la colonne total_amount_ht à la table orders (Supabase / PostgreSQL) ===\n");

    const sqlPath = path.join(__dirname, "addTotalAmountHtToOrders.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("Colonne 'total_amount_ht' ajoutée avec succès.");
  } catch (error) {
    console.error("Erreur lors de la migration:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runAddTotalAmountHt();
