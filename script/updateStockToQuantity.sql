-- Modifier la colonne stock pour stocker une quantité numérique
-- Supprimer l'ancienne colonne stock (VARCHAR)
ALTER TABLE products DROP COLUMN IF EXISTS stock;

-- Ajouter une nouvelle colonne stock_quantity (INTEGER) pour la quantité en entrepôt
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0);

-- Ajouter une colonne stock_alert_threshold pour définir le seuil d'alerte
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_alert_threshold INTEGER DEFAULT 10 CHECK (stock_alert_threshold >= 0);

-- Créer la table stock_movements pour l'historique
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('entry', 'exit', 'adjustment', 'sale', 'return')),
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_stock_quantity ON products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_stock_alert ON products(stock_quantity, stock_alert_threshold);

