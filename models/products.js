import "../loadEnv.js";
import pg from "pg";

const { Pool } = pg;

// Parser DATABASE_URL si elle existe, sinon utiliser les variables individuelles
const parseDatabaseUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432", 10),
      database: parsed.pathname.slice(1),
      user: parsed.username,
      password: parsed.password,
    };
  } catch (error) {
    return null;
  }
};

const dbConfig = process.env.DATABASE_URL 
  ? parseDatabaseUrl(process.env.DATABASE_URL)
  : {
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD,
    };

const pool = new Pool(dbConfig);



// Fonction pour encoder l'URL de l'image
const encodeImageUrl = (url) => {
  if (!url) return null;
  
  try {
    // Utiliser URL pour parser et reconstruire l'URL correctement
    const urlObj = new URL(url);
    // Encoder le pathname (qui contient le nom du fichier)
    const pathParts = urlObj.pathname.split('/');
    const encodedPath = pathParts.map(part => 
      part ? encodeURIComponent(part) : ''
    ).join('/');
    urlObj.pathname = encodedPath;
    return urlObj.toString();
  } catch (e) {
    // Si ce n'est pas une URL valide, utiliser encodeURI
    return encodeURI(url);
  }
};

// Fonction pour mapper les données PostgreSQL vers le format frontend
const mapProduct = (row) => {
  if (!row) return null;

  if (row.url_image && row.url_image.includes('&')) {
    console.log(`URL avec & détectée pour produit ${row.id}: ${row.url_image}`);
  }
  
  return {
    id: row.id.toString(),
    category: row.category,
    subcategory: row.subcategory,
    nom: row.nom,
    ref: row.ref,
    url_image: encodeImageUrl(row.url_image),
    description: row.description,
    format: row.format,
    net_socofra: row.net_socofra ? parseFloat(row.net_socofra) : null,
    public_ht: row.public_ht ? parseFloat(row.public_ht) : null,
    garage: row.garage ? parseFloat(row.garage) : null,
    is_bestseller: row.is_bestseller || false,
    is_promotion: row.is_promotion || false,
    promotion_percentage: row.promotion_percentage ? parseInt(row.promotion_percentage) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

class Product {
  static async findAll() {
    const result = await pool.query(
      "SELECT * FROM products ORDER BY id"
    );
    return result.rows.map(mapProduct);
  }

  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM products WHERE id = $1",
      [id]
    );
    return mapProduct(result.rows[0]);
  }

  static async findByRef(ref) {
    const result = await pool.query(
      "SELECT * FROM products WHERE ref = $1",
      [ref]
    );
    return mapProduct(result.rows[0]);
  }

  static async findBestsellers() {
    const result = await pool.query(
      "SELECT * FROM products WHERE is_bestseller = TRUE ORDER BY id"
    );
    return result.rows.map(mapProduct);
  }

  static async findPromotions() {
    const result = await pool.query(
      "SELECT * FROM products WHERE is_promotion = TRUE ORDER BY id"
    );
    return result.rows.map(mapProduct);
  }

  static async updateBestsellerStatus(id, isBestseller) {
    const result = await pool.query(
      "UPDATE products SET is_bestseller = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [isBestseller, id]
    );
    return mapProduct(result.rows[0]);
  }

  static async updatePromotionStatus(id, isPromotion, promotionPercentage = null) {
    const result = await pool.query(
      "UPDATE products SET is_promotion = $1, promotion_percentage = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *",
      [isPromotion, promotionPercentage, id]
    );
    return mapProduct(result.rows[0]);
  }
}

export default Product;