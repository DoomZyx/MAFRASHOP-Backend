-- Créer la table products
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    category VARCHAR(255),
    subcategory VARCHAR(255),
    nom VARCHAR(255) NOT NULL,
    ref VARCHAR(255) UNIQUE NOT NULL,
    url_image TEXT,
    description TEXT,
    format VARCHAR(255),
    net_socofra NUMERIC(10, 2),
    public_ht NUMERIC(10, 2),
    garage NUMERIC(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Créer un index sur la référence pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_products_ref ON products(ref);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);