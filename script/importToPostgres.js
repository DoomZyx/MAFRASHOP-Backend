import "../loadEnv.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import csv from "csv-parser";
import pg from "pg";

// Obtenir le répertoire du fichier actuel
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Client } = pg;

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

// Validation des variables d'environnement
if (!dbConfig || !dbConfig.password) {
  console.error("ERREUR : POSTGRES_PASSWORD manquant dans .env");
  console.error(
    "Vérifie que ton fichier .env contient : POSTGRES_PASSWORD=ton_mot_de_passe ou DATABASE_URL"
  );
  process.exit(1);
}

if (!dbConfig.database) {
  console.error("ERREUR : POSTGRES_DB manquant dans .env");
  process.exit(1);
}

const client = new Client(dbConfig);


const parseNumber = (value) => {
  if (!value || value.trim() === "") return null;
  const cleaned = value.replace(/"/g, "").replace(",", ".");
  const number = Number(cleaned);
  return Number.isNaN(number) ? null : number;
};

const products = [];

console.log("Lecture du CSV...");

// Chemin vers le CSV depuis le dossier backend
const csvPath = join(__dirname, "..", "MafraProducts_cleaned.csv");

if (!fs.existsSync(csvPath)) {
  console.error(`ERREUR : Fichier CSV introuvable : ${csvPath}`);
  process.exit(1);
}

fs.createReadStream(csvPath)
  .pipe(csv())
  .on("data", (row) => {
    products.push({
      category: row.CATEGORY || null,
      subcategory: row.SUBCATEGORY || null,
      nom: row.NOM,
      ref: row.REF,
      url_image: row.URL_IMAGE || null,
      description: row.DESCRIPTION || null,
      format: row.FORMAT || null,
      net_socofra: parseNumber(row["NET SOCOFRA"]),
      public_ht: parseNumber(row["PUBLIC HT"]),
      garage: parseNumber(row.GARAGE),
    });
  })
  .on("end", async () => {
    try {
      console.log(
        `Tentative de connexion à PostgreSQL (${dbConfig.database})...`
      );
      await client.connect();
      console.log("Connexion à PostgreSQL réussie");

      // Vider la table si elle existe déjà
      await client.query("TRUNCATE TABLE products RESTART IDENTITY CASCADE");

      // Insérer les produits
      const insertQuery = `
        INSERT INTO products (
          category, subcategory, nom, ref, url_image, description, 
          format, net_socofra, public_ht, garage
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      for (const product of products) {
        await client.query(insertQuery, [
          product.category,
          product.subcategory,
          product.nom,
          product.ref,
          product.url_image,
          product.description,
          product.format,
          product.net_socofra,
          product.public_ht,
          product.garage,
        ]);
      }

      console.log(`Import terminé : ${products.length} produits importés`);
    } catch (err) {
      console.error("Erreur lors de l'import:", err);
    } finally {
      await client.end();
    }
  })
  .on("error", (err) => {
    console.error("Erreur lors de la lecture du CSV:", err);
  });
