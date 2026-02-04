-- Table pour blacklister les tokens JWT révoqués (logout)
-- Permet d'invalider un token même s'il n'est pas encore expiré
CREATE TABLE IF NOT EXISTS blacklisted_tokens (
  id SERIAL PRIMARY KEY,
  token_jti VARCHAR(255) NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  blacklisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(100) DEFAULT 'logout'
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_blacklisted_tokens_jti ON blacklisted_tokens(token_jti);
CREATE INDEX IF NOT EXISTS idx_blacklisted_tokens_user_id ON blacklisted_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_blacklisted_tokens_expires_at ON blacklisted_tokens(expires_at);

-- Nettoyer automatiquement les tokens expirés (optionnel, peut être fait via cron)
-- Les tokens expirés sont automatiquement ignorés mais on peut les supprimer pour économiser l'espace

