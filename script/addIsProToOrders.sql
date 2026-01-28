-- Ajouter la colonne is_pro à la table orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT false;

-- Index pour améliorer les performances des requêtes par type de compte
CREATE INDEX IF NOT EXISTS idx_orders_is_pro ON orders(is_pro);






