-- Ajouter les colonnes is_bestseller et is_promotion à la table products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN DEFAULT FALSE;

-- Créer des index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_products_bestseller ON products(is_bestseller) WHERE is_bestseller = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_promotion ON products(is_promotion) WHERE is_promotion = TRUE;

