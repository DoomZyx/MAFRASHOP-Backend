import Product from "../models/products.js";

/** Seuil en euros TTC au-delà duquel la livraison est gratuite */
export const FREE_SHIPPING_THRESHOLD = 80;

/** Frais de livraison en euros si panier < FREE_SHIPPING_THRESHOLD */
export const DELIVERY_FEE = 6.5;

/**
 * Calcule les frais de livraison selon le montant du panier TTC
 * @param {number} subtotalTTC - Sous-total panier TTC en euros
 * @returns {number} Frais de livraison en euros (0 si subtotalTTC >= FREE_SHIPPING_THRESHOLD)
 */
export function getDeliveryFee(subtotalTTC) {
  if (subtotalTTC >= FREE_SHIPPING_THRESHOLD) return 0;
  return DELIVERY_FEE;
}

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
 * Calcule le prix total pour un panier complet avec gestion TVA intracommunautaire
 * 
 * Règles TVA :
 * - Si user.company.vatStatus === "validated" → TVA 0% (pros UE avec n° TVA validé)
 * - Sinon → TVA 20% (particuliers et pros sans TVA validée)
 * 
 * @param {Array} cartItems - Les items du panier
 * @param {boolean} isPro - Si l'utilisateur est un professionnel
 * @param {Object} user - Objet utilisateur complet (pour vérifier vatStatus)
 * @returns {Object} { items: Array, totalHT: number, totalTTC: number, totalInCents: number, vatRate: number }
 */
export async function calculateCartTotal(cartItems, isPro, user = null) {
  if (!cartItems || cartItems.length === 0) {
    return {
      items: [],
      totalHT: 0,
      totalTTC: 0,
      totalInCents: 0,
      vatRate: 0,
    };
  }

  // Déterminer le taux de TVA selon le statut de validation TVA intracommunautaire
  // RÈGLE CRITIQUE : TVA 0% UNIQUEMENT si vatStatus === "validated"
  const hasValidatedVat = user?.company?.vatStatus === "validated";
  const TVA_RATE = hasValidatedVat ? 0 : 0.2; // 0% si TVA UE validée, sinon 20%

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

    // TTC = HT * (1 + TVA) pour tous (particuliers et pros)
    const unitPriceTTC = priceData.unitPriceHT * (1 + TVA_RATE);
    const totalPriceTTC = priceData.totalPriceHT * (1 + TVA_RATE);

    // Prix en centimes pour Stripe (toujours TTC)
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

  // Montant total en centimes pour Stripe (TTC pour tous)
  const totalInCents = Math.round(totalTTC * 100);

  return {
    items: calculatedItems,
    totalHT,
    totalTTC,
    totalInCents,
    vatRate: TVA_RATE, // Retourner le taux appliqué pour audit/affichage
  };
}

