import pool from "../db.js";

// Mapper les données des favoris avec les produits (JOIN)
const mapFavoriteItem = (row) => {
  if (!row) return null;
  return {
    productId: {
      id: row.product_id.toString(),
      category: row.category,
      subcategory: row.subcategory,
      nom: row.nom,
      ref: row.ref,
      url_image: row.url_image,
      description: row.description,
      format: row.format,
      net_socofra: row.net_socofra ? parseFloat(row.net_socofra) : null,
      public_ht: row.public_ht ? parseFloat(row.public_ht) : null,
      garage: row.garage ? parseFloat(row.garage) : null,
    },
    addedAt: row.added_at,
  };
};

class Favorites {
  // Récupérer les favoris avec les produits (JOIN)
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT 
        uf.id,
        uf.added_at,
        p.id as product_id,
        p.category,
        p.subcategory,
        p.nom,
        p.ref,
        p.url_image,
        p.description,
        p.format,
        p.net_socofra,
        p.public_ht,
        p.garage
      FROM user_favorites uf
      INNER JOIN products p ON uf.product_id = p.id
      WHERE uf.user_id = $1
      ORDER BY uf.added_at DESC`,
      [userId]
    );

    return result.rows.map(mapFavoriteItem);
  }

  // Vérifier si un produit est déjà en favoris
  static async findItemByUserAndProduct(userId, productId) {
    const result = await pool.query(
      "SELECT id FROM user_favorites WHERE user_id = $1 AND product_id = $2",
      [userId, productId]
    );
    return result.rows[0] || null;
  }

  // Ajouter aux favoris
  static async addItem(userId, productId) {
    const existing = await this.findItemByUserAndProduct(userId, productId);

    if (existing) {
      throw new Error("Le produit est déjà dans les favoris");
    }

    await pool.query(
      "INSERT INTO user_favorites (user_id, product_id) VALUES ($1, $2)",
      [userId, productId]
    );

    return await this.findByUserId(userId);
  }

  // Retirer des favoris
  static async removeItem(userId, productId) {
    const result = await pool.query(
      "DELETE FROM user_favorites WHERE user_id = $1 AND product_id = $2 RETURNING *",
      [userId, productId]
    );

    if (result.rows.length === 0) {
      throw new Error("Produit non trouvé dans les favoris");
    }

    return await this.findByUserId(userId);
  }
}

export default Favorites;