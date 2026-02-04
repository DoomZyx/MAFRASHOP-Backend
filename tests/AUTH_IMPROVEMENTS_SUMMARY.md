# Résumé des améliorations d'authentification

## ✅ Modifications terminées

### 1. Système Refresh Token + Access Token
- **Avant** : JWT unique avec expiration 7 jours
- **Après** : 
  - Access token : 1 heure (sécurité renforcée)
  - Refresh token : 7 jours (maintien de session)
  - JTI (JWT ID) unique pour chaque paire de tokens

**Fichiers modifiés** :
- `backend/controllers/auth.js` : `generateTokens()` remplace `generateToken()`
- Tous les endpoints retournent maintenant `accessToken` + `refreshToken` + `expiresIn`

### 2. Blacklist de tokens (logout)
- **Table créée** : `blacklisted_tokens`
- **Fonctionnalité** : Les tokens peuvent être révoqués même s'ils ne sont pas expirés
- **Vérification** : Le middleware `verifyToken` vérifie la blacklist avant d'autoriser l'accès

**Fichiers créés** :
- `backend/script/createBlacklistedTokensTable.sql`
- `backend/script/createBlacklistedTokensTable.js`
- `backend/models/blacklistedTokens.js`

**Fichiers modifiés** :
- `backend/middleware/auth.js` : Vérification blacklist dans `verifyToken`
- `backend/controllers/auth.js` : `logout()` blackliste maintenant le token

### 3. Endpoint Refresh Token
- **Nouveau endpoint** : `POST /api/auth/refresh`
- **Fonctionnalité** : Permet de renouveler les tokens sans re-authentification
- **Sécurité** : Vérifie que le refresh token n'est pas blacklisté

**Fichiers modifiés** :
- `backend/controllers/auth.js` : Nouvelle fonction `refreshToken()`
- `backend/routes/auth.js` : Route ajoutée

### 4. Rate Limiting
- **Protection** : Contre les attaques brute force
- **Configuration** :
  - Endpoints auth normaux : 5 tentatives / 15 minutes
  - Endpoints admin : 3 tentatives / 15 minutes

**Fichiers créés** :
- `backend/middleware/rateLimit.js`

**Fichiers modifiés** :
- `backend/routes/auth.js` : Rate limiting ajouté sur login, register, googleCallback, adminLogin, adminGoogleCallback

### 5. Journalisation améliorée
- **Audit** : Tous les échecs d'authentification sont journalisés
- **Informations loggées** : IP, userId, timestamp, raison, path

**Fichiers modifiés** :
- `backend/middleware/auth.js` : Fonction `logAuthFailure()`
- `backend/controllers/auth.js` : Journalisation dans login, googleCallback

## 📋 Migration nécessaire

### Étape 1 : Créer la table blacklisted_tokens

```bash
cd backend
node script/createBlacklistedTokensTable.js
```

Ou manuellement avec psql :
```bash
psql -d votre_database -f script/createBlacklistedTokensTable.sql
```

## 🔄 Changements API

### Réponses d'authentification modifiées

**Avant** :
```json
{
  "success": true,
  "data": {
    "user": {...},
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Après** :
```json
{
  "success": true,
  "data": {
    "user": {...},
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

### Nouveau endpoint : Refresh Token

**POST** `/api/auth/refresh`

**Body** :
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Réponse** :
```json
{
  "success": true,
  "message": "Tokens renouvelés",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 3600
  }
}
```

## 🛡️ Sécurité renforcée

### Avant
- ❌ JWT valide 7 jours (risque si volé)
- ❌ Pas de blacklist (token valide même après logout)
- ❌ Pas de rate limiting (vulnérable brute force)
- ❌ Pas de refresh token (re-login nécessaire)

### Après
- ✅ Access token 1h (fenêtre d'attaque réduite)
- ✅ Blacklist de tokens (révocation possible)
- ✅ Rate limiting (protection brute force)
- ✅ Refresh token (UX améliorée + sécurité)

## 📝 Notes importantes

1. **Frontend** : Doit être mis à jour pour gérer `accessToken` + `refreshToken`
2. **Expiration** : L'access token expire après 1h, utiliser `/auth/refresh` pour renouveler
3. **Logout** : Blackliste maintenant le token (ne peut plus être utilisé)
4. **Rate limiting** : En mémoire (Map), pour production scale utiliser Redis

## 🧪 Tests

Les tests sont disponibles dans `backend/tests/auth.test.js`

Pour exécuter :
```bash
cd backend
npm test
```

## 🚀 Prochaines étapes (optionnel)

1. **Redis pour rate limiting** : Pour scale en production
2. **Refresh token rotation** : Invalider l'ancien refresh token lors du renouvellement
3. **2FA** : Pour comptes admin
4. **Session management** : Table `user_sessions` pour tracker toutes les sessions actives

