import pool from "../db.js";



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
    stock: row.stock_quantity !== null && row.stock_quantity !== undefined 
      ? (row.stock_quantity > 0 ? "in_stock" : "out_of_stock")
      : "out_of_stock",
    stockQuantity: row.stock_quantity !== null && row.stock_quantity !== undefined 
      ? parseInt(row.stock_quantity, 10) 
      : 0,
    stockAlertThreshold: row.stock_alert_threshold !== null && row.stock_alert_threshold !== undefined
      ? parseInt(row.stock_alert_threshold, 10)
      : 10,
    sku: row.sku || null,
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

  // Créer un produit
  static async create(productData) {
    const {
      category,
      subcategory,
      nom,
      ref,
      url_image,
      description,
      format,
      net_socofra,
      public_ht,
      garage,
      stock_quantity = 0,
      stock_alert_threshold = 10,
      sku,
      is_bestseller = false,
      is_promotion = false,
      promotion_percentage = null,
    } = productData;

    const result = await pool.query(
      `INSERT INTO products (
        category, subcategory, nom, ref, url_image, description, format,
        net_socofra, public_ht, garage, stock_quantity, stock_alert_threshold, sku,
        is_bestseller, is_promotion, promotion_percentage,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        category,
        subcategory,
        nom,
        ref,
        url_image,
        description,
        format,
        net_socofra,
        public_ht,
        garage,
        parseInt(stock_quantity, 10) || 0,
        parseInt(stock_alert_threshold, 10) || 10,
        sku,
        is_bestseller,
        is_promotion,
        promotion_percentage,
      ]
    );

    return mapProduct(result.rows[0]);
  }

  // Mettre à jour un produit
  static async update(id, productData) {
    const {
      category,
      subcategory,
      nom,
      ref,
      url_image,
      description,
      format,
      net_socofra,
      public_ht,
      garage,
      stock,
      sku,
      is_bestseller,
      is_promotion,
      promotion_percentage,
    } = productData;

    // Construire la requête dynamiquement selon les champs fournis
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      values.push(category);
    }
    if (subcategory !== undefined) {
      fields.push(`subcategory = $${paramIndex++}`);
      values.push(subcategory);
    }
    if (nom !== undefined) {
      fields.push(`nom = $${paramIndex++}`);
      values.push(nom);
    }
    if (ref !== undefined) {
      fields.push(`ref = $${paramIndex++}`);
      values.push(ref);
    }
    if (url_image !== undefined) {
      fields.push(`url_image = $${paramIndex++}`);
      values.push(url_image);
    }
    if (description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (format !== undefined) {
      fields.push(`format = $${paramIndex++}`);
      values.push(format);
    }
    if (net_socofra !== undefined) {
      fields.push(`net_socofra = $${paramIndex++}`);
      values.push(net_socofra);
    }
    if (public_ht !== undefined) {
      fields.push(`public_ht = $${paramIndex++}`);
      values.push(public_ht);
    }
    if (garage !== undefined) {
      fields.push(`garage = $${paramIndex++}`);
      values.push(garage);
    }
    if (productData.stock_quantity !== undefined) {
      fields.push(`stock_quantity = $${paramIndex++}`);
      values.push(parseInt(productData.stock_quantity, 10));
    }
    if (productData.stock_alert_threshold !== undefined) {
      fields.push(`stock_alert_threshold = $${paramIndex++}`);
      values.push(parseInt(productData.stock_alert_threshold, 10));
    }
    if (sku !== undefined) {
      fields.push(`sku = $${paramIndex++}`);
      values.push(sku);
    }
    if (is_bestseller !== undefined) {
      fields.push(`is_bestseller = $${paramIndex++}`);
      values.push(is_bestseller);
    }
    if (is_promotion !== undefined) {
      fields.push(`is_promotion = $${paramIndex++}`);
      values.push(is_promotion);
    }
    if (promotion_percentage !== undefined) {
      fields.push(`promotion_percentage = $${paramIndex++}`);
      values.push(promotion_percentage);
    }

    if (fields.length === 0) {
      // Aucun champ à mettre à jour, retourner le produit tel quel
      return await this.findById(id);
    }

    // Ajouter updated_at
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    // Ajouter l'ID à la fin
    values.push(id);

    const query = `UPDATE products SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return mapProduct(result.rows[0]);
  }

  // Supprimer un produit
  static async delete(id) {
    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapProduct(result.rows[0]);
  }
}

export default Product;