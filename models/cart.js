import pool from "../db.js";
import Product from "./products.js";

// Mapper les données du panier avec les produits (JOIN)
const mapCartItem = (row) => {
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
    quantity: row.quantity,
    addedAt: row.added_at,
  };
};

class Cart {
  // Récupérer le panier avec les produits (JOIN)
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT 
        uc.id,
        uc.quantity,
        uc.added_at,
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
      FROM user_cart uc
      INNER JOIN products p ON uc.product_id = p.id
      WHERE uc.user_id = $1
      ORDER BY uc.added_at DESC`,
      [userId]
    );

    return result.rows.map(mapCartItem);
  }

  // Vérifier si un produit est déjà dans le panier
  static async findItemByUserAndProduct(userId, productId) {
    const result = await pool.query(
      "SELECT id, quantity FROM user_cart WHERE user_id = $1 AND product_id = $2",
      [userId, productId]
    );
    return result.rows[0] || null;
  }

  // Ajouter un produit au panier
  static async addItem(userId, productId, quantity = 1) {
    const existing = await this.findItemByUserAndProduct(userId, productId);

    if (existing) {
      // Mettre à jour la quantité
      await pool.query(
        "UPDATE user_cart SET quantity = $1 WHERE id = $2",
        [existing.quantity + quantity, existing.id]
      );
    } else {
      // Ajouter au panier
      await pool.query(
        "INSERT INTO user_cart (user_id, product_id, quantity) VALUES ($1, $2, $3)",
        [userId, productId, quantity]
      );
    }

    return await this.findByUserId(userId);
  }

  // Mettre à jour la quantité
  static async updateQuantity(userId, productId, quantity) {
    const result = await pool.query(
      "UPDATE user_cart SET quantity = $1 WHERE user_id = $2 AND product_id = $3 RETURNING *",
      [quantity, userId, productId]
    );

    if (result.rows.length === 0) {
      throw new Error("Produit non trouvé dans le panier");
    }

    return await this.findByUserId(userId);
  }

  // Retirer un produit du panier
  static async removeItem(userId, productId) {
    const result = await pool.query(
      "DELETE FROM user_cart WHERE user_id = $1 AND product_id = $2 RETURNING *",
      [userId, productId]
    );

    if (result.rows.length === 0) {
      throw new Error("Produit non trouvé dans le panier");
    }

    return await this.findByUserId(userId);
  }

  // Vider le panier
  static async clear(userId) {
    await pool.query("DELETE FROM user_cart WHERE user_id = $1", [userId]);
    return [];
  }
}

export default Cart;