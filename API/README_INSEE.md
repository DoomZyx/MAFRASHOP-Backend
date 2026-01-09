# Configuration API INSEE

## Variables d'environnement requises

Pour utiliser la vérification SIRET via l'API INSEE, vous devez ajouter les variables suivantes dans votre fichier `.env` :

```env
INSEE_CONSUMER_KEY=votre_consumer_key
INSEE_CONSUMER_SECRET=votre_consumer_secret
```

## Obtenir les clés API INSEE

1. Créez un compte sur [https://api.insee.fr](https://api.insee.fr)
2. Créez une application pour obtenir vos credentials (Consumer Key et Consumer Secret)
3. Ajoutez-les dans votre fichier `.env`

## Fonctionnalités

- **Génération automatique de token OAuth2** : Le token est généré automatiquement et rafraîchi toutes les heures (avec une marge de 5 minutes)
- **Rate limiting** : Limitation à 30 requêtes par minute pour respecter les limites de l'API INSEE
- **Vérification SIRET** : Validation du format et de l'existence du SIRET dans la base INSEE
- **Vérification du nom d'entreprise** : Comparaison du nom fourni avec celui enregistré dans la base INSEE (tolérance aux variations d'écriture)
- **Vérification du statut** : Vérifie que l'entreprise est active (statut "A")
- **Vérification de l'adresse** : Comparaison de l'adresse fournie avec celle enregistrée dans la base INSEE
- **Vérification de la ville** : Vérification exacte de la ville
- **Vérification du code postal** : Vérification exacte du code postal
- **Vérification de la forme juridique** : Exclusion des auto-entrepreneurs et micro-entreprises
- **Vérification du type d'établissement** : Détection si c'est le siège social ou un établissement secondaire (avertissement)
- **Vérification de l'ancienneté** : Détection des entreprises créées il y a moins de 3 mois (avertissement)
- **Vérification du code APE/NAF** : Vérification que l'entreprise appartient au secteur automobile (codes autorisés uniquement)

## Utilisation

### Route API

```http
POST /api/auth/pro/request
Authorization: Bearer {token}
Content-Type: application/json

{
  "companyName": "Nom de l'entreprise",
  "siret": "12345678901234",
  "address": "123 Rue Example",  // Optionnel mais recommandé pour validation
  "city": "Paris",                // Optionnel mais recommandé pour validation
  "zipCode": "75001"              // Optionnel mais recommandé pour validation
}
```

**Champs requis** :

- `companyName` : Nom de l'entreprise
- `siret` : Numéro SIRET (14 chiffres)

**Champs optionnels** (recommandés pour une validation complète) :

- `address` : Adresse de l'entreprise
- `city` : Ville de l'entreprise
- `zipCode` : Code postal de l'entreprise

### Réponse

```json
{
  "success": true,
  "message": "Demande de validation professionnelle en cours de traitement"
}
```

La validation s'effectue de manière asynchrone. Le statut de l'utilisateur est mis à jour automatiquement :

- `pending` : Demande en cours de traitement
- `validated` : Toutes les vérifications sont passées avec succès
- `rejected` : Validation échouée

### Critères de validation (tous doivent être remplis pour valider) :

✅ **Obligatoires** :

- SIRET existe dans la base INSEE
- Nom d'entreprise correspond au SIRET
- Entreprise active (statut "A")
- Adresse correspond (si fournie)
- Ville correspond (si fournie)
- Code postal correspond (si fourni)
- Forme juridique éligible (auto-entrepreneurs/micro-entreprises exclus)
- **Code NAF/APE dans le secteur automobile** (obligatoire)

⚠️ **Avertissements** (n'empêchent pas la validation mais sont enregistrés) :

- Établissement secondaire (pas le siège social)
- Entreprise créée il y a moins de 3 mois

### Raisons de rejet possibles :

- SIRET introuvable dans la base INSEE
- Nom d'entreprise ne correspond pas
- Entreprise inactive ou fermée
- Adresse, ville ou code postal ne correspondent pas
- Forme juridique non éligible (auto-entrepreneur, micro-entreprise)
- **Code NAF/APE non autorisé (entreprise hors secteur automobile)**

### Codes NAF autorisés (secteur automobile) :

Seules les entreprises avec les codes d'activité suivants peuvent être validées :

- **4511Z** : Commerce de voitures et de véhicules automobiles légers
- **4519Z** : Commerce d'autres véhicules automobiles
- **4520A** : Entretien et réparation de véhicules automobiles légers
- **4520B** : Entretien et réparation d'autres véhicules automobiles
- **4531Z** : Commerce de gros d'équipements automobiles
- **4532Z** : Commerce de détail d'équipements automobiles
- **4540Z** : Commerce et réparation de motocycles

## Gestion du cache

Le token OAuth2 est mis en cache en mémoire et automatiquement régénéré :

- Avant expiration (rafraîchi à 55 minutes)
- En cas d'erreur 401 (token expiré)

## Rate Limiting

Le système limite automatiquement à 30 requêtes par minute. Si la limite est atteinte, une erreur est retournée avec le temps d'attente nécessaire.
