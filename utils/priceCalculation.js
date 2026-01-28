import Product from "../models/products.js";

/**
 * Fonction pure de calcul des prix pour un produit
 * Cette fonction est la SEULE source de vérité pour le calcul des prix
 * 
 * @param {Object} product - Le produit avec ses propriétés de prix
 * @param {number} quantity - La quantité
 * @param {boolean} isPro - Si l'utilisateur est un professionnel
 * @returns {Object} { unitPriceHT: number, totalPriceHT: number, unitPriceInCents: number, totalPriceInCents: number }
 */
export async function calculateProductPrice(product, quantity, isPro) {
  if (!product || !product.id) {
    throw new Error("Produit invalide");
  }

  if (quantity <= 0) {
    throw new Error("La quantité doit être supérieure à 0");
  }

  // Récupérer le produit complet depuis la base pour avoir les promotions à jour
  const fullProduct = await Product.findById(product.id);
  if (!fullProduct) {
    throw new Error(`Produit ${product.id} non trouvé`);
  }

  // Déterminer le prix unitaire HT selon le type d'utilisateur
  // Pour les pros : utiliser garage, sinon public_ht
  let unitPriceHT = isPro
    ? (fullProduct.garage || fullProduct.public_ht || 0)
    : (fullProduct.public_ht  || 0);

  // Appliquer la promotion si elle existe
  if (fullProduct.is_promotion && fullProduct.promotion_percentage) {
    const discount = (unitPriceHT * fullProduct.promotion_percentage) / 100;
    unitPriceHT = unitPriceHT - discount;
  }

  // Calculer le total HT
  const totalPriceHT = unitPriceHT * quantity;

  // Convertir en centimes (pour Stripe et comparaison)
  const unitPriceInCents = Math.round(unitPriceHT * 100);
  const totalPriceInCents = Math.round(totalPriceHT * 100);

  return {
    unitPriceHT,
    totalPriceHT,
    unitPriceInCents,
    totalPriceInCents,
  };
}

/**
 * Calcule le prix total pour un panier complet
 * Pour les particuliers : calcule le TTC (HT * 1.2) côté backend
 * Pour les pros : reste en HT
 * 
 * @param {Array} cartItems - Les items du panier
 * @param {boolean} isPro - Si l'utilisateur est un professionnel
 * @returns {Object} { items: Array, totalHT: number, totalTTC: number, totalInCents: number }
 */
export async function calculateCartTotal(cartItems, isPro) {
  if (!cartItems || cartItems.length === 0) {
    return {
      items: [],
      totalHT: 0,
      totalTTC: 0,
      totalInCents: 0,
    };
  }

  const TVA_RATE = 0.2; // 20% - France
  const calculatedItems = [];
  let totalHT = 0;
  let totalTTC = 0;

  for (const item of cartItems) {
    if (!item || !item.productId) continue;

    const priceData = await calculateProductPrice(
      item.productId,
      item.quantity,
      isPro
    );

    // Pour les particuliers : calculer le TTC côté backend (HT * 1.2)
    // Pour les pros : rester en HT
    const unitPriceTTC = isPro 
      ? priceData.unitPriceHT 
      : priceData.unitPriceHT * (1 + TVA_RATE);
    const totalPriceTTC = isPro 
      ? priceData.totalPriceHT 
      : priceData.totalPriceHT * (1 + TVA_RATE);

    // Prix en centimes pour Stripe
    const unitPriceInCents = Math.round(unitPriceTTC * 100);
    const totalPriceInCents = Math.round(totalPriceTTC * 100);

    calculatedItems.push({
      productId: item.productId.id,
      quantity: item.quantity,
      unitPriceHT: priceData.unitPriceHT,
      totalPriceHT: priceData.totalPriceHT,
      unitPriceTTC,
      totalPriceTTC,
      unitPriceInCents,
      totalPriceInCents,
    });

    totalHT += priceData.totalPriceHT;
    totalTTC += totalPriceTTC;
  }

  // Montant total en centimes pour Stripe (TTC pour particuliers, HT pour pros)
  const totalInCents = Math.round(totalTTC * 100);

  return {
    items: calculatedItems,
    totalHT,
    totalTTC,
    totalInCents,
  };
}

