import Product from "../../models/products.js";

/**
 * Créer un produit (admin seulement)
 */
export const createProduct = async (request, reply) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

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
    } = request.body;

    // Validation des champs requis
    if (!nom || !ref) {
      return reply.code(400).send({
        success: false,
        message: "Le nom et la référence sont obligatoires",
      });
    }

    // Vérifier que la référence est unique
    const existingProduct = await Product.findByRef(ref);
    if (existingProduct) {
      return reply.code(400).send({
        success: false,
        message: "Une référence avec ce nom existe déjà",
      });
    }

    // Validation du stock
    const validStock = stock && ["in_stock", "out_of_stock"].includes(stock) 
      ? stock 
      : "in_stock";

    // Validation du pourcentage de promotion
    let validPromotionPercentage = null;
    if (is_promotion && promotion_percentage !== undefined && promotion_percentage !== null) {
      const percentage = parseInt(promotion_percentage);
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        return reply.code(400).send({
          success: false,
          message: "Le pourcentage de promotion doit être entre 0 et 100",
        });
      }
      validPromotionPercentage = percentage;
    }

    const product = await Product.create({
      category: category || null,
      subcategory: subcategory || null,
      nom,
      ref,
      url_image: url_image || null,
      description: description || null,
      format: format || null,
      net_socofra: net_socofra ? parseFloat(net_socofra) : null,
      public_ht: public_ht ? parseFloat(public_ht) : null,
      garage: garage ? parseFloat(garage) : null,
      stock: validStock,
      sku: sku || null,
      is_bestseller: is_bestseller || false,
      is_promotion: is_promotion || false,
      promotion_percentage: validPromotionPercentage,
    });

    reply.type("application/json");
    return reply.code(201).send({
      success: true,
      message: "Produit créé avec succès",
      data: { product },
    });
  } catch (error) {
    console.error("Erreur lors de la création du produit:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la création du produit",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Mettre à jour un produit (admin seulement)
 */
export const updateProduct = async (request, reply) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { id } = request.params;
    const productData = request.body;

    // Vérifier que le produit existe
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return reply.code(404).send({
        success: false,
        message: "Produit non trouvé",
      });
    }

    // Si la référence est modifiée, vérifier qu'elle est unique
    if (productData.ref && productData.ref !== existingProduct.ref) {
      const productWithRef = await Product.findByRef(productData.ref);
      if (productWithRef && productWithRef.id !== id) {
        return reply.code(400).send({
          success: false,
          message: "Une référence avec ce nom existe déjà",
        });
      }
    }

    // Validation du stock si fourni
    if (productData.stock && !["in_stock", "out_of_stock"].includes(productData.stock)) {
      return reply.code(400).send({
        success: false,
        message: "Le statut de stock doit être 'in_stock' ou 'out_of_stock'",
      });
    }

    // Validation du pourcentage de promotion si fourni
    if (productData.promotion_percentage !== undefined && productData.promotion_percentage !== null) {
      const percentage = parseInt(productData.promotion_percentage);
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        return reply.code(400).send({
          success: false,
          message: "Le pourcentage de promotion doit être entre 0 et 100",
        });
      }
      productData.promotion_percentage = percentage;
    }

    // Convertir les prix en nombres si fournis
    if (productData.net_socofra !== undefined && productData.net_socofra !== null) {
      productData.net_socofra = parseFloat(productData.net_socofra);
    }
    if (productData.public_ht !== undefined && productData.public_ht !== null) {
      productData.public_ht = parseFloat(productData.public_ht);
    }
    if (productData.garage !== undefined && productData.garage !== null) {
      productData.garage = parseFloat(productData.garage);
    }

    const product = await Product.update(id, productData);

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Produit mis à jour avec succès",
      data: { product },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du produit:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour du produit",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Supprimer un produit (admin seulement)
 */
export const deleteProduct = async (request, reply) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { id } = request.params;

    // Vérifier que le produit existe
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return reply.code(404).send({
        success: false,
        message: "Produit non trouvé",
      });
    }

    const product = await Product.delete(id);

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Produit supprimé avec succès",
      data: { product },
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du produit:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la suppression du produit",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

