# Guide : Paiements, Factures, Commandes et Livraisons

## 📋 Comment fonctionnent les paiements actuellement

### Flux de paiement actuel

1. **Utilisateur clique sur "COMMANDER"** dans le panier
   - Le frontend appelle `/api/payment/create-checkout-session`
   - Le backend crée une commande en statut `pending` dans la table `orders`
   - Le backend crée une session Stripe Checkout

2. **Redirection vers Stripe**
   - L'utilisateur est redirigé vers la page de paiement Stripe
   - Il entre ses informations de carte bancaire
   - Stripe collecte l'adresse de livraison

3. **Paiement réussi**
   - Stripe redirige vers `/checkout/success?session_id=xxx`
   - Le webhook Stripe (`checkout.session.completed`) est déclenché
   - Le backend met à jour la commande en statut `paid`
   - Le panier est vidé automatiquement

4. **Données stockées**
   - Commande dans `orders` avec statut, montant, adresse de livraison
   - Items dans `order_items` avec produits, quantités, prix
   - `stripe_payment_intent_id` et `stripe_session_id` pour traçabilité

## 🧪 Comment tester les paiements

### 1. Configuration initiale

```bash
# Backend
cd backend
pnpm install
pnpm run migrate:orders
pnpm run migrate:orders-ispro

# Ajouter dans .env
STRIPE_SECRET_KEY=sk_test_... # Clé de test Stripe
STRIPE_WEBHOOK_SECRET=whsec_... # Secret webhook (voir ci-dessous)
FRONTEND_URL=http://localhost:5173
```

### 2. Tester en local avec Stripe CLI

**Installer Stripe CLI :**
- Windows : Télécharger depuis [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli)
- Ou via Chocolatey : `choco install stripe`

**Configurer les webhooks en local :**
```bash
# Se connecter à Stripe
stripe login

# Rediriger les webhooks vers votre serveur local
stripe listen --forward-to localhost:8080/api/payment/webhook
```

**Copier le webhook secret** affiché (commence par `whsec_`) et l'ajouter dans `.env` :
```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Cartes de test Stripe

Utilisez ces numéros de carte pour tester :

| Numéro de carte | Résultat |
|----------------|----------|
| `4242 4242 4242 4242` | Paiement réussi |
| `4000 0000 0000 0002` | Paiement refusé |
| `4000 0000 0000 9995` | Carte insuffisante |

**Date d'expiration :** N'importe quelle date future (ex: 12/25)  
**CVC :** N'importe quel 3 chiffres (ex: 123)  
**Code postal :** N'importe quel code postal valide

### 4. Tester manuellement

1. Démarrer le backend : `pnpm dev`
2. Démarrer le frontend : `pnpm dev`
3. Ajouter des produits au panier
4. Cliquer sur "COMMANDER"
5. Utiliser une carte de test Stripe
6. Vérifier dans la base de données que la commande est `paid`

### 5. Tester les webhooks

```bash
# Déclencher un événement de test
stripe trigger checkout.session.completed

# Voir les logs en temps réel
stripe logs tail
```

## 📄 Implémentation des Factures

### Ce qui manque actuellement

- Génération de PDF de facture
- Stockage des factures (table `invoices`)
- Numérotation automatique des factures
- Téléchargement des factures par les clients
- Envoi par email des factures

### Étape 1 : Créer la table invoices

Créer `backend/script/createInvoicesTable.sql` :

```sql
-- Table pour les factures
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
  pdf_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
```

### Étape 2 : Installer une librairie PDF

```bash
cd backend
pnpm add pdfkit
```

### Étape 3 : Créer le modèle Invoice

Créer `backend/models/invoices.js` (similaire à `orders.js`)

### Étape 4 : Créer le contrôleur de génération PDF

Créer `backend/controllers/invoices.js` avec :
- `generateInvoice(orderId)` : Génère le PDF
- `downloadInvoice(invoiceId)` : Télécharge le PDF
- `sendInvoiceByEmail(invoiceId)` : Envoie par email

### Étape 5 : Créer la route

```javascript
// backend/routes/invoices.js
fastify.get("/api/invoices/:orderId", { preHandler: verifyToken }, downloadInvoice);
fastify.post("/api/invoices/:orderId/generate", { preHandler: verifyToken }, generateInvoice);
```

### Étape 6 : Générer automatiquement après paiement

Modifier `backend/controllers/payment.js` dans le webhook :
```javascript
if (event.type === "checkout.session.completed") {
  // ... code existant ...
  
  // Générer la facture automatiquement
  await Invoice.createFromOrder(order.id);
}
```

## 🚚 Implémentation du Système de Livraison

### Ce qui manque actuellement

- Table `deliveries` pour suivre les livraisons
- Statuts de livraison (en préparation, expédiée, en transit, livrée)
- Numéro de suivi
- Dates de livraison estimée et réelle
- Interface admin pour gérer les livraisons

### Étape 1 : Créer la table deliveries

Créer `backend/script/createDeliveriesTable.sql` :

```sql
-- Table pour les livraisons
CREATE TABLE IF NOT EXISTS deliveries (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'shipped', 'in_transit', 'delivered', 'failed')),
  tracking_number VARCHAR(100),
  carrier VARCHAR(100), -- Ex: "Colissimo", "Chronopost", etc.
  estimated_delivery_date DATE,
  actual_delivery_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_tracking_number ON deliveries(tracking_number);
