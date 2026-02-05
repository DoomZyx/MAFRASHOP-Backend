# priceCalculation.js - Documentation Technique Production

## 🎯 Objectif du Module

**Source unique de vérité pour tous les calculs de prix dans l'application e-commerce.**

**Fonctions principales :**
- `calculateProductPrice()` : Prix unitaire et total pour un produit (HT, TTC, centimes)
- `calculateCartTotal()` : Total panier avec TVA, promotions, frais de livraison
- `getDeliveryFee()` : Calcul frais de livraison (gratuit si >= 80€ TTC)

**Pourquoi c'est critique :**
- **Sécurité** : Empêche manipulation des prix côté frontend
- **Cohérence** : Un seul endroit pour la logique de calcul
- **TVA intracommunautaire** : Gestion complexe (0% vs 20%)
- **Stripe** : Conversion en centimes pour paiement
- **Audit** : Traçabilité des calculs de prix

---

## 📋 Cas d'Usage Concrets

### Cas 1 : Calcul Prix Produit Simple (Particulier)

**Scénario :**
```
Produit : Pneu Michelin (public_ht: 50€, garage: 45€)
User : Particulier (isPro: false)
Quantité : 2
Promotion : 10% (is_promotion: true, promotion_percentage: 10)
```

**Calcul :**
```javascript
// 1. Prix unitaire HT = public_ht (50€)
unitPriceHT = 50

// 2. Application promotion 10%
discount = 50 * 10 / 100 = 5€
unitPriceHT = 50 - 5 = 45€

// 3. Total HT = 45 * 2 = 90€
totalPriceHT = 90€

// 4. Conversion centimes (pour Stripe)
unitPriceInCents = 4500
totalPriceInCents = 9000
```

**Résultat :**
```javascript
{
  unitPriceHT: 45,
  totalPriceHT: 90,
  unitPriceInCents: 4500,
  totalPriceInCents: 9000
}
```

---

### Cas 2 : Calcul Prix Produit Professionnel (Prix Garage)

**Scénario :**
```
Produit : Pneu Michelin (public_ht: 50€, garage: 45€)
User : Professionnel (isPro: true)
Quantité : 4
Pas de promotion
```

**Calcul :**
```javascript
// 1. Prix unitaire HT = garage (45€) pour les pros
unitPriceHT = 45

// 2. Total HT = 45 * 4 = 180€
totalPriceHT = 180€

// 3. Conversion centimes
unitPriceInCents = 4500
totalPriceInCents = 18000
```

**⚠️ Point critique :** Si `garage` est `null` ou `0`, le système utilise `public_ht` comme fallback (ligne 46).

---

### Cas 3 : Calcul Panier avec TVA Intracommunautaire (Pro UE)

**Scénario :**
```
User : Professionnel français
vatStatus : "validated" (n° TVA UE validé)
Panier : 2 produits (100€ HT + 80€ HT = 180€ HT)
Frais livraison : 7.50€ (panier < 80€ TTC)
```

**Calcul :**
```javascript
// 1. TVA = 0% car vatStatus === "validated"
TVA_RATE = 0

// 2. Prix produits TTC = HT * (1 + 0) = HT
totalTTC = 180€

// 3. Frais livraison (panier 180€ TTC > 80€ → gratuit)
deliveryFee = 0

// 4. Total final = 180€ TTC
totalInCents = 18000
```

**Résultat :**
```javascript
{
  items: [...],
  totalHT: 180,
  totalTTC: 180,  // Pas de TVA
  totalInCents: 18000,
  vatRate: 0
}
```

---

### Cas 4 : Calcul Panier Particulier (TVA 20%)

**Scénario :**
```
User : Particulier
Panier : 1 produit (50€ HT)
Promotion : 10% → 45€ HT
Frais livraison : 7.50€ (panier < 80€ TTC)
```

**Calcul :**
```javascript
// 1. TVA = 20% (particulier)
TVA_RATE = 0.2

// 2. Prix produit TTC = 45 * 1.2 = 54€
totalTTC = 54€

// 3. Frais livraison TTC = 7.50 * 1.2 = 9€
deliveryFeeTTC = 9€

// 4. Total final = 54 + 9 = 63€ TTC
totalInCents = 6300
```

