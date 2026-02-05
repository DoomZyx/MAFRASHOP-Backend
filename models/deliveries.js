import pool from "../db.js";

// Mapper une livraison
const mapDelivery = (row) => {
  if (!row) return null;
  return {
    id: row.id.toString(),
    orderId: row.order_id.toString(),
    status: row.status,
    trackingNumber: row.tracking_number,
    carrier: row.carrier,
    estimatedDeliveryDate: row.estimated_delivery_date,
    actualDeliveryDate: row.actual_delivery_date,
    scheduledDeliveryDateTime: row.scheduled_delivery_datetime,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Calcule la date de livraison estimée selon le type de compte
 * - Pro : 24h max
 * - Particuliers : 72h max
 */
function calculateEstimatedDeliveryDate(isPro) {
  const now = new Date();
  const estimatedDate = new Date(now);
  
  if (isPro) {
    // Pro : 24h max
    estimatedDate.setHours(estimatedDate.getHours() + 24);
  } else {
    // Particuliers : 72h max
    estimatedDate.setHours(estimatedDate.getHours() + 72);
  }
  
  // Retourner uniquement la date (sans l'heure)
  return estimatedDate.toISOString().split("T")[0];
}

class Delivery {
  // Créer une livraison depuis une commande
  static async createFromOrder(orderId, isPro) {
    const estimatedDeliveryDate = calculateEstimatedDeliveryDate(isPro);
    
    const result = await pool.query(
      `INSERT INTO deliveries (
        order_id, status, estimated_delivery_date, created_at, updated_at
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [orderId, "pending", estimatedDeliveryDate]
    );

    return mapDelivery(result.rows[0]);
  }

  // Trouver une livraison par ID
  static async findById(id) {
    const result = await pool.query("SELECT * FROM deliveries WHERE id = $1", [id]);
    return mapDelivery(result.rows[0]);
  }

  // Trouver une livraison par order_id
  static async findByOrderId(orderId) {
    const result = await pool.query(
      "SELECT * FROM deliveries WHERE order_id = $1",
      [orderId]
    );
    return mapDelivery(result.rows[0]);
  }

  // Trouver toutes les livraisons d'un utilisateur (via order_id)
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT d.* FROM deliveries d
       INNER JOIN orders o ON d.order_id = o.id
       WHERE o.user_id = $1
       ORDER BY d.created_at DESC`,
      [userId]
    );
    return result.rows.map(mapDelivery);
  }

  // Trouver toutes les livraisons avec les infos de commande
  static async findAllWithOrder() {
    const result = await pool.query(
      `SELECT 
        d.*,
        o.user_id,
        o.status as order_status,
        o.total_amount,
        o.is_pro
      FROM deliveries d
      INNER JOIN orders o ON d.order_id = o.id
      ORDER BY d.created_at DESC`
    );
    return result.rows.map((row) => ({
      ...mapDelivery(row),
      userId: row.user_id?.toString(),
      orderStatus: row.order_status,
      totalAmount: parseFloat(row.total_amount),
      isPro: row.is_pro || false,
    }));
  }

  // Mettre à jour le statut
  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE deliveries 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );
    return mapDelivery(result.rows[0]);
  }

  // Mettre à jour le numéro de suivi et le transporteur
  static async updateTracking(id, trackingNumber, carrier) {
    const result = await pool.query(
      `UPDATE deliveries 
       SET tracking_number = $1, carrier = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING *`,
      [trackingNumber, carrier, id]
    );
    return mapDelivery(result.rows[0]);
  }

  // Mettre à jour la date de livraison réelle
  static async updateActualDeliveryDate(id, actualDeliveryDate) {
    const result = await pool.query(
      `UPDATE deliveries 
       SET actual_delivery_date = $1, status = 'delivered', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [actualDeliveryDate, id]
    );
    return mapDelivery(result.rows[0]);
  }

  // Mettre à jour les notes
  static async updateNotes(id, notes) {
    const result = await pool.query(
      `UPDATE deliveries 
       SET notes = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [notes, id]
    );
    return mapDelivery(result.rows[0]);
  }

  // Mettre à jour la date et heure de livraison programmée
  static async updateScheduledDeliveryDateTime(id, scheduledDeliveryDateTime) {
    const result = await pool.query(
      `UPDATE deliveries 
       SET scheduled_delivery_datetime = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [scheduledDeliveryDateTime, id]
    );
    return mapDelivery(result.rows[0]);
  }
}

export default Delivery;

