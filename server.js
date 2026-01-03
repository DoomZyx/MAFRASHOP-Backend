import fastify from "./app.js";
import { config } from "./config/env.js";

fastify.listen({ port: config.PORT }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Serveur en cours sur le port ${config.PORT}`);
});
