# Guide de test pour les comptes professionnels

Ce guide explique comment tester la fonctionnalité de comptes professionnels sans avoir besoin d'un vrai SIRET et d'une vraie entreprise.

## Méthode 1 : Endpoint de test (recommandé)

Un endpoint spécial permet de valider automatiquement un compte professionnel **sans vérification INSEE**.

### Utilisation depuis le frontend

Vous pouvez modifier temporairement le hook `useProRequest` pour utiliser l'endpoint de test :

```typescript
// Dans frontend/src/hooks/useProRequest.tsx
// Remplacer authAPI.requestPro par authAPI.testProRequest
const response = await authAPI.testProRequest({
  companyName: formData.companyName.trim(),
  siret: formData.siret,
  address: formData.address.trim() || undefined,
  city: formData.city.trim() || undefined,
  zipCode: formData.zipCode.trim() || undefined,
});
```

### Utilisation depuis Postman/curl

```bash
POST http://localhost:8080/api/auth/pro/test-request
Authorization: Bearer {votre_token}
Content-Type: application/json

{
  "companyName": "Garage Test",
  "siret": "12345678901234",
  "address": "123 Rue Test",
  "city": "Paris",
  "zipCode": "75001"
}
```

**Important** : Cet endpoint valide automatiquement le compte sans vérification INSEE. Utilisez-le uniquement pour les tests !

---

## Méthode 2 : Script de création de compte pro

Un script permet de créer directement un compte professionnel validé dans la base de données.

### Utilisation

```bash
# Depuis le dossier backend
node scripts/testProAccount.js

# Ou avec un email spécifique
node scripts/testProAccount.js test@example.com
```

Le script va :

- Créer un utilisateur (ou utiliser l'utilisateur existant avec l'email fourni)
- Le mettre en statut professionnel validé
- Ajouter des informations d'entreprise fictives

**Identifiants par défaut** :

- Email : `test-pro@example.com`
- Mot de passe : `test123`

Vous pouvez ensuite vous connecter avec ces identifiants et vous aurez automatiquement un compte professionnel validé.

---

## Méthode 3 : Endpoint admin (pour validation manuelle)

Si vous avez un compte admin, vous pouvez valider/rejeter manuellement n'importe quelle demande.

### Utilisation

```bash
POST http://localhost:8080/api/auth/pro/validate
Authorization: Bearer {token_admin}
Content-Type: application/json

{
  "userId": "userId_de_l_utilisateur",
  "approved": true
}
```

Pour rejeter :

```json
{
  "userId": "userId_de_l_utilisateur",
  "approved": false
}
```

**Note** : Cet endpoint nécessite un compte avec le rôle `admin`.

---

## Méthode 4 : Modification directe en base de données

Si vous avez accès à MongoDB, vous pouvez directement modifier un utilisateur :

// Dans MongoDB Compass ou mongo shell
db.users.updateOne(
  { email: "votre-email@example.com" },
  {
    $set: {
      isPro: true,
      proStatus: "validated",
      company: {
        name: "Garage Test",
        siret: "12345678901234",
        address: "123 Rue Test",
        city: "Paris",
        zipCode: "75001",
      },
    },
  }
);
```

---

## Vérification du statut

Pour vérifier si un compte est bien en statut pro, utilisez l'endpoint `/api/auth/me` :

```bash
GET http://localhost:8080/api/auth/me
Authorization: Bearer {votre_token}
```

La réponse contiendra :

```json
{
  "success": true,
  "data": {
    "user": {
      "isPro": true,
      "proStatus": "validated",
      "company": {
        "name": "Garage Test",
        "siret": "12345678901234",
        ...
      }
    }
  }
}
```

---

## Recommandations

1. **Pour les tests rapides** : Utilisez la **Méthode 1** (endpoint de test)
2. **Pour créer un compte de test réutilisable** : Utilisez la **Méthode 2** (script)
3. **Pour tester le workflow complet** :
   - Faites une vraie demande via le formulaire
   - Utilisez la **Méthode 3** (admin) pour valider/rejeter
4. **Pour des tests avancés** : Utilisez la **Méthode 4** (modification directe)

---

## Nettoyage après tests

Pour remettre un compte en statut "particulier" :

```javascript
db.users.updateOne(
  { email: "test-pro@example.com" },
  {
    $set: {
      isPro: false,
      proStatus: "none",
      company: {},
    },
  }
);
```
