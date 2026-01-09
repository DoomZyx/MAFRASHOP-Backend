import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/user.js";

async function createTestProAccount() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI manquant dans .env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connexion MongoDB réussie");

    // Chercher un utilisateur existant ou créer un utilisateur de test
    const email = process.argv[2] || "test-pro@example.com";

    let user = await User.findOne({ email });

    if (!user) {
      console.log(`Création d'un utilisateur de test avec l'email: ${email}`);
      user = new User({
        email,
        password: "test123",
        firstName: "Test",
        lastName: "Pro",
        authProvider: "local",
        isVerified: true,
      });
    }

    // Mettre le compte en mode pro validé
    user.isPro = true;
    user.proStatus = "validated";
    user.company = {
      name: "Garage Test Pro",
      siret: "12345678901234",
      address: "123 Rue Test",
      city: "Paris",
      zipCode: "75001",
    };

    await user.save();

    console.log(`\n✅ Compte professionnel créé/mis à jour avec succès !`);
    console.log(`Email: ${user.email}`);
    console.log(`Mot de passe: test123`);
    console.log(`Statut Pro: ${user.isPro}`);
    console.log(`Statut Validation: ${user.proStatus}`);
    console.log(`\nVous pouvez maintenant vous connecter avec ces identifiants.`);

    process.exit(0);
  } catch (error) {
    console.error("Erreur:", error);
    process.exit(1);
  }
}

createTestProAccount();

