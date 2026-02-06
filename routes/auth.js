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

  fastify.post("/auth/register", { preHandler: authRateLimit }, register);

  fastify.post("/auth/login", { preHandler: authRateLimit }, login);

  fastify.post("/auth/google/callback", { preHandler: authRateLimit }, googleCallback);

  fastify.get("/auth/me", { preHandler: verifyToken }, getMe);

  fastify.post("/auth/logout", { preHandler: verifyToken }, logout);

  fastify.post("/auth/refresh", refreshToken);

  fastify.get("/auth/google/config", async (request, reply) => {
    const googleConfig = {
      success: true,
      data: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
      },
    };

    reply.send(googleConfig);
  });

  fastify.put("/auth/profile", { preHandler: verifyToken }, updateProfile);

  fastify.put(
    "/auth/profile/company",
    { preHandler: verifyToken },
    updateCompanyProfile
  );

  fastify.post(
    "/auth/pro/request",
    { preHandler: verifyToken },
    requestPro
  );

  // Endpoint de test : valide automatiquement sans vérification INSEE
  fastify.post(
    "/auth/pro/test-request",
    { preHandler: verifyToken },
    testProRequest
  );

  // Endpoint admin : valider/rejeter manuellement une demande
  fastify.post(
    "/auth/pro/validate",
    { preHandler: [verifyToken, isAdmin] },
    validateProManually
  );

  // Endpoint admin : reprendre la vérification INSEE (quand verification_mode = manual, decision_source = null)
  fastify.post(
    "/auth/pro/retry-insee",
    { preHandler: [verifyToken, isAdmin] },
    retryProInsee
  );

  // Validation manuelle d'un numéro de TVA intracommunautaire (admin uniquement)
  fastify.post(
    "/auth/admin/validate-vat",
    { preHandler: [verifyToken, isAdmin] },
    validateVatManually
  );

  // Admin routes (rate limiting plus strict)
  const adminRateLimit = rateLimit({ max: 3, windowMs: 15 * 60 * 1000 }); // 3 tentatives / 15 min
  fastify.post("/auth/admin/login", { preHandler: adminRateLimit }, adminLogin);
  fastify.post("/auth/admin/google/callback", { preHandler: adminRateLimit }, adminGoogleCallback);
  fastify.get("/auth/admin/me", { preHandler: verifyToken }, adminMe);
  fastify.get("/auth/admin/check", { preHandler: verifyToken }, adminMe);
  
  // Admin: Gestion des utilisateurs
  fastify.get(
    "/admin/users",
    { preHandler: [verifyToken, isAdmin] },
    getAllUsers
  );
  fastify.post(
    "/admin/users",
    { preHandler: [verifyToken, isAdmin] },
    createAdminUser
  );
  fastify.patch(
    "/admin/users/:userId/role",
    { preHandler: [verifyToken, isAdmin] },
    updateUserRole
  );
}

