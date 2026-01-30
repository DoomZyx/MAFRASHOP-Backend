/**
 * Migration : workflow de vérification des comptes pro (B2B)
 * Ajoute verification_mode, decision_source, decision_at, reviewed_by_admin_id, last_verification_error
 * et remplace pro_status 'validated' par 'verified'.
 * Utilise la même connexion que l'app (db.js), donc .env doit être chargé.
 */
import pool from "../db.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {

  try {
    const sqlPath = join(__dirname, "addProVerificationWorkflow.sql");
    const sql = readFileSync(sqlPath, "utf-8");
    await pool.query(sql);
    console.log("Migration addProVerificationWorkflow executee avec succes.");
  } catch (err) {
    console.error("Erreur migration:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
