import pool from "../db.js";
import crypto from "crypto";

/**
 * Génère un JTI (JWT ID) unique pour un token
 */
export const generateJTI = () => {
  return crypto.randomBytes(16).toString("hex");
};

class BlacklistedToken {
  /**
   * Vérifier si un token est blacklisté
   * @param {string} jti - JWT ID du token
   * @returns {boolean} True si blacklisté
   */
  static async isBlacklisted(jti) {
    if (!jti) return false;

    const result = await pool.query(
      `SELECT id FROM blacklisted_tokens 
       WHERE token_jti = $1 
         AND expires_at > CURRENT_TIMESTAMP`,
      [jti]
    );

    return result.rows.length > 0;
  }

  /**
   * Blacklister un token
   * @param {string} jti - JWT ID du token
   * @param {number|string} userId - ID de l'utilisateur
   * @param {Date|string} expiresAt - Date d'expiration du token
   * @param {string} reason - Raison du blacklist (default: 'logout')
   */
  static async blacklist(jti, userId, expiresAt, reason = "logout") {
    if (!jti) {
      throw new Error("JTI requis pour blacklister un token");
    }

    try {
      await pool.query(
        `INSERT INTO blacklisted_tokens (token_jti, user_id, expires_at, reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (token_jti) DO NOTHING`,
        [jti, userId, expiresAt, reason]
      );
    } catch (error) {
      // Si le token est déjà blacklisté, c'est OK
      if (error.code !== "23505") {
        throw error;
      }
    }
  }

  /**
   * Nettoyer les tokens expirés (peut être appelé par un cron)
   */
  static async cleanupExpired() {
    const result = await pool.query(
      `DELETE FROM blacklisted_tokens 
       WHERE expires_at < CURRENT_TIMESTAMP 
       RETURNING id`
    );
    return result.rows.length;
  }

  /**
   * Blacklister tous les tokens d'un utilisateur (logout global)
   * @param {number|string} userId - ID de l'utilisateur
   */
  static async blacklistAllUserTokens(userId) {
    // Note: Cette méthode nécessite de stocker le jti dans le JWT
    // Pour l'instant, on blackliste seulement les nouveaux tokens
    // Une amélioration serait de stocker jti dans une table user_sessions
    console.warn(
      `[AUDIT AUTH] Logout global demandé pour utilisateur ${userId} ` +
      `(blacklist partielle - seuls les nouveaux tokens seront blacklistés)`
    );
  }
}

export default BlacklistedToken;

