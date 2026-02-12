import pool from "../db.js";

// Fonction pour générer un slug à partir d'un nom
function generateSlug(nom) {
  if (!nom) return "";
  
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprimer les accents
    .replace(/[^a-z0-9\s-]/g, "") // Supprimer les caractères spéciaux
    .trim()
    .replace(/\s+/g, "-") // Remplacer les espaces par des tirets
    .replace(/-+/g, "-") // Remplacer les tirets multiples par un seul
    .replace(/^-|-$/g, ""); // Supprimer les tirets en début/fin
}

async function addSlugToProducts() {
  const client = await pool.connect();
  try {
    console.log("=== Ajout de la colonne slug à la table products ===\n");

    // Vérifier si la colonne existe déjà
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='products' AND column_name='slug'
    `);

    if (checkColumn.rows.length > 0) {
      console.log("La colonne 'slug' existe déjà.");
    } else {
      // Ajouter la colonne slug
      await client.query(`
        ALTER TABLE products 
        ADD COLUMN slug VARCHAR(255)
      `);
      console.log("Colonne 'slug' ajoutée avec succès");
    }

    // Créer un index unique sur slug
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug)
      `);
      console.log("Index unique sur 'slug' créé avec succès");
    } catch (error) {
      if (error.code === "23505") {
        console.log("L'index existe déjà");
      } else {
        throw error;
      }
    }

    // Générer les slugs pour tous les produits existants
    console.log("\n=== Génération des slugs pour les produits existants ===\n");
    const products = await client.query("SELECT id, nom FROM products WHERE slug IS NULL OR slug = ''");
    
    let updated = 0;
    for (const product of products.rows) {
      let baseSlug = generateSlug(product.nom);
      let slug = baseSlug;
      let counter = 1;

      // Vérifier l'unicité du slug
      while (true) {
        const existing = await client.query("SELECT id FROM products WHERE slug = $1 AND id != $2", [slug, product.id]);
        if (existing.rows.length === 0) {
          break;
        }
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      await client.query("UPDATE products SET slug = $1 WHERE id = $2", [slug, product.id]);
      updated++;
      console.log(`Produit ${product.id}: "${product.nom}" -> slug: "${slug}"`);
    }

    console.log(`\n${updated} produit(s) mis à jour avec un slug`);

    // Mettre à jour les produits qui ont un nom mais pas de slug (au cas où)
    const productsWithoutSlug = await client.query("SELECT id, nom FROM products WHERE slug IS NULL");
    for (const product of productsWithoutSlug.rows) {
      let baseSlug = generateSlug(product.nom);
      let slug = baseSlug;
      let counter = 1;

      while (true) {
        const existing = await client.query("SELECT id FROM products WHERE slug = $1 AND id != $2", [slug, product.id]);
        if (existing.rows.length === 0) {
          break;
        }
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      await client.query("UPDATE products SET slug = $1 WHERE id = $2", [slug, product.id]);
      console.log(`Produit ${product.id}: slug généré: "${slug}"`);
    }

    console.log("\n=== Migration terminée avec succès ===");
  } catch (error) {
    console.error("Erreur lors de la migration:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addSlugToProducts();

