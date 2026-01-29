import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addShippedPreparingStatus() {
  try {
    console.log("=== Ajout des statuts 'shipped' et 'preparing' à la table orders ===\n");

    const sqlPath = path.join(__dirname, "addShippedPreparingStatus.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("Statuts 'shipped' et 'preparing' ajoutés avec succès");
  } catch (error) {
    console.error("Erreur lors de l'ajout des statuts:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addShippedPreparingStatus();

