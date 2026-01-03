const mongoose = require("mongoose");
import dotenv from "dotenv";
dotenv.config();

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("ERREUR : MONGO_URI manquant dans .env");
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => console.log("Connexion à MongoDB réussie !"))
  .catch(() => console.log("Connexion à MongoDB échouée !"));

module.exports = mongoose;
