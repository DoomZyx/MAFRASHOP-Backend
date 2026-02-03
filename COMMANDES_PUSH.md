# Créer la branche develop et pousser (repo BACKEND)

La branche `develop` n'existe pas encore. Voici les commandes exactes à exécuter **dans le dossier du repo backend** (là où se trouve `server.js`).

## 1. Créer la branche develop

```bash
cd /chemin/vers/ton/repo/backend
git checkout -b develop
```

Tu es maintenant sur la branche `develop` (créée à partir de la branche actuelle, en général `master`).

## 2. Ajouter les fichiers (workflow + deploy + modifs)

```bash
git add .github/
git add deploy/
git add .gitignore
git add loadEnv.js
git status
```

Vérifie que tout ce que tu veux committer est listé.

## 3. Committer

```bash
git commit -m "ci: workflow deploy preprod/prod + deploy VPS + branche develop"
```

## 4. Pousser develop sur GitHub

```bash
git push -u origin develop
```

La première fois, `-u origin develop` enregistre le lien entre ta branche locale `develop` et `origin/develop`. Les prochains push : `git push` suffit.

---

Ensuite : chaque push sur `develop` déclenche le déploiement backend préprod (quand le VPS et les secrets sont en place). Chaque push sur `main` déclenche le déploiement prod.