**⚠️ Point critique :** Les frais de livraison sont calculés sur le `totalTTC` AVANT ajout des frais (ligne 226 de `payment.js`).

---

### Cas 5 : Livraison Gratuite (Panier >= 80€ TTC)

**Scénario :**
```
Panier : 3 produits = 85€ TTC
FREE_SHIPPING_THRESHOLD = 80€
```

**Calcul :**
```javascript
// getDeliveryFee(85) → 0 car 85 >= 80
deliveryFee = 0
```

**Résultat :** Livraison gratuite, total = 85€ TTC

---

### Cas 6 : Produit Non Trouvé en Base

**Scénario :**
```
User ajoute produit ID 999 au panier
Produit 999 n'existe plus en DB
```

**Comportement :**
```javascript
// calculateProductPrice() ligne 38-41
const fullProduct = await Product.findById(product.id);
if (!fullProduct) {
  throw new Error(`Produit ${product.id} non trouvé`);
}
```

**Impact :** Erreur 500, panier invalide. Le contrôleur `payment.js` vérifie le stock AVANT d'appeler `calculateCartTotal()` (ligne 180-213).

---

## 💻 Exemples de Code Commentés

### Utilisation Basique : Calcul Prix Produit

```javascript
import { calculateProductPrice } from "../utils/priceCalculation.js";

// Cas particulier
const product = { id: 123, public_ht: 50, garage: 45 };
const priceData = await calculateProductPrice(product, 2, false);

console.log(priceData);
// {
//   unitPriceHT: 50,
//   totalPriceHT: 100,
//   unitPriceInCents: 5000,
//   totalPriceInCents: 10000
// }

// Cas professionnel
const priceDataPro = await calculateProductPrice(product, 2, true);
console.log(priceDataPro);
// {
//   unitPriceHT: 45,  // Utilise garage
//   totalPriceHT: 90,
//   unitPriceInCents: 4500,
//   totalPriceInCents: 9000
// }
```

---

### Utilisation Avancée : Calcul Panier Complet

```javascript
import { calculateCartTotal, getDeliveryFee } from "../utils/priceCalculation.js";

// Panier avec 2 produits
const cartItems = [
  { productId: { id: 1 }, quantity: 2 },
  { productId: { id: 2 }, quantity: 1 }
];

// User pro avec TVA validée
const user = {
  id: 45,
  isPro: true,
  company: {
    vatStatus: "validated"  // TVA 0%
  }
};

const cartCalculation = await calculateCartTotal(cartItems, true, user);

console.log(cartCalculation);
// {
//   items: [
//     {
//       productId: 1,
//       quantity: 2,
//       unitPriceHT: 45,
//       totalPriceHT: 90,
//       unitPriceTTC: 45,  // Pas de TVA
//       totalPriceTTC: 90,
//       unitPriceInCents: 4500,
//       totalPriceInCents: 9000
//     },
//     { ... }
//   ],
//   totalHT: 180,
//   totalTTC: 180,  // Pas de TVA
//   totalInCents: 18000,
//   vatRate: 0
// }

// Calculer frais livraison
const deliveryFee = getDeliveryFee(cartCalculation.totalTTC);
// Si totalTTC >= 80 → 0, sinon 7.50€
```

---

### Intégration dans Contrôleur Payment

```javascript
// backend/controllers/payment.js ligne 217
const cartCalculation = await calculateCartTotal(cartItems, isPro, request.user);

// Vérification sécurité
if (cartCalculation.items.length === 0) {
  return reply.code(400).send({
    success: false,
    message: "Aucun produit valide dans le panier",
  });
}

// Ajouter frais livraison
const deliveryFee = getDeliveryFee(cartCalculation.totalTTC);
const totalWithDelivery = cartCalculation.totalTTC + deliveryFee;

// Conversion centimes pour Stripe
const totalInCentsWithDelivery = Math.round(totalWithDelivery * 100);
```

---

## ⚠️ Effets de Bord / Points d'Attention

### 1. **Promotions Appliquées Dynamiquement**

**Comportement :**
```javascript
// Ligne 38 : Récupération produit depuis DB
const fullProduct = await Product.findById(product.id);
```

