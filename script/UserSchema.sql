CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(255),
    zip_code VARCHAR(20),
    avatar TEXT,
    google_id VARCHAR(255) UNIQUE,
    auth_provider VARCHAR(20) DEFAULT 'local' CHECK (auth_provider IN ('local', 'google')),
    is_verified BOOLEAN DEFAULT false,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_pro BOOLEAN DEFAULT false,
    pro_status VARCHAR(20) DEFAULT 'none' CHECK (pro_status IN ('none', 'pending', 'validated', 'rejected')),
    company_name VARCHAR(255),
    company_siret VARCHAR(14),
    company_address TEXT,
    company_city VARCHAR(255),
    company_zip_code VARCHAR(20),
    company_phone VARCHAR(50),
    company_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Tables pour cart et favorites (relations many-to-many)
CREATE TABLE IF NOT EXISTS user_cart (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS user_favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- Index pour les relations
CREATE INDEX IF NOT EXISTS idx_user_cart_user_id ON user_cart(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cart_product_id ON user_cart(product_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_product_id ON user_favorites(product_id);