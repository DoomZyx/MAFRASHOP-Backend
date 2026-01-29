import pool from "../db.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log("Connexion à la base de données...");
    
    // Lire le fichier SQL
    const sqlFile = join(__dirname, "addPromotionPercentageColumn.sql");
    const sql = readFileSync(sqlFile, "utf8");
    
    console.log("Exécution de la migration...");
    
    // Exécuter le SQL
    await pool.query(sql);
    
    console.log("Migration réussie ! La colonne promotion_percentage a été ajoutée.");
    
    // Vérifier que la colonne existe
    const checkResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name = 'promotion_percentage'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log(`Colonne trouvée: ${checkResult.rows[0].column_name} (${checkResult.rows[0].data_type})`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Erreur lors de la migration:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