**Impact :** Les promotions sont toujours à jour (pas de cache). Si une promotion change pendant le checkout, le prix change aussi.

**⚠️ Point critique :** Si un utilisateur ajoute un produit en promotion au panier, puis la promotion expire avant le checkout, le prix augmente. Le contrôleur `payment.js` vérifie le stock mais pas les changements de prix.

**Recommandation :** Stocker le prix snapshot dans la commande (déjà fait ligne 288-289 de `payment.js`).

---

### 2. **TVA Intracommunautaire : Logique Complexe**

**Règle :**
```javascript
// Ligne 95-96
const hasValidatedVat = user?.company?.vatStatus === "validated";
const TVA_RATE = hasValidatedVat ? 0 : 0.2;
```

**Conditions pour TVA 0% :**
- ✅ `user.isPro === true`
- ✅ `user.company.vatStatus === "validated"`

**⚠️ Point critique :** Si `user.company` est `null` ou `vatStatus !== "validated"`, TVA = 20% même pour un pro.

**Vérification :**
```javascript
// Exemple : Pro sans TVA validée
const user = { isPro: true, company: null };
// → TVA = 20% (pas 0%)
```

---

### 3. **Prix Garage vs Public : Fallback**

**Comportement :**
```javascript
// Ligne 45-47
let unitPriceHT = isPro
  ? (fullProduct.garage || fullProduct.public_ht || 0)
  : (fullProduct.public_ht || 0);
```

**Impact :**
- Si `garage` est `null` ou `0`, utilise `public_ht` pour les pros
- Si `public_ht` est aussi `null` ou `0`, prix = 0€

**⚠️ Point critique :** Un produit avec `garage: 0` et `public_ht: 50` sera vendu 50€ aux pros (pas 0€). Vérifier la logique métier.

---

### 4. **Arrondis et Conversion Centimes**

**Comportement :**
```javascript
// Ligne 59-60
const unitPriceInCents = Math.round(unitPriceHT * 100);
const totalPriceInCents = Math.round(totalPriceHT * 100);
```

**Exemple :**
```javascript
// Prix HT = 45.555€
unitPriceInCents = Math.round(45.555 * 100) = 4556 centimes

// Total HT = 91.11€
totalPriceInCents = Math.round(91.11 * 100) = 9111 centimes
```

**⚠️ Point critique :** Les arrondis peuvent créer des écarts de 1 centime entre le total calculé et la somme des items. Stripe tolère généralement 1-2 centimes d'écart.

---

### 5. **Frais de Livraison : Calcul sur Total TTC**

**Comportement :**
```javascript
// Ligne 226 de payment.js
const deliveryFee = getDeliveryFee(cartCalculation.totalTTC);
```

**Impact :** Le seuil de 80€ est vérifié sur le total TTC AVANT ajout des frais de livraison.

**Exemple :**
```
Panier : 79.50€ TTC
→ Frais livraison = 7.50€
→ Total = 87€ TTC
```

**⚠️ Point critique :** Un panier à 79.99€ TTC paie la livraison, même si le total final dépasse 80€.

---

### 6. **Items Invalides Ignorés Silencieusement**

**Comportement :**
```javascript
// Ligne 103
if (!item || !item.productId) continue;
```

**Impact :** Si un item du panier est invalide (pas de `productId`), il est ignoré sans erreur.

**⚠️ Point critique :** Un panier avec 3 items dont 1 invalide retournera un total pour 2 items seulement. L'utilisateur ne sera pas averti.

**Recommandation :** Logger les items ignorés ou retourner un warning.

---

## 🔍 Debug en Production

### Problème : "Prix incorrect pour un professionnel"

**Vérifications :**

```javascript
// 1. Vérifier le produit en DB
const product = await Product.findById(productId);
console.log({
  public_ht: product.public_ht,
  garage: product.garage,
  is_promotion: product.is_promotion,
  promotion_percentage: product.promotion_percentage
});

// 2. Vérifier le calcul
const priceData = await calculateProductPrice(product, quantity, true);
console.log(priceData);

// 3. Vérifier si garage est null (fallback sur public_ht)
if (product.garage === null || product.garage === 0) {
  console.warn("Prix garage manquant, utilisation public_ht");
}
```

