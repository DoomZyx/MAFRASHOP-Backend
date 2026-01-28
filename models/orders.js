import "../loadEnv.js";
import pg from "pg";

const { Pool } = pg;

// Parser DATABASE_URL si elle existe, sinon utiliser les variables individuelles
const parseDatabaseUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432", 10),
      database: parsed.pathname.slice(1),
      user: parsed.username,
      password: parsed.password,
    };
  } catch (error) {
    return null;
  }
};

const dbConfig = process.env.DATABASE_URL
  ? parseDatabaseUrl(process.env.DATABASE_URL)
  : {
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD,
    };

const pool = new Pool(dbConfig);

// Mapper une commande
const mapOrder = (row) => {
  if (!row) return null;
  return {
    id: row.id.toString(),
    userId: row.user_id.toString(),
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeSessionId: row.stripe_session_id,
    status: row.status,
    totalAmount: parseFloat(row.total_amount),
    expectedAmount: row.expected_amount ? parseInt(row.expected_amount, 10) : null,
    isPro: row.is_pro || false,
    shippingAddress: row.shipping_address,
    billingAddress: row.billing_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Informations utilisateur si JOIN effectué
    userEmail: row.user_email,
    userFirstName: row.user_first_name,
    userLastName: row.user_last_name,
  };
};

// Mapper un item de commande
const mapOrderItem = (row) => {
  if (!row) return null;
  return {
    id: row.id.toString(),
    orderId: row.order_id.toString(),
    productId: row.product_id.toString(),
    quantity: row.quantity,
    unitPrice: parseFloat(row.unit_price),
    totalPrice: parseFloat(row.total_price),
    createdAt: row.created_at,
  };
};

class Order {
  // Créer une commande
  static async create(orderData) {
    const {
      userId,
      stripePaymentIntentId,
      stripeSessionId,
      status = "pending",
      totalAmount,
      expectedAmount,
      shippingAddress,
      billingAddress,
      items,
    } = orderData;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Créer la commande
      const orderResult = await client.query(
        `INSERT INTO orders (
          user_id, stripe_payment_intent_id, stripe_session_id, status,
          total_amount, expected_amount, is_pro, shipping_address, billing_address, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          userId,
          stripePaymentIntentId,
          stripeSessionId,
          status,
          totalAmount,
          expectedAmount,
          orderData.isPro || false,
          shippingAddress ? JSON.stringify(shippingAddress) : null,
          billingAddress ? JSON.stringify(billingAddress) : null,
        ]
      );

      const order = mapOrder(orderResult.rows[0]);

      // Créer les items de commande
      if (items && items.length > 0) {
        for (const item of items) {
          await client.query(
            `INSERT INTO order_items (
              order_id, product_id, quantity, unit_price, total_price, created_at
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
            [
              order.id,
              item.productId,
              item.quantity,
              item.unitPrice,
              item.totalPrice,
            ]
          );
        }
      }

      await client.query("COMMIT");
      return order;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Trouver une commande par ID
  static async findById(id) {
    const result = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
    return mapOrder(result.rows[0]);
  }

  // Trouver une commande par Stripe Payment Intent ID
  static async findByStripePaymentIntentId(paymentIntentId) {
    const result = await pool.query(
      "SELECT * FROM orders WHERE stripe_payment_intent_id = $1",
      [paymentIntentId]
    );
    return mapOrder(result.rows[0]);
  }

  // Trouver une commande par Stripe Session ID
  static async findByStripeSessionId(sessionId) {
    const result = await pool.query(
      "SELECT * FROM orders WHERE stripe_session_id = $1",
      [sessionId]
    );
    return mapOrder(result.rows[0]);
  }

  // Trouver toutes les commandes d'un utilisateur
  static async findByUserId(userId) {
    const result = await pool.query(
      "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(mapOrder);
  }

  // Trouver toutes les commandes avec les infos utilisateur (pour l'admin)
  static async findAllWithUser() {
    const result = await pool.query(
      `SELECT 
        o.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name
      FROM orders o
      INNER JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC`
    );
    return result.rows.map(mapOrder);
  }

  // Trouver une commande par ID avec les infos utilisateur
  static async findByIdWithUser(id) {
    const result = await pool.query(
      `SELECT 
        o.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name
      FROM orders o
      INNER JOIN users u ON o.user_id = u.id
      WHERE o.id = $1`,
      [id]
    );
    return mapOrder(result.rows[0]);
  }

  // Trouver tous les items d'une commande
  static async findOrderItems(orderId) {
    const result = await pool.query(
      `SELECT oi.*, p.nom, p.ref, p.url_image, p.category
       FROM order_items oi
       INNER JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1
       ORDER BY oi.created_at`,
      [orderId]
    );
    return result.rows.map((row) => ({
      ...mapOrderItem(row),
      productName: row.nom,
      productRef: row.ref,
      productImage: row.url_image,
      productCategory: row.category,
    }));
  }

  // Mettre à jour le statut d'une commande
  static async updateStatus(id, status) {
    const result = await pool.query(
      "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [status, id]
    );
    return mapOrder(result.rows[0]);
  }

  // Mettre à jour avec le Payment Intent ID
  static async updatePaymentIntent(id, paymentIntentId) {
    const result = await pool.query(
      "UPDATE orders SET stripe_payment_intent_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [paymentIntentId, id]
    );
    return mapOrder(result.rows[0]);
  }

  // Mettre à jour avec le Stripe Session ID
  static async updateStripeSessionId(id, sessionId) {
    const result = await pool.query(
      "UPDATE orders SET stripe_session_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [sessionId, id]
    );
    return mapOrder(result.rows[0]);
  }
}

export default Order;

