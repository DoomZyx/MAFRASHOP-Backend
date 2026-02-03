# Repos frontend et backend séparés

## Où mettre quoi

| Élément | Repo frontend | Repo backend |
|--------|----------------|--------------|
| Workflow deploy | `.github/workflows/deploy-frontend.yml` | `.github/workflows/deploy-backend.yml` |
| Dossier deploy/ (Nginx, systemd, VPS_SETUP) | Non | Oui : `deploy/` à la racine du repo backend |

## Secrets GitHub

Chaque repo a ses propres Secrets (Settings → Secrets and variables → Actions) :

- **Frontend** : `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `PREPROD_VITE_API_URL`, `PROD_VITE_API_URL`, `PREPROD_VITE_SUPABASE_URL`, `PREPROD_VITE_SUPABASE_ANON_KEY`, `PROD_VITE_SUPABASE_URL`, `PROD_VITE_SUPABASE_ANON_KEY`
- **Backend** : `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` (même VPS)

## Comportement

- Push sur `develop` (frontend) → déploiement vers `/var/www/preprod/frontend`
- Push sur `develop` (backend) → déploiement vers `/var/www/preprod/backend` + redémarrage `api-preprod`
- Push sur `main` → idem en prod

Les deux workflows sont indépendants.
