# expirePendingOrders.js - Documentation Technique Production

## 🎯 Objectif du Module

**Expire automatiquement les commandes en statut `pending` de plus de 48 heures et les passe en `cancelled`.**

**Pourquoi c'est critique :**
- Évite l'accumulation de commandes fantômes qui polluent la DB
- Libère le stock réservé (si le stock est décompté à la création de commande)
- Nettoie les sessions Stripe orphelines
- Améliore la précision des analytics (taux d'abandon réel)

---

## 📋 Cas d'Usage Concrets

### Cas 1 : Utilisateur Abandonne le Checkout

**Scénario :**
```
10h00 - User crée checkout → Commande #123 créée (status: pending)
10h01 - User clique sur "Retour" au lieu de payer
10h02 - User ferme l'onglet
→ Commande #123 reste en "pending" indéfiniment
```

**Impact sans ce script :**
- Commande #123 reste en DB pour toujours
- Analytics faussées (taux de conversion incorrect)
- Si stock décompté : produit bloqué inutilement
- Si session Stripe valide : risque paiement tardif sur commande obsolète

**Avec ce script (après 48h) :**
- Commande #123 → status `cancelled`
- Stock libéré (si applicable)
- Analytics correctes

---

### Cas 2 : Session Stripe Expire Mais Commande Reste Pending

**Scénario :**
```
Jour 1 - User crée checkout → Commande #456 (pending) + Session Stripe
Jour 1 - Session Stripe expire (30 min par défaut)
Jour 3 - Script expire la commande → status cancelled
Jour 4 - User trouve le lien Stripe dans ses emails et paye
→ Webhook Stripe arrive avec paiement sur commande cancelled
```

**Protection existante :**
Le webhook Stripe (`payment.js`) détecte ce cas et fait un **refund automatique** :

```javascript
// Dans stripeWebhook (payment.js ligne 425)
if (order.status === "cancelled") {
  // Refund automatique pour éviter fraude/incohérence
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    reason: "requested_by_customer",
  });
}
```

**⚠️ Point d'attention :** Le refund est automatique, mais l'utilisateur peut contacter le support. Prévoir un processus de gestion.

---

### Cas 3 : Bug Réseau / Double-Click Crée Plusieurs Commandes Pending

**Scénario :**
```
User spam le bouton "Payer" → 3 commandes pending créées (#789, #790, #791)
User ne paie aucune
→ 3 commandes fantômes en DB
```

**Protection existante :**
`createCheckoutSession` vérifie déjà les commandes pending existantes et réutilise la session si possible. Mais si plusieurs sont créées, ce script nettoie celles de plus de 48h.

---

## 💻 Exemples de Code Commentés

### Exécution Manuelle (Debug)

```javascript
// Depuis le répertoire backend/
node utils/expirePendingOrders.js

// Sortie attendue :
// 3 commande(s) pending expirée(s) et annulée(s)
//   - Commande 123 (user 45) créée le 2024-01-10T08:00:00Z
//   - Commande 124 (user 46) créée le 2024-01-10T09:30:00Z
//   - Commande 125 (user 47) créée le 2024-01-10T10:15:00Z
// 
// Script terminé : 3 commande(s) expirée(s)
```

### Intégration Cron (Production)

```bash
# Crontab (exécution quotidienne à 2h du matin)
0 2 * * * cd /path/to/backend && node utils/expirePendingOrders.js >> /var/log/expire-orders.log 2>&1
```

### Utilisation Programmatique (API / Admin)

```javascript
// Si vous voulez expirer manuellement depuis une route admin
import { expirePendingOrders } from "../utils/expirePendingOrders.js";

export const adminExpireOrders = async (request, reply) => {
  try {
    const count = await expirePendingOrders();
    reply.send({
      success: true,
      message: `${count} commande(s) expirée(s)`,
      count,
    });
  } catch (error) {
    console.error("Erreur expiration commandes:", error);
    reply.code(500).send({ error: "Erreur lors de l'expiration" });
  }
};
```

**⚠️ Note :** Le script actuel ferme le pool DB (`pool.end()`). Si vous l'utilisez dans une API, **retirez cette ligne** ou créez une version sans `pool.end()`.

---

## ⚠️ Effets de Bord / Points d'Attention

### 1. **Fermeture du Pool DB (CRITIQUE)**

```javascript
// Ligne 44 : await pool.end();
```

**Problème :** Si ce script est exécuté dans un processus partagé (ex: API Fastify), il ferme le pool pour TOUS les autres processus.

**Solution :**
- ✅ **OK si exécuté en script standalone** (cron, CLI)
- ❌ **PAS OK si importé dans l'API** → Créer une version sans `pool.end()`

**Version safe pour API :**
```javascript
export async function expirePendingOrders() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // ... même logique ...
    await client.query("COMMIT");
    return expiredCount;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    // ❌ PAS de pool.end() ici
  }
}
```

---

### 2. **Délai de 48h (Pas 24h)**

**Incohérence dans le code :**
- Commentaire dit "24h" (ligne 4)
- SQL utilise `INTERVAL '48 hours'` (ligne 19)

**Impact :** Les commandes sont expirées après 48h, pas 24h.

**Recommandation :** Aligner le commentaire avec le code, ou rendre le délai configurable :

```javascript
const EXPIRATION_DELAY_HOURS = process.env.ORDER_EXPIRATION_HOURS || 48;
const result = await client.query(
  `UPDATE orders 
   SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
   WHERE status = 'pending' 
   AND created_at < NOW() - INTERVAL '${EXPIRATION_DELAY_HOURS} hours'`
);
```

---

### 3. **Pas de Libération de Stock Automatique**

**État actuel :** Le script change juste le status, il ne libère PAS le stock.

**Vérifier si nécessaire :**
- Si le stock est décompté à la création de commande (`createCheckoutSession`)
- Si oui, ajouter la libération de stock ici

**Exemple d'ajout :**
```javascript
// Après l'UPDATE orders
for (const order of result.rows) {
  // Récupérer les items de la commande
  const orderItems = await Order.getItems(order.id);
  
  // Libérer le stock pour chaque produit
  for (const item of orderItems) {
    await Product.incrementStock(item.product_id, item.quantity);
  }
}
```

**⚠️ Action requise :** Vérifier si le stock est décompté à la création de commande. Si oui, ajouter la libération ici.

---

### 4. **Pas de Notification Utilisateur**

**État actuel :** L'utilisateur n'est pas notifié que sa commande a expiré.

**Impact :** Si l'utilisateur revient après 48h, il ne comprend pas pourquoi sa commande est annulée.

**Recommandation (optionnel) :**
```javascript
// Après expiration, envoyer email
for (const order of result.rows) {
  const user = await User.findById(order.user_id);
  await sendEmail({
    to: user.email,
    subject: "Votre commande a expiré",
    template: "order-expired",
    data: { orderId: order.id },
  });
}
```

---

### 5. **Transaction Atomique (BON POINT)**

Le script utilise une transaction (`BEGIN` / `COMMIT` / `ROLLBACK`), ce qui garantit :
- Soit toutes les commandes sont expirées
- Soit aucune (en cas d'erreur)

**✅ C'est correct, ne pas modifier.**

---

## 🔍 Debug en Production

### Problème : "Aucune commande n'est expirée alors qu'il devrait y en avoir"

**Vérifications :**

```sql
-- 1. Vérifier les commandes pending de plus de 48h
SELECT id, user_id, status, created_at, 
       NOW() - created_at AS age,
       (NOW() - created_at) > INTERVAL '48 hours' AS should_expire
FROM orders 
WHERE status = 'pending'
ORDER BY created_at ASC;

-- 2. Vérifier le fuseau horaire de la DB
SELECT NOW(), CURRENT_TIMESTAMP, timezone('UTC', NOW());

-- 3. Vérifier les commandes récemment cancelled (pour voir si le script tourne)
SELECT id, status, updated_at, created_at
FROM orders 
WHERE status = 'cancelled' 
  AND updated_at > NOW() - INTERVAL '1 day'
ORDER BY updated_at DESC;
```

**Causes possibles :**
- Cron job ne tourne pas (vérifier logs)
- Fuseau horaire DB différent de l'app
- Condition SQL incorrecte (vérifier `created_at` vs `updated_at`)

---

### Problème : "Le script ferme la connexion DB et casse l'API"

**Symptôme :** Après exécution du script, l'API retourne des erreurs de connexion DB.

**Cause :** `pool.end()` ferme le pool pour tous les processus.

**Solution :** Exécuter le script en processus séparé (cron), pas dans l'API.

---

### Problème : "Un utilisateur a payé mais sa commande est cancelled"

**Scénario :**
```
Jour 1 - Commande #999 créée (pending)
Jour 3 - Script expire → status cancelled
Jour 4 - User paye via lien Stripe (session encore valide)
→ Webhook arrive avec paiement sur commande cancelled
```

**Vérification :**

```javascript
// Dans les logs webhook Stripe
// Chercher : "Paiement reçu pour commande X expirée/annulée"
```

**Protection existante :** Le webhook fait un refund automatique (voir `payment.js` ligne 425).

**Action manuelle si nécessaire :**
```sql
-- Vérifier si refund a été créé
SELECT * FROM stripe_webhook_events 
WHERE order_id = 999 
  AND event_type = 'checkout.session.completed'
ORDER BY created_at DESC;

-- Si pas de refund, créer manuellement dans Stripe Dashboard
-- ou via API :
const refund = await stripe.refunds.create({
  payment_intent: paymentIntentId,
  reason: "requested_by_customer",
});
```

---

## 🛡️ Protection Automatique / Garde-Fous

### 1. **Transaction Atomique**
✅ Déjà implémenté : `BEGIN` / `COMMIT` / `ROLLBACK`

### 2. **Gestion Erreurs**
✅ Déjà implémenté : `try/catch` avec rollback et logs

### 3. **Webhook Stripe Gère les Commandes Cancelled**
✅ Déjà implémenté : Refund automatique si paiement sur commande cancelled

### 4. **⚠️ Manque : Libération de Stock**
❌ À vérifier/implémenter si le stock est décompté à la création

### 5. **⚠️ Manque : Notification Utilisateur**
❌ Optionnel mais recommandé pour UX

---

## 📊 Maintenance / Nettoyage

### Logs à Surveiller

```bash
# Logs cron (si configuré)
tail -f /var/log/expire-orders.log

# Chercher les patterns :
# - "X commande(s) pending expirée(s)" → Normal
# - "Erreur lors de l'expiration" → À investiguer
```

### Métriques à Monitorer

```sql
-- Nombre de commandes pending par tranche d'âge
SELECT 
  CASE 
    WHEN created_at > NOW() - INTERVAL '1 hour' THEN '< 1h'
    WHEN created_at > NOW() - INTERVAL '24 hours' THEN '1-24h'
    WHEN created_at > NOW() - INTERVAL '48 hours' THEN '24-48h'
    ELSE '> 48h'
  END AS age_range,
  COUNT(*) as count
FROM orders 
WHERE status = 'pending'
GROUP BY age_range
ORDER BY age_range;
```

**Interprétation :**
- `> 48h` > 0 → Script ne tourne pas ou bug
- `24-48h` élevé → Normal (en attente d'expiration)
- `< 1h` élevé → Normal (checkouts récents)

---

## 🚨 Checklist Avant Déploiement Production

- [ ] Vérifier que le script est exécuté en processus standalone (cron), pas dans l'API
- [ ] Vérifier si le stock est décompté à la création de commande → Si oui, ajouter libération de stock
- [ ] Aligner le commentaire (24h) avec le code (48h) ou rendre configurable
- [ ] Configurer le cron job (ex: quotidien à 2h du matin)
- [ ] Configurer les logs (redirection vers fichier)
- [ ] Tester manuellement sur staging avec une commande pending de test
- [ ] Vérifier que le webhook Stripe gère bien les commandes cancelled (refund automatique)

---

## 📝 Notes Techniques

**Fichier :** `backend/utils/expirePendingOrders.js`

**Dépendances :**
- `pool` (connexion DB PostgreSQL)
- Table `orders` avec colonnes : `id`, `status`, `created_at`, `updated_at`, `user_id`

**Statuts de commande gérés :**
- `pending` → `cancelled` (après 48h)

**Statuts non gérés par ce script :**
- `paid` (déjà confirmée)
- `shipped` (déjà expédiée)
- `cancelled` (déjà annulée)
- `refunded` (déjà remboursée)

---

## 🔗 Fichiers Liés

- **`backend/controllers/payment.js`** : Gère les webhooks Stripe et les refunds automatiques pour commandes cancelled
- **`backend/models/order.js`** : Modèle Order (méthodes `findPendingByUserId`, `updateStatus`)
- **Cron job** : À configurer séparément (ex: `/etc/cron.daily/expire-orders`)

---

**Dernière mise à jour :** 2026-07-04  
**Auteur :** Documentation technique
**Version :** 1.0

