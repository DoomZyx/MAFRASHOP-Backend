/**
 * Rate limiting middleware simple pour protéger contre les attaques brute force
 * Utilise un Map en mémoire (pour production, utiliser Redis)
 */

const rateLimitStore = new Map();

/**
 * Nettoyer les entrées expirées (garbage collection)
 */
const cleanup = () => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
};

// Nettoyer toutes les 5 minutes
setInterval(cleanup, 5 * 60 * 1000);

/**
 * Rate limiting middleware
 * @param {Object} options - Options de rate limiting
 * @param {number} options.max - Nombre maximum de requêtes
 * @param {number} options.windowMs - Fenêtre de temps en millisecondes
 * @returns {Function} Middleware Fastify
 */
export const rateLimit = (options = {}) => {
  const max = options.max || 5; // Par défaut : 5 requêtes
  const windowMs = options.windowMs || 15 * 60 * 1000; // Par défaut : 15 minutes

  return async (request, reply) => {
    // Identifier le client (IP + endpoint)
    const clientIp = request.ip || request.headers["x-forwarded-for"] || "unknown";
    const endpoint = request.url;
    const key = `${clientIp}:${endpoint}`;

    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      // Nouvelle fenêtre ou première requête
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return; // Autoriser la requête
    }

    // Incrémenter le compteur
    record.count++;

    if (record.count > max) {
      // Rate limit dépassé
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      
      console.warn(
        `[RATE LIMIT] Limite dépassée | ` +
        `IP: ${clientIp} | Endpoint: ${endpoint} | ` +
        `Tentatives: ${record.count}/${max} | Retry after: ${retryAfter}s`
      );

      reply.code(429).send({
        success: false,
        message: "Trop de tentatives. Veuillez réessayer plus tard.",
        retryAfter,
      });
      return;
    }

    // Autoriser la requête
  };
};

