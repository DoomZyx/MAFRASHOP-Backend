module.exports = {
 apps: [
   {
     name: "preprod",          // Nom du process PM2
     script: "npm",            // On lance npm
     args: "start",            // Commande npm start
     cwd: "/home/deploy/apps/preprod/MAFRASHOP-Backend", // dossier du projet sur le VPS
     env: {
       NODE_ENV: "preprod", 
       PORT: 3001,
       FRONTEND_URL: process.env.FRONTEND_URL,
       DATABASE_URL: process.env.DATABASE_URL,
       SUPABASE_URL: process.env.SUPABASE_URL,
       SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
       POSTGRES_POOL_SIZE: process.env.POSTGRES_POOL_SIZE,
       JWT_SECRET: process.env.JWT_SECRET,
       GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
       GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
       GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
       CORS_ORIGINS: process.env.CORS_ORIGINS,
       STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
       STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
       SMTP_HOST: process.env.SMTP_HOST,
       SMTP_PORT: process.env.SMTP_PORT,
       SMTP_SECURE: process.env.SMTP_SECURE,
       SMTP_USER: process.env.SMTP_USER,
       SMTP_PASS: process.env.SMTP_PASS,
       CONTACT_EMAIL: process.env.CONTACT_EMAIL,
     },
     env_production: {
       NODE_ENV: "production",
       PORT: process.env.PORT,
       FRONTEND_URL: process.env.FRONTEND_URL,
       DATABASE_URL: process.env.DATABASE_URL,
       SUPABASE_URL: process.env.SUPABASE_URL,
       SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
       POSTGRES_POOL_SIZE: process.env.POSTGRES_POOL_SIZE,
       JWT_SECRET: process.env.JWT_SECRET,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
       CORS_ORIGINS: process.env.CORS_ORIGINS,
       STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
       STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
       SMTP_HOST: process.env.SMTP_HOST,
       SMTP_PORT: process.env.SMTP_PORT,
       SMTP_SECURE: process.env.SMTP_SECURE,
       SMTP_USER: process.env.SMTP_USER,
       SMTP_PASS: process.env.SMTP_PASS,
       CONTACT_EMAIL: process.env.CONTACT_EMAIL,
     }
   }
 ]
};