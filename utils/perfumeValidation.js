/**
 * Liste des références de produits parfum
 * Ces produits nécessitent un minimum de 6 parfums différents dans le panier
 */
const PERFUME_PRODUCT_REFS = [
  "FANTASIE",
  "SCIC",
  "DEO-CUBE",
  "LUCKY STAR"
];

/**
 * Vérifie si un produit est un parfum basé sur sa référence
 * @param {Object} product - Produit à vérifier
 * @returns {boolean} True si le produit est un parfum
 */
export function isPerfumeProduct(product) {
  if (!product || !product.ref) {
    return false;
  }
  
  const productRef = product.ref.toUpperCase().trim();
  return PERFUME_PRODUCT_REFS.some(ref => productRef.includes(ref));
}

/**
 * Compte la quantité totale de produits parfum dans le panier
 * (pas le nombre de références distinctes, mais la somme des quantités)
 * @param {Array} cartItems - Items du panier avec leurs produits
 * @returns {number} Quantité totale de produits parfum
 */
export function countTotalPerfumes(cartItems) {
  if (!cartItems || cartItems.length === 0) {
    return 0;
  }

  let totalPerfumeQuantity = 0;
  
  cartItems.forEach(item => {
    if (!item) return;
    
    // item.productId peut être un objet Product ou un ID
    const product = typeof item.productId === 'object' && item.productId !== null 
      ? item.productId 
      : null;
    
    if (product) {
      // Vérifier dans la référence ET dans le nom du produit
      const productRef = (product.ref || product.product_ref || "").toUpperCase().trim();
      const productName = (product.nom || product.name || "").toUpperCase().trim();
      
      // Vérifier si la référence OU le nom contient un des mots-clés de parfum
      const isPerfume = PERFUME_PRODUCT_REFS.some(ref => {
        const refUpper = ref.toUpperCase();
        // Chercher dans la référence
        const matchInRef = productRef && (
          productRef.includes(refUpper) || 
          productRef.startsWith(refUpper) || 
          productRef.endsWith(refUpper)
        );
        // Chercher dans le nom
        const matchInName = productName && (
          productName.includes(refUpper) || 
          productName.startsWith(refUpper) || 
          productName.endsWith(refUpper)
        );
        return matchInRef || matchInName;
      });
      
      if (isPerfume) {
        const quantity = item.quantity || 1;
        totalPerfumeQuantity += quantity;
      }
    }
  });

  return totalPerfumeQuantity;
}

/**
 * Valide que le panier respecte la règle des 6 parfums minimum
 * (compte la quantité totale, pas le nombre de références distinctes)
 * @param {Array} cartItems - Items du panier avec leurs produits
 * @returns {Object} { isValid: boolean, totalCount: number, missing: number, message: string }
 */
export function validatePerfumeMinimum(cartItems) {
  const totalCount = countTotalPerfumes(cartItems);
  const MINIMUM_PERFUMES = 6;
  
  // Si aucun parfum dans le panier, pas de validation nécessaire
  if (totalCount === 0) {
    return {
      isValid: true,
      totalCount: 0,
      missing: 0,
      message: null,
    };
  }

  const missing = Math.max(0, MINIMUM_PERFUMES - totalCount);
  const isValid = missing === 0;

  let message = null;
  if (!isValid) {
    if (missing === 1) {
      message = "Ajoutez encore 1 produit parfum pour atteindre le minimum de 6 produits parfum.";
    } else {
      message = `Ajoutez encore ${missing} produits parfum pour atteindre le minimum de 6 produits parfum.`;
    }
  }

  return {
    isValid,
    totalCount,
    missing,
    message,
    minimumRequired: MINIMUM_PERFUMES,
  };
}

