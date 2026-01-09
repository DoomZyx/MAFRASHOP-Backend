import {
  register,
  login,
  googleCallback,
  getMe,
  logout,
  updateProfile,
  requestPro,
  validateProManually,
  testProRequest,
} from "../controllers/auth.js";
import { verifyToken, isAdmin } from "../middleware/auth.js";

export default async function authRoutes(fastify, options) {
  fastify.post("/api/auth/register", register);

  fastify.post("/api/auth/login", login);

  fastify.post("/api/auth/google/callback", googleCallback);

  fastify.get("/api/auth/me", { preHandler: verifyToken }, getMe);

  fastify.post("/api/auth/logout", { preHandler: verifyToken }, logout);

  fastify.get("/api/auth/google/config", async (request, reply) => {
    
    const config = {
      success: true,
      data: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
      },
    };

    reply.send(config);
  });

  fastify.put("/api/auth/profile", { preHandler: verifyToken }, updateProfile);

  fastify.post(
    "/api/auth/pro/request",
    { preHandler: verifyToken },
    requestPro
  );

  // Endpoint de test : valide automatiquement sans vérification INSEE
  fastify.post(
    "/api/auth/pro/test-request",
    { preHandler: verifyToken },
    testProRequest
  );

  // Endpoint admin : valider/rejeter manuellement une demande
  fastify.post(
    "/api/auth/pro/validate",
    { preHandler: [verifyToken, isAdmin] },
    validateProManually
  );
}

