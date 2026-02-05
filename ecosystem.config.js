module.exports = {
 apps: [
   {
     name: "preprod",          // Nom du process PM2
     script: "npm",            // On lance npm
     args: "start",            // Commande npm start
     cwd: "/home/deploy/apps/preprod/MAFRASHOP-Backend", // dossier du projet sur le VPS
    env: {
      NODE_ENV: "preprod",
      // Les autres variables seront chargées depuis .env par loadEnv.js
    },
    env_preprod: {
      NODE_ENV: "preprod",
      // Les autres variables seront chargées depuis .env.preprod par loadEnv.js
    },
    env_production: {
      NODE_ENV: "production",
    }
   }
 ]
};