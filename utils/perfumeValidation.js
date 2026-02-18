/**
 * Liste des références de produits parfum (reconnaissance par ref/nom)
 * Ces produits nécessitent un minimum de 6 parfums dans le panier (pros uniquement).
 */
const PERFUME_PRODUCT_REFS = [
  "FANTASIE",
  "SCIC",
  "DEO-CUBE",
  "LUCKY STAR"
];

/**
 * Vérifie si un produit est un parfum (référence ou nom uniquement).
 * On ne s'appuie pas sur la sous-catégorie (ex. "Parfums d'ambiance") car d'autres produits
 * comme Autfloor y sont rattachés sans être des parfums.
 * @param {Object} product - Produit à vérifier
 * @returns {boolean} True si le produit est un parfum
 */
export function isPerfumeProduct(product) {
  if (!product) return false;

  const ref = (product.ref || product.product_ref || "").toUpperCase().trim();
  const name = (product.nom || product.name || "").toUpperCase().trim();

  return PERFUME_PRODUCT_REFS.some((r) => {
    const ru = r.toUpperCase();
    return (ref && (ref.includes(ru) || ref.startsWith(ru) || ref.endsWith(ru)))
      || (name && (name.includes(ru) || name.startsWith(ru) || name.endsWith(ru)));
  });
}

/**
 * Compte la quantité totale de produits parfum dans le panier
 * (ref/nom via PERFUME_PRODUCT_REFS uniquement)
 * @param {Array} cartItems - Items du panier avec leurs produits
 * @returns {number} Quantité totale de produits parfum
 */
export function countTotalPerfumes(cartItems) {
  if (!cartItems || cartItems.length === 0) return 0;

  let totalPerfumeQuantity = 0;
  for (const item of cartItems) {
    if (!item) continue;
    const product = typeof item.productId === "object" && item.productId !== null ? item.productId : null;
    if (product && isPerfumeProduct(product)) {
      totalPerfumeQuantity += item.quantity || 1;
    }
  }
  return totalPerfumeQuantity;
}

const MINIMUM_PERFUMES = 6;

/**
 * Valide que le panier respecte la règle des 6 parfums minimum (pros uniquement).
 * Les parfums sont détectés par ref/nom (PERFUME_PRODUCT_REFS) uniquement.
 * @param {Array} cartItems - Items du panier avec leurs produits
 * @returns {Object} { isValid: boolean, totalCount: number, missing: number, message: string, minimumRequired: number }
 */
export function validatePerfumeMinimum(cartItems) {
  const totalCount = countTotalPerfumes(cartItems);

  if (totalCount === 0) {
    return {
      isValid: true,
      totalCount: 0,
      missing: 0,
      message: null,
      minimumRequired: MINIMUM_PERFUMES,
    };
  }

  const missing = Math.max(0, MINIMUM_PERFUMES - totalCount);
  const isValid = missing === 0;
  let message = null;
  if (!isValid) {
    message = missing === 1
      ? "Ajoutez encore 1 produit parfum pour atteindre le minimum de 6 produits parfum."
      : `Ajoutez encore ${missing} produits parfum pour atteindre le minimum de 6 produits parfum.`;
  }

  return {
    isValid,
    totalCount,
    missing,
    message,
    minimumRequired: MINIMUM_PERFUMES,
  };
}

