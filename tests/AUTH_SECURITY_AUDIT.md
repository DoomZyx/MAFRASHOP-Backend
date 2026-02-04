# Audit Sécurité Authentification - Plan de Tests

## ✅ Protections déjà en place

### 1. JWT - Vérifications de base
- ✅ Vérification signature JWT avec `JWT_SECRET`
- ✅ Gestion token expiré (401 avec message clair)
- ✅ Gestion token invalide/falsifié (401)
- ✅ Gestion token manquant (401)
- ✅ Vérification utilisateur existe en DB après décodage JWT
- ✅ Rôle récupéré depuis DB (pas depuis JWT) - **SÉCURITÉ CRITIQUE**

### 2. OAuth Google
- ✅ Validation token Google côté backend (obligatoire)
- ✅ Échange code OAuth via API Google officielle
- ✅ Récupération infos utilisateur via API Google
- ✅ Association compte existant (pas de doublon)
- ✅ Création nouveau compte si nécessaire

### 3. Contrôle d'accès
- ✅ Middleware `isAdmin` pour endpoints admin
- ✅ Vérification ownership dans `getOrderById` (orders.js)
- ✅ Vérification ownership dans `getSessionStatus` (payment.js)

### 4. Journalisation (AJOUTÉ)
- ✅ Journalisation échecs authentification JWT
- ✅ Journalisation tentatives login échouées
- ✅ Journalisation échecs OAuth Google
- ✅ Logs contiennent: IP, userId, timestamp, raison

## ⚠️ Failles de sécurité identifiées

### 1. JWT expiration trop longue
**Problème** : JWT expire en 7 jours (`expiresIn: "7d"`)
**Risque** : Si token volé, valide pendant 7 jours
**Recommandation** : 
- JWT access token : 15 minutes à 1 heure
- Refresh token : 7 jours (séparé)
- Implémenter endpoint `/auth/refresh`

### 2. Pas de blacklist de tokens (logout)
**Problème** : Un token reste valide même après logout
**Risque** : Token volé reste utilisable
**Recommandation** :
- Créer table `blacklisted_tokens` (jti, expires_at)
- Vérifier blacklist dans `verifyToken`
- Endpoint `/auth/logout` qui blackliste le token

### 3. Pas de rate limiting
**Problème** : Pas de protection contre brute force
**Risque** : Attaques par force brute sur login
**Recommandation** :
- Rate limiting sur `/auth/login` (ex: 5 tentatives / 15 min)
- Rate limiting sur `/auth/google/callback`
- Utiliser `@fastify/rate-limit`

### 4. Vérification ownership incomplète
**Problème** : Pas tous les endpoints vérifient l'ownership
**Risque** : Accès non autorisé à des ressources
**Recommandation** :
- Vérifier ownership dans tous les endpoints sensibles
- Créer middleware `verifyOwnership(resourceType)`

### 5. Pas de validation strict du format JWT
**Problème** : Pas de validation du format avant décodage
**Risque** : Erreurs non gérées
**Recommandation** :
- Valider format JWT (3 parties séparées par `.`)

## 📋 Plan de tests à implémenter

### Tests unitaires (déjà créés dans `auth.test.js`)
- ✅ Tests JWT valide/invalide/expiré
- ✅ Tests OAuth Google (structure créée)
- ✅ Tests contrôle d'accès
- ⚠️ Tests à compléter avec mocks réels

### Tests d'intégration à ajouter
1. **Test flux complet login → accès ressource**
2. **Test flux OAuth Google complet**
3. **Test rate limiting**
4. **Test blacklist tokens (quand implémenté)**

## 🔒 Améliorations recommandées (priorité)

### Priorité CRITIQUE
1. **Réduire expiration JWT** : 7d → 1h + refresh token
2. **Implémenter blacklist tokens** : Table + vérification
3. **Rate limiting** : Protection brute force

### Priorité HAUTE
4. **Middleware ownership générique** : Réutilisable
5. **Validation format JWT** : Avant décodage

### Priorité MOYENNE
6. **Refresh token** : Système complet
7. **2FA optionnel** : Pour comptes admin

## 📊 État actuel sécurité

**Score sécurité authentification : ~7.5/10**

**Points forts** :
- Validation OAuth côté backend ✅
- Rôle depuis DB ✅
- Journalisation ajoutée ✅
- Vérifications ownership (partielles) ✅

**Points faibles** :
- Expiration JWT trop longue ⚠️
- Pas de blacklist tokens ⚠️
- Pas de rate limiting ⚠️
- Vérification ownership incomplète ⚠️

