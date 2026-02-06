import pool from "../db.js";
import Product from "./products.js";
import Order from "./orders.js";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

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

  // Vérifier si l'utilisateur a une commande pending (panier verrouillé)
  // Annule automatiquement les commandes pending si la session Stripe est expirée ou annulée
  static async hasPendingOrder(userId) {
    const pendingOrders = await Order.findPendingByUserId(userId);
    
    if (pendingOrders.length === 0) {
      return false;
    }
    
    // Vérifier le statut de chaque session Stripe et annuler si expirée/annulée
    for (const order of pendingOrders) {
      if (!order) continue;
      
      // Si la commande a une session Stripe, vérifier son statut
      if (order.stripeSessionId && stripe) {
        try {
          const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
          
          // Si la session est expirée, annulée ou complétée (mais pas payée), annuler la commande
          if (
            session.status === "expired" ||
            (session.expires_at && session.expires_at * 1000 < Date.now()) ||
            (session.payment_status === "unpaid" && session.status !== "open")
          ) {
            console.log(`Annulation automatique de la commande pending #${order.id} (session Stripe expirée/annulée)`);
            await Order.updateStatus(order.id, "cancelled");
            continue;
          }
          
          // Si la session est toujours ouverte, la commande est valide
          if (session.status === "open") {
            continue;
          }
        } catch (error) {
          // Si la session n'existe plus ou erreur Stripe, annuler la commande
          console.log(`Annulation automatique de la commande pending #${order.id} (session Stripe invalide: ${error.message})`);
          await Order.updateStatus(order.id, "cancelled");
        }
      } else {
        // Si pas de session Stripe, annuler la commande (orpheline)
        console.log(`Annulation automatique de la commande pending #${order.id} (pas de session Stripe)`);
        await Order.updateStatus(order.id, "cancelled");
      }
    }
    
    // Vérifier à nouveau après nettoyage
    const remainingPendingOrders = await Order.findPendingByUserId(userId);
    return remainingPendingOrders.length > 0;
  }

  // Ajouter un produit au panier
  static async addItem(userId, productId, quantity = 1) {
    // VÉRIFICATION : Empêcher modification panier si commande pending
    const hasPending = await this.hasPendingOrder(userId);
    if (hasPending) {
      throw new Error(
        "Impossible de modifier le panier : une commande est en cours de traitement"
      );
    }

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
    // VÉRIFICATION : Empêcher modification panier si commande pending
    const hasPending = await this.hasPendingOrder(userId);
    if (hasPending) {
      throw new Error(
        "Impossible de modifier le panier : une commande est en cours de traitement"
      );
    }

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
    // VÉRIFICATION : Empêcher modification panier si commande pending
    const hasPending = await this.hasPendingOrder(userId);
    if (hasPending) {
      throw new Error(
        "Impossible de modifier le panier : une commande est en cours de traitement"
      );
    }

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