**Causes possibles :**
- `garage` est `null` → utilise `public_ht` (fallback)
- Promotion non appliquée → vérifier `is_promotion` et `promotion_percentage`
- Produit modifié entre ajout panier et checkout

---

### Problème : "TVA 20% appliquée à un pro UE"

**Vérifications :**

```sql
-- Vérifier le statut TVA de l'utilisateur
SELECT id, is_pro, company->>'vatStatus' as vat_status
FROM users 
WHERE id = 123;

-- Résultat attendu pour TVA 0% :
-- is_pro: true
-- vat_status: "validated"
```

```javascript
// Vérifier dans le code
const user = await User.findById(userId);
console.log({
  isPro: user.isPro,
  company: user.company,
  vatStatus: user.company?.vatStatus
});

// Si vatStatus !== "validated" → TVA 20%
```

**Causes possibles :**
- `user.company` est `null`
- `vatStatus` n'est pas `"validated"` (ex: `"pending"`, `"rejected"`)
- Structure `user.company` incorrecte

---

### Problème : "Total Stripe différent du total calculé"

**Scénario :**
```
Backend calcule : 100.00€ TTC
Stripe reçoit : 100.01€
→ Webhook rejette (écart > tolérance)
```

**Vérifications :**

```javascript
// 1. Vérifier les arrondis
const totalTTC = 100.005;  // Exemple
const totalInCents = Math.round(totalTTC * 100);  // 10001 centimes

// 2. Vérifier la somme des items vs total
let sumItems = 0;
cartCalculation.items.forEach(item => {
  sumItems += item.totalPriceTTC;
});
console.log({
  totalTTC: cartCalculation.totalTTC,
  sumItems: sumItems,
  difference: Math.abs(cartCalculation.totalTTC - sumItems)
});

// 3. Vérifier les frais de livraison
const deliveryFee = getDeliveryFee(cartCalculation.totalTTC);
console.log({
  totalTTC: cartCalculation.totalTTC,
  deliveryFee: deliveryFee,
  totalWithDelivery: cartCalculation.totalTTC + deliveryFee
});
```

**Causes possibles :**
- Arrondis cumulatifs (chaque item arrondi séparément)
- Frais de livraison non inclus dans le calcul
- TVA appliquée différemment sur items vs total

---

### Problème : "Livraison payante alors que panier >= 80€"

**Vérifications :**

```javascript
// 1. Vérifier le total TTC
console.log({
  totalTTC: cartCalculation.totalTTC,
  threshold: FREE_SHIPPING_THRESHOLD,  // 80
  shouldBeFree: cartCalculation.totalTTC >= FREE_SHIPPING_THRESHOLD
});

// 2. Vérifier le calcul frais livraison
const deliveryFee = getDeliveryFee(cartCalculation.totalTTC);
console.log({
  totalTTC: cartCalculation.totalTTC,
  deliveryFee: deliveryFee,
  expected: cartCalculation.totalTTC >= 80 ? 0 : 7.5
});
```

**Causes possibles :**
- Total TTC < 80€ (vérifier TVA appliquée)
- Frais de livraison calculés AVANT ajout des frais (comportement attendu)
- Seuil modifié dans le code mais pas en DB

---

## 🛡️ Protection Automatique / Garde-Fous

### 1. **Validation Produit Existant**
✅ Déjà implémenté : `Product.findById()` vérifie l'existence (ligne 38-41)

### 2. **Validation Quantité**
✅ Déjà implémenté : `quantity <= 0` → erreur (ligne 33-35)

### 3. **Calcul Côté Serveur (Source de Vérité)**
✅ Déjà implémenté : `calculateCartTotal()` appelé dans `payment.js` (ligne 217)

### 4. **Snapshot Prix dans Commande**
✅ Déjà implémenté : Prix stockés en HT dans la commande (ligne 288-289 de `payment.js`)

### 5. **⚠️ Manque : Validation Prix Négatif**
❌ Pas de vérification si `unitPriceHT < 0`

**Recommandation :**
```javascript
if (unitPriceHT < 0) {
  throw new Error(`Prix invalide pour produit ${product.id}: ${unitPriceHT}`);
}
```

### 6. **⚠️ Manque : Logging Items Ignorés**
❌ Items invalides ignorés silencieusement (ligne 103)

