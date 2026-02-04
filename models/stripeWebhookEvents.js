import pool from "../db.js";

class StripeWebhookEvent {
  /**
   * Vérifier si un événement a déjà été traité (idempotence)
   */
  static async isProcessed(eventId) {
    const result = await pool.query(
      "SELECT id, order_id, processed_at, event_type FROM stripe_webhook_events WHERE event_id = $1",
      [eventId]
    );
    return result.rows[0] || null;
  }

  /**
   * Tenter de marquer un événement comme traité (ATOMICITÉ DB)
   * Utilise directement INSERT avec UNIQUE constraint pour protection race condition
   * Retourne l'événement si créé, ou l'existant si déjà traité
   */
  static async tryMarkAsProcessed(eventId, eventType, orderId = null) {
    try {
      const result = await pool.query(
        `INSERT INTO stripe_webhook_events (event_id, event_type, order_id, processed_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         RETURNING *`,
        [eventId, eventType, orderId]
      );
      return { success: true, event: result.rows[0], alreadyProcessed: false };
    } catch (error) {
      // Si l'event_id existe déjà (UNIQUE constraint), l'événement a déjà été traité
      if (error.code === "23505") {
        const existing = await this.isProcessed(eventId);
        return { success: true, event: existing, alreadyProcessed: true };
      }
      throw error;
    }
  }

  /**
   * Marquer un événement comme orphelin (commande absente, retry possible)
   */
  static async markAsOrphan(eventId, eventType) {
    try {
      const result = await pool.query(
        `INSERT INTO stripe_webhook_events (event_id, event_type, order_id, processed_at)
         VALUES ($1, $2, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING *`,
        [eventId, eventType]
      );
      return result.rows[0] || null;
    } catch (error) {
      // Si déjà traité, retourner l'existant
      if (error.code === "23505") {
        return await this.isProcessed(eventId);
      }
      throw error;
    }
  }

  /**
   * Récupérer tous les événements pour une commande (debug/audit)
   */
  static async findByOrderId(orderId) {
    const result = await pool.query(
      "SELECT * FROM stripe_webhook_events WHERE order_id = $1 ORDER BY processed_at DESC",
      [orderId]
    );
    return result.rows;
  }
}

export default StripeWebhookEvent;

