import pool from "../db.js";

/**
 * Script pour expirer les commandes pending de plus de 48h
 * À exécuter via cron job quotidiennement
 * 
 * Usage: node backend/utils/expirePendingOrders.js
 * 
 * Délai configurable via variable d'environnement ORDER_EXPIRATION_HOURS (défaut: 48)
 */
async function expirePendingOrders() {
  const EXPIRATION_DELAY_HOURS = parseInt(process.env.ORDER_EXPIRATION_HOURS || "48", 10);
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Trouver les commandes pending de plus de X heures (défaut: 48h)
    const result = await client.query(
      `UPDATE orders 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending' 
       AND created_at < NOW() - INTERVAL '${EXPIRATION_DELAY_HOURS} hours'
       RETURNING id, user_id, created_at`
    );

    const expiredCount = result.rows.length;

    if (expiredCount > 0) {
      console.log(`${expiredCount} commande(s) pending expirée(s) et annulée(s)`);
      result.rows.forEach((order) => {
        console.log(
          `  - Commande ${order.id} (user ${order.user_id}) créée le ${order.created_at}`
        );
      });
    } else {
      console.log("Aucune commande pending à expirer");
    }

    await client.query("COMMIT");
    return expiredCount;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erreur lors de l'expiration des commandes:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

expirePendingOrders()
  .then((count) => {
    console.log(`\n Script terminé : ${count} commande(s) expirée(s)`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n Erreur fatale:", error);
    process.exit(1);
  });

