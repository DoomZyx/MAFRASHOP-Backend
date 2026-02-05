import pool from "../db.js";

/**
 * Modèle pour gérer les sessions utilisateur (tokens actifs)
 * Permet d'invalider tous les tokens d'un utilisateur lors de changements critiques
 */
class UserSession {
  /**
   * Créer une nouvelle session (token)
   * @param {string|number} userId - ID de l'utilisateur
   * @param {string} jti - JWT ID du token
   * @param {string} tokenType - 'access' ou 'refresh'
   * @param {Date|string} expiresAt - Date d'expiration
   * @param {string} [ipAddress] - Adresse IP
   * @param {string} [userAgent] - User agent
   */
  static async create(userId, jti, tokenType, expiresAt, ipAddress = null, userAgent = null) {
    if (!userId || !jti || !tokenType || !expiresAt) {
      throw new Error("userId, jti, tokenType et expiresAt sont requis");
    }

    if (!["access", "refresh"].includes(tokenType)) {
      throw new Error("tokenType doit être 'access' ou 'refresh'");
    }

    try {
      await pool.query(
        `INSERT INTO user_sessions (user_id, token_jti, token_type, expires_at, ip_address, user_agent, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (token_jti) DO UPDATE SET
           expires_at = EXCLUDED.expires_at,
           is_active = TRUE`,
        [userId, jti, tokenType, expiresAt, ipAddress, userAgent]
      );
    } catch (error) {
      // Si erreur de contrainte unique, c'est OK (token déjà enregistré)
      if (error.code !== "23505") {
        throw error;
      }
    }
  }

  /**
   * Vérifier si une session (token) est active
   * @param {string} jti - JWT ID du token
   * @returns {boolean} True si session active
   */
  static async isActive(jti) {
    if (!jti) return false;

    const result = await pool.query(
      `SELECT id FROM user_sessions 
       WHERE token_jti = $1 
         AND is_active = TRUE
         AND expires_at > CURRENT_TIMESTAMP`,
      [jti]
    );

    return result.rows.length > 0;
  }

  /**
   * Invalider une session spécifique (par JTI)
   * @param {string} jti - JWT ID du token
   */
  static async invalidate(jti) {
    if (!jti) return;

    await pool.query(
      `UPDATE user_sessions 
       SET is_active = FALSE 
       WHERE token_jti = $1`,
      [jti]
    );
  }

  /**
   * Invalider TOUTES les sessions d'un utilisateur
   * Utilisé lors de changement password, email, désactivation compte, etc.
   * @param {string|number} userId - ID de l'utilisateur
   * @param {string} reason - Raison de l'invalidation
   */
  static async invalidateAllUserSessions(userId, reason = "user_action") {
    if (!userId) return;

    const result = await pool.query(
      `UPDATE user_sessions 
       SET is_active = FALSE 
       WHERE user_id = $1 
         AND is_active = TRUE
       RETURNING token_jti`,
      [userId]
    );

    const invalidatedCount = result.rows.length;
    
    if (invalidatedCount > 0) {
      console.log(
        `[AUDIT AUTH] ${invalidatedCount} session(s) invalidée(s) pour utilisateur ${userId} | ` +
        `Raison: ${reason}`
      );
    }

    return invalidatedCount;
  }

  /**
   * Récupérer toutes les sessions actives d'un utilisateur
   * @param {string|number} userId - ID de l'utilisateur
   * @returns {Array} Liste des sessions actives
   */
  static async getActiveSessions(userId) {
    if (!userId) return [];

    const result = await pool.query(
      `SELECT token_jti, token_type, created_at, expires_at, ip_address, user_agent
       FROM user_sessions 
       WHERE user_id = $1 
         AND is_active = TRUE
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Nettoyer les sessions expirées (peut être appelé par un cron)
   * @returns {number} Nombre de sessions nettoyées
   */
  static async cleanupExpired() {
    const result = await pool.query(
      `DELETE FROM user_sessions 
       WHERE expires_at < CURRENT_TIMESTAMP 
       RETURNING id`
    );
    return result.rows.length;
  }

  /**
   * Nettoyer les sessions invalidées anciennes (> 7 jours)
   * @returns {number} Nombre de sessions nettoyées
   */
  static async cleanupInvalidated() {
    const result = await pool.query(
      `DELETE FROM user_sessions 
       WHERE is_active = FALSE 
         AND expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
       RETURNING id`
    );
    return result.rows.length;
  }
}

export default UserSession;

