import "./loadEnv.js";
import fastify from "./app.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

// Extraire le hostname de ADDRESS si c'est une URL complète
const normalizeAddress = (address) => {
  if (!address) return "0.0.0.0";
  
  try {
    // Si c'est une URL complète, extraire le hostname
    if (address.startsWith("http://") || address.startsWith("https://")) {
      const url = new URL(address);
      return url.hostname;
    }
    // Si c'est déjà un hostname, le retourner tel quel
    return address;
  } catch {
    // Si l'URL est invalide, retourner la valeur par défaut
    return address;
  }
};

const ADDRESS = normalizeAddress(process.env.ADDRESS || "0.0.0.0");

// Fonction de démarrage du serveur
async function startServer() {
  try {
    await fastify.listen({ port: PORT, host: ADDRESS });
    console.log(`Serveur Fastify démarré sur http://${ADDRESS}:${PORT}`);
  } catch (err) {
    console.error("Erreur lors du démarrage du serveur:", err);
    process.exit(1);
  }
}

// Gestion de la fermeture propre
const shutdown = async (signal) => {
  console.log(`\n${signal} reçu, fermeture du serveur...`);
  try {
    await fastify.close();
    console.log("Serveur fermé proprement");
    process.exit(0);
  } catch (err) {
    console.error("Erreur lors de la fermeture:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Démarrer le serveur
startServer();
