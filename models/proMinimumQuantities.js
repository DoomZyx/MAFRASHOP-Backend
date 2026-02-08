import pool from "../db.js";

// Mapper une règle de quantité minimale
const mapProMinimumQuantity = (row) => {
  if (!row) return null;
  return {
    id: row.id.toString(),
    productId: row.product_id.toString(),
    minimumQuantity: parseInt(row.minimum_quantity, 10),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

class ProMinimumQuantity {
  /**
   * Trouver la quantité minimale pour un produit
   * @param {string|number} productId - ID du produit
   * @returns {Object|null} Règle de quantité minimale ou null si aucune règle
   */
  static async findByProductId(productId) {
    if (!productId) return null;

    const result = await pool.query(
      `SELECT * FROM pro_minimum_quantities 
       WHERE product_id = $1`,
      [productId]
    );

    if (result.rows.length > 0) {
      return mapProMinimumQuantity(result.rows[0]);
    }

    return null;
  }

  /**
   * Récupérer toutes les règles avec les infos des produits
   * @returns {Array} Liste de toutes les règles
   */
  static async findAll() {
    const result = await pool.query(
      `SELECT pmq.*, p.nom as product_name, p.ref as product_ref
       FROM pro_minimum_quantities pmq
       INNER JOIN products p ON pmq.product_id = p.id
       ORDER BY p.nom`
    );
    return result.rows.map((row) => ({
      ...mapProMinimumQuantity(row),
      productName: row.product_name,
      productRef: row.product_ref,
    }));
  }

  /**
   * Créer une nouvelle règle
   * @param {Object} ruleData - Données de la règle
   * @returns {Object} Règle créée
   */
  static async create(ruleData) {
    const { productId, minimumQuantity } = ruleData;

    if (!productId || !minimumQuantity || minimumQuantity <= 0) {
      throw new Error("Données invalides pour créer la règle");
    }

    const result = await pool.query(
      `INSERT INTO pro_minimum_quantities 
       (product_id, minimum_quantity, created_at, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [productId, minimumQuantity]
    );

    return mapProMinimumQuantity(result.rows[0]);
  }

  /**
   * Mettre à jour une règle
   * @param {string|number} id - ID de la règle
   * @param {Object} updateData - Données à mettre à jour
   * @returns {Object} Règle mise à jour
   */
  static async update(id, updateData) {
    const { productId, minimumQuantity } = updateData;

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (productId !== undefined) {
      fields.push(`product_id = $${paramIndex++}`);
      values.push(productId);
    }
    if (minimumQuantity !== undefined) {
      if (minimumQuantity <= 0) {
        throw new Error("La quantité minimale doit être supérieure à 0");
      }
      fields.push(`minimum_quantity = $${paramIndex++}`);
      values.push(minimumQuantity);
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE pro_minimum_quantities 
       SET ${fields.join(", ")} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapProMinimumQuantity(result.rows[0]);
  }

  /**
   * Trouver une règle par ID
   * @param {string|number} id - ID de la règle
   * @returns {Object|null} Règle trouvée ou null
   */
  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM pro_minimum_quantities WHERE id = $1",
      [id]
    );
    return mapProMinimumQuantity(result.rows[0]);
  }

  /**
   * Supprimer une règle
   * @param {string|number} id - ID de la règle
   * @returns {boolean} True si supprimée
   */
  static async delete(id) {
    const result = await pool.query(
      "DELETE FROM pro_minimum_quantities WHERE id = $1 RETURNING *",
      [id]
    );
    return result.rows.length > 0;
  }
}

export default ProMinimumQuantity;

