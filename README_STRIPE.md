# Configuration Stripe

## Variables d'environnement requises

Ajoutez ces variables dans votre fichier `.env` :

```env
STRIPE_SECRET_KEY=sk_test_... # Clé secrète Stripe (test ou production)
STRIPE_WEBHOOK_SECRET=whsec_... # Secret du webhook Stripe
FRONTEND_URL=http://localhost:5173 # URL du frontend pour les redirections
```

## Installation

1. Installer les dépendances :
```bash
cd backend
pnpm install
```

2. Créer les tables de commandes :
```bash
pnpm run migrate:orders
```

## Configuration Stripe

### 1. Créer un compte Stripe

1. Allez sur [stripe.com](https://stripe.com)
2. Créez un compte
3. Récupérez vos clés API dans le dashboard (Mode test)

### 2. Configurer les webhooks

1. Dans le dashboard Stripe, allez dans **Développeurs > Webhooks**
2. Cliquez sur **Ajouter un endpoint**
3. URL de l'endpoint : `https://votre-domaine.com/api/payment/webhook`
4. Sélectionnez les événements :
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Copiez le **Signing secret** et ajoutez-le dans `.env` comme `STRIPE_WEBHOOK_SECRET`

### 3. Tester en local avec Stripe CLI

Pour tester les webhooks en local :

1. Installez [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. Connectez-vous : `stripe login`
3. Redirigez les webhooks vers votre serveur local :
```bash
stripe listen --forward-to localhost:8080/api/payment/webhook
```
4. Copiez le webhook secret affiché et utilisez-le dans `.env`

## Utilisation

### Frontend

Le bouton "COMMANDER" dans le panier déclenche automatiquement le checkout Stripe.

### Flux de paiement

1. L'utilisateur clique sur "COMMANDER"
2. Une session Stripe Checkout est créée
3. L'utilisateur est redirigé vers Stripe pour payer
4. Après paiement, redirection vers `/checkout/success`
5. Le webhook Stripe confirme le paiement et met à jour la commande
6. Le panier est vidé automatiquement

## Commandes utiles

- Tester un paiement : `stripe trigger checkout.session.completed`
- Voir les logs : `stripe logs tail`

