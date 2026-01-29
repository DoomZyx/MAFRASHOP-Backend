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
    const sqlFile = join(__dirname, "addBestsellerPromotionColumns.sql");
    const sql = readFileSync(sqlFile, "utf8");
    
    console.log("Exécution de la migration...");
    
    // Exécuter le SQL
    await pool.query(sql);
    
    console.log("Migration réussie ! Les colonnes is_bestseller et is_promotion ont été ajoutées.");
    
    // Vérifier que les colonnes existent
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name IN ('is_bestseller', 'is_promotion')
    `);
    
    console.log(`Colonnes trouvées: ${checkResult.rows.map(r => r.column_name).join(", ")}`);
    
    process.exit(0);
  } catch (error) {
    console.error("Erreur lors de la migration:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

