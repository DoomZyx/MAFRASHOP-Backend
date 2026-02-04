-- Table pour stocker les événements Stripe webhook traités (idempotence)
-- Empêche le traitement multiple du même événement
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour recherche rapide par event_id
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON stripe_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_order_id ON stripe_webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type ON stripe_webhook_events(event_type);

