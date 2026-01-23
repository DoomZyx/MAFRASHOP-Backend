import "../loadEnv.js";
import pg from "pg";
import bcrypt from "bcryptjs";
import readline from "readline";

const { Pool } = pg;

// Parser DATABASE_URL si elle existe, sinon utiliser les variables individuelles
const parseDatabaseUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432", 10),
      database: parsed.pathname.slice(1),
      user: parsed.username,
      password: parsed.password,
    };
  } catch (error) {
    return null;
  }
};

const dbConfig = process.env.DATABASE_URL
  ? parseDatabaseUrl(process.env.DATABASE_URL)
  : {
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD,
    };

if (!dbConfig || !dbConfig.database) {
  console.error("❌ Configuration de base de données manquante");
  console.error("Vérifiez vos variables d'environnement DATABASE_URL ou POSTGRES_*");
  process.exit(1);
}

const pool = new Pool(dbConfig);

// Fonction pour lire l'input depuis la console
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

async function createAdmin() {
  try {
    console.log("=== Création d'un compte administrateur ===\n");

    // Demander les informations
    const email = await question("Email: ");
    if (!email) {
      console.error("L'email est requis");
      process.exit(1);
    }

    const password = await question("Mot de passe: ");
    if (!password || password.length < 6) {
      console.error("Le mot de passe doit contenir au moins 6 caractères");
      process.exit(1);
    }

    const firstName = await question("Prénom: ");
    const lastName = await question("Nom: ");

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      const updateRole = await question(
        `L'utilisateur ${email} existe déjà. Voulez-vous le promouvoir admin ? (o/n): `
      );

      if (updateRole.toLowerCase() === "o" || updateRole.toLowerCase() === "oui") {
        // Mettre à jour le rôle
        await pool.query("UPDATE users SET role = $1 WHERE email = $2", [
          "admin",
          email.toLowerCase(),
        ]);
        console.log(`\n✅ L'utilisateur ${email} a été promu administrateur.`);
      } else {
        console.log("Opération annulée.");
      }
      rl.close();
      await pool.end();
      return;
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer l'utilisateur admin
    const result = await pool.query(
      `INSERT INTO users (
        email, password, first_name, last_name, 
        auth_provider, is_verified, role, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, email, first_name, last_name, role`,
      [
        email.toLowerCase(),
        hashedPassword,
        firstName || "Admin",
        lastName || "User",
        "local",
        true,
        "admin",
      ]
    );

    const user = result.rows[0];
    console.log(`\n✅ Compte administrateur créé avec succès !`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Nom: ${user.first_name} ${user.last_name}`);
    console.log(`   Rôle: ${user.role}`);
    console.log(`\nVous pouvez maintenant vous connecter avec ces identifiants.`);
  } catch (error) {
    console.error("❌ Erreur lors de la création du compte admin:", error);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

// Exécuter le script
createAdmin();

