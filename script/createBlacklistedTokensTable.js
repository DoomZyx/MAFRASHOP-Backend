import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createBlacklistedTokensTable() {
  try {
    console.log("=== Création de la table blacklisted_tokens ===\n");

    const sqlPath = path.join(__dirname, "createBlacklistedTokensTable.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("Table 'blacklisted_tokens' créée avec succès");
    console.log("Index créés avec succès");
  } catch (error) {
    console.error("Erreur lors de la création de la table:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createBlacklistedTokensTable();

