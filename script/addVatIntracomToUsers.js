import pool from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addVatIntracomToUsers() {
  try {
    console.log("=== Ajout de la gestion TVA intracommunautaire ===\n");

    const sqlPath = path.join(__dirname, "addVatIntracomToUsers.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);

    console.log("✅ Colonnes TVA intracommunautaire ajoutées avec succès");
    console.log("   - company_country (code pays ISO)");
    console.log("   - vat_number (numéro TVA UE)");
    console.log("   - vat_status (none | pending_manual | validated | rejected)");
    console.log("   - vat_validation_date (date validation/rejet)");
    console.log("✅ Index créé pour vat_status = 'pending_manual'");
  } catch (error) {
    console.error("❌ Erreur lors de l'ajout des colonnes TVA:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addVatIntracomToUsers();
