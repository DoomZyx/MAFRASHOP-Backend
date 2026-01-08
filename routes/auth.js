import {
  register,
  login,
  googleCallback,
  getMe,
  logout,
  updateProfile,
} from "../controllers/auth.js";
import { verifyToken } from "../middleware/auth.js";

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
}

