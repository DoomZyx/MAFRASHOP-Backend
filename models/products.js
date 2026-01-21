import { config } from "../config/env.js";
import pg from "pg";

const { Pool } = pg;

// Validation des variables d'environnement
if (!config.POSTGRES_PASSWORD) {
  console.error("ERREUR : POSTGRES_PASSWORD manquant dans .env");
  throw new Error("POSTGRES_PASSWORD manquant dans les variables d'environnement");
}

if (!config.POSTGRES_DB) {
  console.error("ERREUR : POSTGRES_DB manquant dans .env");
  throw new Error("POSTGRES_DB manquant dans les variables d'environnement");
}

const pool = new Pool({
  host: config.POSTGRES_HOST || "localhost",
  port: config.POSTGRES_PORT,
  database: config.POSTGRES_DB,
  user: config.POSTGRES_USER || "postgres",
  password: config.POSTGRES_PASSWORD,
});



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
}

export default Product;