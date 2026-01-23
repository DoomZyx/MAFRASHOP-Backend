# Création d'un compte administrateur

## Méthode 1 : Script interactif (Recommandé)

Exécutez le script suivant dans le dossier `backend` :

```bash
npm run create-admin
```

Le script vous demandera :
- Email
- Mot de passe (minimum 6 caractères)
- Prénom (optionnel)
- Nom (optionnel)

Si l'utilisateur existe déjà, le script vous proposera de le promouvoir administrateur.

## Méthode 2 : Script direct avec arguments

Vous pouvez aussi créer un script personnalisé qui prend les arguments en ligne de commande :

```bash
node script/createAdmin.js
```

## Méthode 3 : Via SQL (Non recommandé - mot de passe non hashé)

⚠️ **ATTENTION** : Cette méthode n'est pas sécurisée car le mot de passe ne sera pas hashé.

Si vous devez absolument utiliser SQL, vous devez d'abord générer le hash du mot de passe avec Node.js :

```javascript
const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash('votre-mot-de-passe', 10);
console.log(hash);
```

Puis insérer dans la base :

```sql
INSERT INTO users (email, password, first_name, last_name, auth_provider, is_verified, role, created_at, updated_at)
VALUES (
  'admin@example.com',
  '$2a$10$VOTRE_HASH_ICI',
  'Admin',
  'User',
  'local',
  true,
  'admin',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
```

## Vérification

Pour vérifier qu'un utilisateur est admin :

```sql
SELECT id, email, first_name, last_name, role FROM users WHERE role = 'admin';
```

## Promotion d'un utilisateur existant en admin

Si vous avez déjà un compte utilisateur et voulez le promouvoir admin :

```sql
UPDATE users SET role = 'admin' WHERE email = 'votre-email@example.com';
```

⚠️ **Note** : Cette méthode ne fonctionne que si l'utilisateur existe déjà avec un mot de passe hashé.

