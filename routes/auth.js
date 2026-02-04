import {
  register,
  login,
  googleCallback,
  getMe,
  logout,
  refreshToken,
  updateProfile,
  updateCompanyProfile,
  requestPro,
  validateProManually,
  validateVatManually,
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
import { rateLimit } from "../middleware/rateLimit.js";

export default async function authRoutes(fastify, options) {
  // Rate limiting pour les endpoints d'authentification (protection brute force)
  const authRateLimit = rateLimit({ max: 5, windowMs: 15 * 60 * 1000 }); // 5 tentatives / 15 min

  fastify.post("/api/auth/register", { preHandler: authRateLimit }, register);

  fastify.post("/api/auth/login", { preHandler: authRateLimit }, login);

  fastify.post("/api/auth/google/callback", { preHandler: authRateLimit }, googleCallback);

  fastify.get("/api/auth/me", { preHandler: verifyToken }, getMe);

  fastify.post("/api/auth/logout", { preHandler: verifyToken }, logout);

  fastify.post("/api/auth/refresh", refreshToken);

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

  // Validation manuelle d'un numéro de TVA intracommunautaire (admin uniquement)
  fastify.post(
    "/api/auth/admin/validate-vat",
    { preHandler: [verifyToken, isAdmin] },
    validateVatManually
  );

  // Admin routes (rate limiting plus strict)
  const adminRateLimit = rateLimit({ max: 3, windowMs: 15 * 60 * 1000 }); // 3 tentatives / 15 min
  fastify.post("/api/auth/admin/login", { preHandler: adminRateLimit }, adminLogin);
  fastify.post("/api/auth/admin/google/callback", { preHandler: adminRateLimit }, adminGoogleCallback);
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

