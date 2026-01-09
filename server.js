import fastify from "./app.js";
import { config } from "./config/env.js";

fastify.listen({ port: config.PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error("Erreur lors du démarrage du serveur:", err);
    process.exit(1);
  }
  console.log(`Serveur Fastify démarré sur ${address}`);
  console.log(`Port: ${config.PORT}`);
  console.log(`Accessible sur: http://localhost:${config.PORT}`);
});
