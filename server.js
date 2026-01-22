import "./loadEnv.js";
import fastify from "./app.js";

const PORT = parseInt(process.env.PORT || "8080", 10);

fastify.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error("Erreur lors du démarrage du serveur:", err);
    process.exit(1);
  }
  console.log(`Serveur Fastify démarré sur ${address}`);
  console.log(`Port: ${PORT}`);
  console.log(`Accessible sur: http://localhost:${PORT}`);
});
