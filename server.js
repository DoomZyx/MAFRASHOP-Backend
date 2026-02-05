import "./loadEnv.js";
import fastify from "./app.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const ADDRESS = process.env.ADDRESS

fastify.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error("Erreur lors du démarrage du serveur:", err);
    process.exit(1);
  }
  console.log(`Serveur Fastify démarré sur ${ADDRESS}`);
  console.log(`Port: ${PORT}`);
});
