import {
  register,
  login,
  googleCallback,
  getMe,
  logout,
  updateProfile,
  updateCompanyProfile,
  requestPro,
  validateProManually,
  retryProInsee,
  testProRequest,
  adminLogin,
  adminGoogleCallback,
  adminMe,
  getAllUsers,
  updateUserRole,
  createAdminUser,
} from "../controllers/auth.js";
import { verifyToken, isAdmin } from "../middleware/auth.js";

export default async function authRoutes(fastify, options) {
  fastify.post("/api/auth/register", register);

  fastify.post("/api/auth/login", login);

  fastify.post("/api/auth/google/callback", googleCallback);

  fastify.get("/api/auth/me", { preHandler: verifyToken }, getMe);

  fastify.post("/api/auth/logout", { preHandler: verifyToken }, logout);

  fastify.get("/api/auth/google/config", async (request, reply) => {
    const googleConfig = {
      success: true,
      data: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
      },
    };

    reply.send(googleConfig);
  });

  fastify.put("/api/auth/profile", { preHandler: verifyToken }, updateProfile);

  fastify.put(
    "/api/auth/profile/company",
    { preHandler: verifyToken },
    updateCompanyProfile
  );

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

  // Endpoint admin : reprendre la vérification INSEE (quand verification_mode = manual, decision_source = null)
  fastify.post(
    "/api/auth/pro/retry-insee",
    { preHandler: [verifyToken, isAdmin] },
    retryProInsee
  );

  // Admin routes
  fastify.post("/api/auth/admin/login", adminLogin);
  fastify.post("/api/auth/admin/google/callback", adminGoogleCallback);
  fastify.get("/api/auth/admin/me", { preHandler: verifyToken }, adminMe);
  fastify.get("/api/auth/admin/check", { preHandler: verifyToken }, adminMe);
  
  // Admin: Gestion des utilisateurs
  fastify.get(
    "/api/admin/users",
    { preHandler: [verifyToken, isAdmin] },
    getAllUsers
  );
  fastify.post(
    "/api/admin/users",
    { preHandler: [verifyToken, isAdmin] },
    createAdminUser
  );
  fastify.patch(
    "/api/admin/users/:userId/role",
    { preHandler: [verifyToken, isAdmin] },
    updateUserRole
  );
}

