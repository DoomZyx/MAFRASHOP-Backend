import pool from "../db.js";

async function addExpectedAmountColumn() {
  try {
    console.log("=== Ajout de la colonne expected_amount à la table orders ===\n");

    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS expected_amount INTEGER;
      
      COMMENT ON COLUMN orders.expected_amount IS 'Montant total attendu en centimes (pour comparaison avec Stripe)';
    `);

    console.log("Colonne 'expected_amount' ajoutée avec succès");
  } catch (error) {
    console.error("Erreur lors de l'ajout de la colonne:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addExpectedAmountColumn();

