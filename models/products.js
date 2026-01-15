import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import pg from "pg";

// Obtenir le répertoire du fichier actuel
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger le .env depuis le dossier backend (parent)
const envPath = join(__dirname, "..", ".env.dev");
const envPathFallback = join(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else if (fs.existsSync(envPathFallback)) {
  dotenv.config({ path: envPathFallback });
} else {
  dotenv.config();
}

const { Pool } = pg;

// Validation des variables d'environnement
if (!process.env.POSTGRES_PASSWORD) {
  console.error("ERREUR : POSTGRES_PASSWORD manquant dans .env");
  throw new Error("POSTGRES_PASSWORD manquant dans les variables d'environnement");
}

if (!process.env.POSTGRES_DB) {
  console.error("ERREUR : POSTGRES_DB manquant dans .env");
  throw new Error("POSTGRES_DB manquant dans les variables d'environnement");
}

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD, // Maintenant garanti d'être une string
});

// Fonction pour mapper les données PostgreSQL vers le format frontend
const mapProduct = (row) => {
  if (!row) return null;
  
  return {
    id: row.id.toString(),
    category: row.category,
    subcategory: row.subcategory,
    nom: row.nom,
    ref: row.ref,
    url_image: row.url_image,
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