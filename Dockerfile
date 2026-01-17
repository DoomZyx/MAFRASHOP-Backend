FROM node:20-alpine

# Installer pnpm
RUN npm install -g pnpm@10.12.4

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json pnpm-lock.yaml ./

# Installer les dépendances
RUN pnpm install --frozen-lockfile

# Copier le reste du code
COPY . .

# Exposer le port
EXPOSE 8080

# Commande de démarrage
CMD ["pnpm", "start"]