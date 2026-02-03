# Configuration VPS OVH (Ubuntu 22.04) – MAFRASHOP

Commandes à exécuter une seule fois sur le VPS. Aucun déploiement manuel ensuite : tout passe par GitHub Actions.

**Repos séparés** : frontend et backend ont chacun leur repo. Chaque repo a son workflow ; les deux déploient vers le même VPS. Voir `deploy/REPOS_SEPARES.md` pour où mettre les workflows et les secrets.

---

## 1. Utilisateur et droits

```bash
# Créer un utilisateur déploiement (recommandé) ou utiliser un compte existant
sudo adduser deploy
sudo usermod -aG www-data deploy

# Autoriser deploy à redémarrer les services sans mot de passe
sudo visudo
# Ajouter à la fin (remplacer deploy par le nom de l'utilisateur utilisé par GitHub) :
# deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart api-preprod, /bin/systemctl restart api-prod
```

---

## 2. Structure des dossiers

```bash
sudo mkdir -p /var/www/preprod/frontend /var/www/preprod/backend
sudo mkdir -p /var/www/prod/frontend /var/www/prod/backend
sudo chown -R deploy:www-data /var/www/preprod /var/www/prod
sudo chmod -R 755 /var/www/preprod /var/www/prod
```

---

## 3. Node.js et pnpm

```bash
# Node 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
sudo npm install -g pnpm
```

---

## 4. Fichiers .env backend (uniquement sur le VPS)

Créer à la main sur le serveur. Ne jamais les committer.

**Préprod** – `/var/www/preprod/backend/.env.preprod` :

```env
NODE_ENV=preprod
PORT=3001
DATABASE_URL=postgresql://...   # projet Supabase préprod
CORS_ORIGINS=https://preprod.mafrashop.com
FRONTEND_URL=https://preprod.mafrashop.com
JWT_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
# GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI, INSEE_*, etc. si utilisés
```

**Prod** – `/var/www/prod/backend/.env.prod` :

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...   # projet Supabase prod
CORS_ORIGINS=https://mafrashop.com,https://www.mafrashop.com
FRONTEND_URL=https://mafrashop.com
JWT_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
# idem autres clés
```

```bash
sudo chown deploy:www-data /var/www/preprod/backend/.env.preprod /var/www/prod/backend/.env.prod
chmod 600 /var/www/preprod/backend/.env.preprod /var/www/prod/backend/.env.prod
```

---

## 5. Services systemd

```bash
# Depuis le repo backend cloné sur le VPS (ou après déploiement)
cd /var/www/preprod/backend
sudo cp deploy/systemd/api-preprod.service /etc/systemd/system/
sudo cp deploy/systemd/api-prod.service /etc/systemd/system/

sudo systemctl daemon-reload
# Après premier déploiement backend :
# sudo systemctl enable api-preprod api-prod
# sudo systemctl start api-preprod api-prod
```

---

## 6. Nginx

```bash
cd /var/www/preprod/backend
sudo cp deploy/nginx/preprod.conf /etc/nginx/sites-available/mafrashop-preprod
sudo cp deploy/nginx/prod.conf /etc/nginx/sites-available/mafrashop-prod

sudo ln -s /etc/nginx/sites-available/mafrashop-preprod /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/mafrashop-prod /etc/nginx/sites-enabled/

sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Clé SSH pour GitHub Actions

Sur le VPS :

```bash
sudo -u deploy ssh-keygen -t ed25519 -C "github-actions-deploy" -f /home/deploy/.ssh/deploy_key -N ""
cat /home/deploy/.ssh/deploy_key.pub >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

Dans **chaque repo GitHub** (frontend et backend) : Settings → Secrets and variables → Actions. Créer au minimum :

- **Frontend** : `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `PREPROD_VITE_API_URL`, `PROD_VITE_API_URL`, `PREPROD_VITE_SUPABASE_URL`, `PREPROD_VITE_SUPABASE_ANON_KEY`, `PROD_VITE_SUPABASE_URL`, `PROD_VITE_SUPABASE_ANON_KEY`
- **Backend** : `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`

---

## 8. Premier déploiement

1. Push sur `develop` (frontend puis backend) : les workflows déploient en préprod.
2. Sur le VPS, après le premier déploiement backend :

```bash
cd /var/www/preprod/backend
pnpm install --frozen-lockfile --prod
sudo systemctl enable api-preprod
sudo systemctl start api-preprod
```

3. Idem pour prod après push sur `main` : `api-prod` dans `/var/www/prod/backend`.

---

## 9. Checklist de validation

- [ ] Dossiers `/var/www/preprod|prod/{frontend,backend}` créés, droits `deploy:www-data`
- [ ] Node 20 + pnpm installés
- [ ] `.env.preprod` et `.env.prod` créés sur le VPS
- [ ] Services `api-preprod` et `api-prod` installés
- [ ] Nginx configuré, `nginx -t` OK
- [ ] Secrets GitHub dans les deux repos (frontend + backend)
- [ ] Push `develop` → préprod à jour ; push `main` → prod à jour

---

| Environnement | Branche | Dossiers | Service | Port API |
|---------------|---------|----------|---------|----------|
| Préprod | develop | /var/www/preprod/* | api-preprod | 3001 |
| Prod | main | /var/www/prod/* | api-prod | 3000 |
