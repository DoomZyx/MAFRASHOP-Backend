import dotenv from "dotenv";
dotenv.config();

export const config = {
  PORT: process.env.PORT || 8080,
  MONGO_URI: process.env.MONGO_URI,
};

console.log("🔧 Configuration chargée:");
console.log("  - PORT:", config.PORT);
console.log("  - MONGO_URI:", config.MONGO_URI ? "✅ Configuré" : "❌ Manquant");
