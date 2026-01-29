import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addIsProToOrders() {
  try {
    console.log("=== Ajout de la colonne is_pro à la table orders ===\n");

    const sqlPath = path.join(__dirname, "addIsProToOrders.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("✅ Colonne 'is_pro' ajoutée avec succès");
    console.log("✅ Index créé avec succès");
  } catch (error) {
    console.error("❌ Erreur lors de l'ajout de la colonne:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addIsProToOrders();






