import "../loadEnv.js";
import pg from "pg";

const { Pool } = pg;

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

// Fonction pour mapper les données PostgreSQL vers le format frontend
const mapStockMovement = (row) => {
  if (!row) return null;

  return {
    id: row.id.toString(),
    productId: row.product_id.toString(),
    movementType: row.movement_type,
    quantity: parseInt(row.quantity, 10),
    previousQuantity: parseInt(row.previous_quantity, 10),
    newQuantity: parseInt(row.new_quantity, 10),
    reason: row.reason || null,
    createdBy: row.created_by ? row.created_by.toString() : null,
    createdAt: row.created_at,
    // Données jointes
    product: row.product || null,
    createdByUser: row.created_by_user || null,
  };
};

class StockMovement {
  /**
   * Créer un mouvement de stock
   */
  static async create(movementData) {
    const {
      productId,
      movementType,
      quantity,
      previousQuantity,
      newQuantity,
      reason = null,
      createdBy = null,
    } = movementData;

    const result = await pool.query(
      `INSERT INTO stock_movements (
        product_id, movement_type, quantity, previous_quantity, new_quantity,
        reason, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        productId,
        movementType,
        quantity,
        previousQuantity,
        newQuantity,
        reason,
        createdBy,
      ]
    );

    return mapStockMovement(result.rows[0]);
  }

  /**
   * Récupérer tous les mouvements de stock avec pagination
   */
  static async findAll(limit = 100, offset = 0, productId = null) {
    let query = `
      SELECT 
        sm.*,
        json_build_object(
          'id', p.id,
          'nom', p.nom,
          'ref', p.ref
        ) as product,
        json_build_object(
          'id', u.id,
          'firstName', u.first_name,
          'lastName', u.last_name,
          'email', u.email
        ) as created_by_user
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.created_by = u.id
    `;
    const params = [];
    let paramIndex = 1;

    if (productId) {
      query += ` WHERE sm.product_id = $${paramIndex++}`;
      params.push(productId);
    }

    query += ` ORDER BY sm.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows.map(mapStockMovement);
  }

  /**
   * Récupérer les mouvements d'un produit spécifique
   */
  static async findByProductId(productId, limit = 50) {
    const result = await pool.query(
      `
      SELECT 
        sm.*,
        json_build_object(
          'id', p.id,
          'nom', p.nom,
          'ref', p.ref
        ) as product,
        json_build_object(
          'id', u.id,
          'firstName', u.first_name,
          'lastName', u.last_name,
          'email', u.email
        ) as created_by_user
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE sm.product_id = $1
      ORDER BY sm.created_at DESC
      LIMIT $2
      `,
      [productId, limit]
    );

    return result.rows.map(mapStockMovement);
  }

  /**
   * Compter le total de mouvements
   */
  static async count(productId = null) {
    let query = "SELECT COUNT(*) as total FROM stock_movements";
    const params = [];

    if (productId) {
      query += " WHERE product_id = $1";
      params.push(productId);
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].total, 10);
  }
}

export default StockMovement;

