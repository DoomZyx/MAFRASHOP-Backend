import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.js";

// Charger les variables d'environnement
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env.NODE_ENV || "development";

let envFile = ".env";
if (env === "preprod") envFile = ".env.preprod";
else if (env === "production") envFile = ".env.prod";

dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

/**
 * Script pour mettre à jour les URLs d'images GitHub vers Supabase
 * 
 * Ce script :
 * 1. Trouve tous les produits avec des URLs GitHub
 * 2. Convertit les URLs GitHub en URLs Supabase
 * 3. Met à jour la base de données
 * 
 * IMPORTANT : Assurez-vous que toutes les images sont déjà uploadées sur Supabase
 * avec le même nom de fichier que sur GitHub
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_BUCKET = "product-images";
// Si les images sont directement dans le bucket (sans dossier products/), mettre à false
// Si les images sont dans products/, mettre à true
const USE_PRODUCTS_FOLDER = false;

if (!SUPABASE_URL) {
  console.error("SUPABASE_URL doit être configuré dans le fichier .env");
  process.exit(1);
}

/**
 * Extrait le nom du fichier depuis une URL GitHub (raw.githubusercontent.com ou GitHub Pages)
 */
const extractFileNameFromGitHubUrl = (githubUrl) => {
  try {
    const url = new URL(githubUrl);
    const pathParts = url.pathname.split("/").filter(part => part !== "");
    
    // Pour GitHub Pages (doomzyx.github.io/MAFRASHOP-IMG/image.webp)
    // Le nom du fichier est le dernier élément du pathname
    const fileName = pathParts[pathParts.length - 1];
    
    if (!fileName) {
      console.error(`Impossible d'extraire le nom de fichier de ${githubUrl}`);
      return null;
    }
    
    return decodeURIComponent(fileName);
  } catch (error) {
    console.error(`Erreur lors de l'extraction du nom de fichier de ${githubUrl}:`, error);
    return null;
  }
};

/**
 * Convertit une URL GitHub en URL Supabase
 */
const convertGitHubUrlToSupabase = (githubUrl) => {
  const fileName = extractFileNameFromGitHubUrl(githubUrl);
  if (!fileName) {
    return null;
  }

  // Construire l'URL Supabase
  // Format avec dossier products/: https://{project}.supabase.co/storage/v1/object/public/{bucket}/products/{filename}
  // Format sans dossier: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{filename}
  // IMPORTANT: Ne pas encoder le nom de fichier avec encodeURIComponent car Supabase gère les caractères spéciaux directement
  const folderPath = USE_PRODUCTS_FOLDER ? "products/" : "";
  const supabaseUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${folderPath}${fileName}`;
  return supabaseUrl;
};

/**
 * Vérifie si une URL pointe vers GitHub (raw.githubusercontent.com, github.com, ou GitHub Pages)
 */
const isGitHubUrl = (url) => {
  if (!url) return false;
  return (
    url.includes("githubusercontent.com") ||
    url.includes("github.com") ||
    url.includes(".github.io")
  );
};

/**
 * Vérifie si une URL pointe déjà vers Supabase avec le bon format
 */
const isSupabaseUrl = (url) => {
  if (!url) return false;
  if (!url.includes("supabase.co") || !url.includes("product-images")) {
    return false;
  }
  // Vérifier que l'URL n'a pas /products/ et n'a pas d'encodage URL inutile
  // Format correct: .../product-images/filename.webp (sans /products/ et sans %26 pour &)
  const hasProductsFolder = url.includes("/product-images/products/");
  const hasEncodedChars = url.includes("%26") || url.includes("%20") || url.includes("%2F");
  return !hasProductsFolder && !hasEncodedChars;
};

/**
 * Corrige une URL Supabase mal formatée (avec /products/ ou encodage)
 */
const fixSupabaseUrl = (url) => {
  if (!url || !url.includes("supabase.co") || !url.includes("product-images")) {
    return null;
  }

  try {
    const urlObj = new URL(url);
    
    // Extraire le chemin après /product-images/
    const pathMatch = urlObj.pathname.match(/\/product-images\/(?:products\/)?(.+)$/);
    if (!pathMatch) {
      return null;
    }
    
    // Décoder le nom de fichier (retirer l'encodage URL)
    let fileName = decodeURIComponent(pathMatch[1]);
    
    // Construire la nouvelle URL sans /products/ et sans encodage
    const fixedUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
    return fixedUrl;
  } catch (error) {
    console.error(`Erreur lors de la correction de l'URL ${url}:`, error);
    return null;
  }
};

/**
 * Met à jour les URLs d'images dans la base de données
 */
const updateImageUrls = async () => {
  try {
    console.log("Début de la mise à jour des URLs d'images...\n");

    // Récupérer tous les produits
    const result = await pool.query("SELECT id, nom, ref, url_image FROM products WHERE url_image IS NOT NULL");

    console.log(`Nombre total de produits avec images: ${result.rows.length}\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const product of result.rows) {
      const { id, nom, ref, url_image } = product;

      let supabaseUrl = null;
      let updateReason = "";

      // Vérifier si l'URL pointe déjà vers Supabase avec le bon format
      if (isSupabaseUrl(url_image)) {
        console.log(`✓ Produit ${id} (${nom}) : URL déjà sur Supabase (format correct)`);
        skippedCount++;
        continue;
      }

      // Si c'est une URL Supabase mais mal formatée (avec /products/ ou encodage), la corriger
      if (url_image.includes("supabase.co") && url_image.includes("product-images")) {
        supabaseUrl = fixSupabaseUrl(url_image);
        if (supabaseUrl) {
          updateReason = "Correction format URL Supabase";
        }
      }
      // Sinon, vérifier si c'est une URL GitHub à convertir
      else if (isGitHubUrl(url_image)) {
        supabaseUrl = convertGitHubUrlToSupabase(url_image);
        if (supabaseUrl) {
          updateReason = "Conversion GitHub → Supabase";
        }
      }
      // Sinon, ignorer
      else {
        console.log(`⚠ Produit ${id} (${nom}) : URL ni GitHub ni Supabase, ignoré: ${url_image}`);
        skippedCount++;
        continue;
      }

      if (!supabaseUrl) {
        console.error(`✗ Produit ${id} (${nom}) : Impossible de convertir/corriger l'URL: ${url_image}`);
        errorCount++;
        continue;
      }

      // Mettre à jour dans la base de données
      try {
        await pool.query(
          "UPDATE products SET url_image = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [supabaseUrl, id]
        );
        console.log(`✓ Produit ${id} (${nom}) [${updateReason}] : ${url_image} → ${supabaseUrl}`);
        updatedCount++;
      } catch (error) {
        console.error(`✗ Produit ${id} (${nom}) : Erreur lors de la mise à jour:`, error.message);
        errorCount++;
      }
    }

    console.log("\n=== Résumé ===");
    console.log(`Total de produits: ${result.rows.length}`);
    console.log(`✓ Mis à jour: ${updatedCount}`);
    console.log(`⊘ Ignorés (déjà Supabase ou autre): ${skippedCount}`);
    console.log(`✗ Erreurs: ${errorCount}`);

    if (updatedCount > 0) {
      console.log("\n✓ Migration terminée avec succès !");
    } else {
      console.log("\n⊘ Aucune mise à jour nécessaire.");
    }

  } catch (error) {
    console.error("Erreur lors de la migration:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Exécuter le script
updateImageUrls()
  .then(() => {
    console.log("\nScript terminé.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erreur fatale:", error);
    process.exit(1);
  });