**Recommandation :**
```javascript
if (!item || !item.productId) {
  console.warn(`[AUDIT PRICE] Item invalide ignoré:`, item);
  continue;
}
```

---

## 📊 Maintenance / Nettoyage

### Logs à Surveiller

```bash
# Chercher les erreurs de calcul de prix
grep -i "produit.*non trouvé" /var/log/app.log
grep -i "prix.*invalide" /var/log/app.log
```

### Métriques à Monitorer

```sql
-- Vérifier les écarts entre prix calculés et prix Stripe
SELECT 
  o.id,
  o.expected_amount as expected_cents,
  o.total_amount as total_euros,
  (o.expected_amount / 100.0) as expected_euros,
  ABS((o.expected_amount / 100.0) - o.total_amount) as difference_euros
FROM orders o
WHERE o.status = 'paid'
  AND ABS((o.expected_amount / 100.0) - o.total_amount) > 0.01
ORDER BY o.created_at DESC
LIMIT 10;
```

**Interprétation :**
- `difference_euros > 0.01` → Écart suspect (vérifier arrondis)
- `difference_euros > 0.05` → Problème probable (investiguer)

---

## 🚨 Checklist Avant Déploiement Production

- [ ] Vérifier que tous les produits ont `public_ht` défini
- [ ] Vérifier que les produits pros ont `garage` défini (ou fallback acceptable)
- [ ] Tester TVA 0% avec un pro UE (`vatStatus: "validated"`)
- [ ] Tester TVA 20% avec un pro sans TVA validée
- [ ] Tester promotions (10%, 20%, 50%)
- [ ] Tester seuil livraison gratuite (79.99€ vs 80.00€)
- [ ] Vérifier arrondis (prix avec décimales)
- [ ] Tester panier vide → doit retourner `{ items: [], totalHT: 0, ... }`
- [ ] Vérifier que les prix snapshot dans les commandes correspondent aux calculs

---

## 📝 Notes Techniques

**Fichier :** `backend/utils/priceCalculation.js`

**Dépendances :**
- `Product` (modèle produits)
- Table `products` avec colonnes : `id`, `public_ht`, `garage`, `is_promotion`, `promotion_percentage`

**Constantes :**
- `FREE_SHIPPING_THRESHOLD = 80` (euros TTC)
- `DELIVERY_FEE = 7.5` (euros)
- `TVA_RATE = 0.2` (20%) ou `0` (pro UE validé)

**Formats de retour :**
- Prix HT/TTC : `number` (euros, décimales)
- Prix centimes : `number` (entier, pour Stripe)

---

## 🔗 Fichiers Liés

- **`backend/controllers/payment.js`** : Utilise `calculateCartTotal()` pour calculer les prix avant création commande Stripe
- **`backend/models/products.js`** : Modèle Product (méthode `findById()`)
- **`backend/models/user.js`** : Modèle User (propriété `company.vatStatus`)

---

## 🧪 Tests Recommandés

### Test 1 : Prix Pro vs Particulier
```javascript
const product = { id: 1, public_ht: 50, garage: 45 };
const priceParticulier = await calculateProductPrice(product, 1, false);
const pricePro = await calculateProductPrice(product, 1, true);
// priceParticulier.unitPriceHT = 50
// pricePro.unitPriceHT = 45
```

### Test 2 : Promotion
```javascript
const product = { 
  id: 1, 
  public_ht: 100, 
  is_promotion: true, 
  promotion_percentage: 20 
};
const price = await calculateProductPrice(product, 1, false);
// price.unitPriceHT = 80 (100 - 20%)
```

### Test 3 : TVA Intracommunautaire
```javascript
const user = { isPro: true, company: { vatStatus: "validated" } };
const cart = await calculateCartTotal(items, true, user);
// cart.vatRate = 0
// cart.totalTTC = cart.totalHT (pas de TVA)
```

### Test 4 : Livraison Gratuite
```javascript
const fee1 = getDeliveryFee(79.99);  // 7.5
const fee2 = getDeliveryFee(80.00);  // 0
const fee3 = getDeliveryFee(100.00); // 0
```

---

**Dernière mise à jour :** 2026-07-04  
**Auteur :** Documentation technique production  
**Version :** 1.0