```

### Étape 2 : Créer le modèle Delivery

Créer `backend/models/deliveries.js` avec méthodes :
- `create(orderId, deliveryData)`
- `findByOrderId(orderId)`
- `updateStatus(id, status)`
- `updateTracking(id, trackingNumber, carrier)`

### Étape 3 : Créer les contrôleurs

Créer `backend/controllers/deliveries.js` avec :
- `createDelivery` : Créer une livraison (admin)
- `updateDeliveryStatus` : Mettre à jour le statut (admin)
- `getDeliveryByOrder` : Récupérer la livraison d'une commande
- `getAllDeliveries` : Toutes les livraisons (admin)

### Étape 4 : Créer les routes

```javascript
// backend/routes/deliveries.js
fastify.post("/api/admin/deliveries", { preHandler: verifyToken }, createDelivery);
fastify.put("/api/admin/deliveries/:id", { preHandler: verifyToken }, updateDeliveryStatus);
fastify.get("/api/deliveries/order/:orderId", { preHandler: verifyToken }, getDeliveryByOrder);
fastify.get("/api/admin/deliveries", { preHandler: verifyToken }, getAllDeliveries);
```

### Étape 5 : Créer automatiquement après paiement

Modifier le webhook dans `backend/controllers/payment.js` :
```javascript
if (event.type === "checkout.session.completed") {
  // ... code existant ...
  
  // Créer une livraison en statut "pending"
  await Delivery.create({
    orderId: order.id,
    status: "pending"
  });
}
```

## 📊 Interface Admin pour les Commandes

### Ce qui existe déjà

- Route `GET /api/admin/orders` : Récupère toutes les commandes avec infos utilisateur
- Page `AdminOrders.tsx` : Placeholder (à compléter)

### Ce qu'il faut ajouter

1. **Afficher la liste des commandes** dans `AdminOrders.tsx`
2. **Filtrer par statut** (pending, paid, failed, etc.)
3. **Voir les détails d'une commande** (produits, adresse, etc.)
4. **Changer le statut d'une commande**
5. **Créer une livraison** depuis une commande
6. **Générer une facture** depuis une commande

## 🧪 Plan de test complet

### Test 1 : Paiement complet

1. ✅ Ajouter produits au panier
2. ✅ Cliquer sur "COMMANDER"
3. ✅ Payer avec carte test `4242 4242 4242 4242`
4. ✅ Vérifier redirection vers `/checkout/success`
5. ✅ Vérifier que la commande est `paid` en BDD
6. ✅ Vérifier que le panier est vidé

### Test 2 : Facture (après implémentation)

1. ✅ Vérifier qu'une facture est créée après paiement
2. ✅ Télécharger la facture PDF
3. ✅ Vérifier le contenu de la facture (produits, prix, TVA)
4. ✅ Vérifier la numérotation des factures

### Test 3 : Livraison (après implémentation)

1. ✅ Vérifier qu'une livraison est créée après paiement
2. ✅ Dans l'admin, mettre à jour le statut de livraison
3. ✅ Ajouter un numéro de suivi
4. ✅ Vérifier que le client peut voir le statut de sa livraison

### Test 4 : Interface Admin

1. ✅ Voir toutes les commandes
2. ✅ Filtrer par statut
3. ✅ Voir les détails d'une commande
4. ✅ Créer une livraison
5. ✅ Générer une facture

## 📝 Checklist d'implémentation

### Factures
- [ ] Table `invoices` créée
- [ ] Modèle `Invoice` créé
- [ ] Génération PDF implémentée
- [ ] Route de téléchargement
- [ ] Génération automatique après paiement
- [ ] Interface admin pour voir/générer factures
- [ ] Envoi par email (optionnel)

### Livraisons
- [ ] Table `deliveries` créée
- [ ] Modèle `Delivery` créé
- [ ] Routes admin pour gérer livraisons
- [ ] Création automatique après paiement
- [ ] Interface admin complète
- [ ] Page client pour suivre livraison
- [ ] Intégration transporteur (optionnel)

### Commandes
- [ ] Interface admin complète
- [ ] Filtres et recherche
- [ ] Détails commande
- [ ] Changement de statut
- [ ] Export CSV/Excel (optionnel)

## 🔗 Ressources utiles

- [Stripe Testing](https://stripe.com/docs/testing)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [PDFKit Documentation](https://pdfkit.org/)
- [Stripe Invoicing](https://stripe.com/docs/billing/invoices/overview) (alternative à génération manuelle)

