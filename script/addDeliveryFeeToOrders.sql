-- Ajout des frais de livraison aux commandes
-- 6.50€ par défaut, gratuits si panier >= 80€

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.delivery_fee IS 'Frais de livraison en euros (0 si panier >= 80€)';
