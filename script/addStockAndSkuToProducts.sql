-- Ajouter les colonnes stock et sku à la table products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock VARCHAR(50) DEFAULT 'in_stock' CHECK (stock IN ('in_stock', 'out_of_stock')),
ADD COLUMN IF NOT EXISTS sku VARCHAR(255);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

