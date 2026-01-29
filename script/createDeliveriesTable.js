import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createDeliveriesTable() {
  try {
    console.log("=== Création de la table deliveries ===\n");

    const sqlPath = path.join(__dirname, "createDeliveriesTable.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("✅ Table 'deliveries' créée avec succès");
    console.log("✅ Index créés avec succès");
  } catch (error) {
    console.error("❌ Erreur lors de la création de la table:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createDeliveriesTable();






