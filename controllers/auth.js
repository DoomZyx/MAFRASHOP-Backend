import jwt from "jsonwebtoken";
import User from "../models/user.js";
import { validateCompanyAsync } from "../middleware/auth.js";
import BlacklistedToken from "../models/blacklistedTokens.js";
import { generateJTI } from "../models/blacklistedTokens.js";
import UserSession from "../models/userSessions.js";

const COOKIE_ACCESS = "mafra_at";
const COOKIE_REFRESH = "mafra_rt";
const isProduction = process.env.NODE_ENV === "production";

const setAuthCookies = (reply, accessToken, refreshToken, accessTokenExpiresIn) => {
  const cookieOpts = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  };
  reply.setCookie(COOKIE_ACCESS, accessToken, {
    ...cookieOpts,
    maxAge: accessTokenExpiresIn,
  });
  reply.setCookie(COOKIE_REFRESH, refreshToken, {
    ...cookieOpts,
    maxAge: 7 * 24 * 3600,
  });
};

const clearAuthCookies = (reply) => {
  reply.clearCookie(COOKIE_ACCESS, { path: "/" });
  reply.clearCookie(COOKIE_REFRESH, { path: "/" });
};

/**
 * Génère un access token (courte durée) et un refresh token (longue durée)
 * @param {string} userId - ID de l'utilisateur
 * @param {string} [ipAddress] - Adresse IP (optionnel, pour tracking)
 * @param {string} [userAgent] - User agent (optionnel, pour tracking)
 * @returns {Object} { accessToken, refreshToken, accessTokenExpiresIn }
 */
const generateTokens = async (userId, ipAddress = null, userAgent = null) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET non configuré");
  }

  // Access token : 1 heure (sécurité renforcée)
  const accessJti = generateJTI();
  const accessTokenExp = Math.floor(Date.now() / 1000) + 3600; // 1h
  const accessToken = jwt.sign(
    { userId, jti: accessJti, type: "access" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Refresh token : 7 jours (pour maintenir la session)
  const refreshJti = generateJTI();
  const refreshTokenExp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 7j
  const refreshToken = jwt.sign(
    { userId, jti: refreshJti, type: "refresh" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  // Enregistrer les sessions dans la base de données
  // Permet d'invalider tous les tokens d'un utilisateur si nécessaire
  try {
    await UserSession.create(
      userId,
      accessJti,
      "access",
      new Date(accessTokenExp * 1000),
      ipAddress,
      userAgent
    );
    await UserSession.create(
      userId,
      refreshJti,
      "refresh",
      new Date(refreshTokenExp * 1000),
      ipAddress,
      userAgent
    );
  } catch (error) {
    // Si erreur d'enregistrement session, on continue quand même (tokens valides)
    console.warn(`[AUDIT AUTH] Erreur enregistrement session:`, error.message);
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: 3600, // 1 heure en secondes
  };
};

/**
 * Génère uniquement un access token (pour compatibilité)
 * @deprecated Utiliser generateTokens à la place
 */
const generateToken = async (userId) => {
  const { accessToken } = await generateTokens(userId);
  return accessToken;
};

export const register = async (request, reply) => {
  try {
    const { email, password, firstName, lastName } = request.body;

    if (!email || !password || !firstName || !lastName) {
      return reply.code(400).send({
        success: false,
        message: "Tous les champs sont requis",
      });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return reply.code(400).send({
        success: false,
        message: "Cet email est déjà utilisé",
      });
    }

    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      authProvider: "local",
    });

    const tokens = await generateTokens(user.id, request.ip, request.headers["user-agent"]);
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken, tokens.accessTokenExpiresIn);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Inscription réussie",
      data: {
        user: User.toJSON(user),
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'inscription:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de l'inscription",
    });
  }
};

export const login = async (request, reply) => {
  try {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.code(400).send({
        success: false,
        message: "Email et mot de passe requis",
      });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return reply.code(401).send({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    if (user.authProvider !== "local") {
      return reply.code(400).send({
        success: false,
        message: `Ce compte utilise l'authentification ${user.authProvider}`,
      });
    }

    const isPasswordValid = await User.comparePassword(user.id, password);
    if (!isPasswordValid) {
      return reply.code(401).send({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    const tokens = await generateTokens(user.id, request.ip, request.headers["user-agent"]);
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken, tokens.accessTokenExpiresIn);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Connexion réussie",
      data: {
        user: User.toJSON(user),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la connexion",
    });
  }
};

export const googleCallback = async (request, reply) => {
  try {
    const { code } = request.body;

    if (!code) {
      return reply.code(400).send({
        success: false,
        message: "Code d'autorisation manquant",
      });
    }

    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } =
      process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      throw new Error("Configuration Google OAuth manquante");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Erreur Google OAuth:", tokenData);
      return reply.code(400).send({
        success: false,
        message: "Échec de l'authentification Google",
      });
    }

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const googleUser = await userInfoResponse.json();

    if (!userInfoResponse.ok) {
      return reply.code(400).send({
        success: false,
        message: "Impossible de récupérer les informations utilisateur",
      });
    }

    let user = await User.findByGoogleId(googleUser.id);

    if (!user) {
      user = await User.findByEmail(googleUser.email);

      if (user) {
        // Si un compte existe avec cet email, lier le compte Google
        const updateData = {
          googleId: googleUser.id,
          authProvider: "google",
        };

        if (googleUser.picture && user.avatar !== googleUser.picture) {
          updateData.avatar = googleUser.picture;
        }

        await User.update(user.id, updateData);
        user = await User.findById(user.id);
      } else {
        // Nouveau compte, créer l'utilisateur
        user = await User.create({
          email: googleUser.email,
          firstName: googleUser.given_name || "Utilisateur",
          lastName: googleUser.family_name || "Google",
          googleId: googleUser.id,
          avatar: googleUser.picture,
          authProvider: "google",
          isVerified: true,
        });
      }
    } else {
      if (googleUser.picture && user.avatar !== googleUser.picture) {
        await User.update(user.id, { avatar: googleUser.picture });
        user = await User.findById(user.id);
      }
    }

    const tokens = await generateTokens(user.id, request.ip, request.headers["user-agent"]);
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken, tokens.accessTokenExpiresIn);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Authentification Google réussie",
      data: {
        user: User.toJSON(user),
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'authentification Google:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de l'authentification Google",
    });
  }
};

// Admin login
export const adminLogin = async (request, reply) => {
  try {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.code(400).send({
        success: false,
        message: "Email et mot de passe requis",
      });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return reply.code(401).send({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    if (user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    if (user.authProvider !== "local") {
      return reply.code(400).send({
        success: false,
        message: `Ce compte utilise l'authentification ${user.authProvider}`,
      });
    }

    const isPasswordValid = await User.comparePassword(user.id, password);
    if (!isPasswordValid) {
      return reply.code(401).send({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    const tokens = await generateTokens(user.id, request.ip, request.headers["user-agent"]);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Connexion admin réussie",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.accessTokenExpiresIn,
      user: {
        id: user.id,
        email: user.email,
        isAdmin: true,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion admin:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la connexion",
    });
  }
};

// Admin Google callback
export const adminGoogleCallback = async (request, reply) => {
  try {
    const { code } = request.body;

    if (!code) {
      return reply.code(400).send({
        success: false,
        message: "Code d'autorisation manquant",
      });
    }

    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } =
      process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      throw new Error("Configuration Google OAuth manquante");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Erreur Google OAuth:", tokenData);
      return reply.code(400).send({
        success: false,
        message: "Échec de l'authentification Google",
      });
    }

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const googleUser = await userInfoResponse.json();

    if (!userInfoResponse.ok) {
      return reply.code(400).send({
        success: false,
        message: "Impossible de récupérer les informations utilisateur",
      });
    }

    let user = await User.findByGoogleId(googleUser.id);

    if (!user) {
      user = await User.findByEmail(googleUser.email);
    }

    if (!user) {
      return reply.code(403).send({
        success: false,
        message: "Compte non trouvé. Veuillez contacter un administrateur.",
      });
    }

    if (user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    if (user.authProvider !== "google" && !user.googleId) {
      await User.update(user.id, {
        googleId: googleUser.id,
        authProvider: "google",
      });
      user = await User.findById(user.id);
    }

    if (googleUser.picture && user.avatar !== googleUser.picture) {
      await User.update(user.id, { avatar: googleUser.picture });
      user = await User.findById(user.id);
    }

    const tokens = await generateTokens(user.id, request.ip, request.headers["user-agent"]);
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken, tokens.accessTokenExpiresIn);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Authentification admin Google réussie",
      user: {
        id: user.id,
        email: user.email,
        isAdmin: true,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'authentification admin Google:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de l'authentification Google",
    });
  }
};

// Admin me
export const adminMe = async (request, reply) => {
  try {
    const user = request.user;
    
    if (user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    reply.type("application/json");
    reply.send({
      id: user.id,
      email: user.email,
      isAdmin: true,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération admin:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur serveur",
    });
  }
};

export const getMe = async (request, reply) => {
  try {
    const user = await User.findById(request.user.id);

    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    reply.type("application/json");
    reply.send({
      success: true,
      data: {
        user: User.toJSON(user),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du profil:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur serveur",
    });
  }
};

export const logout = async (request, reply) => {
  try {
    let token = null;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (request.cookies && request.cookies[COOKIE_ACCESS]) {
      token = request.cookies[COOKIE_ACCESS];
    }

    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.jti && decoded.exp) {
          const expiresAt = new Date(decoded.exp * 1000);
          await BlacklistedToken.blacklist(
            decoded.jti,
            request.user?.id || decoded.userId,
            expiresAt,
            "logout"
          );
          console.log(
            `[AUDIT AUTH] Token blacklisté lors du logout | ` +
            `UserId: ${request.user?.id || decoded.userId} | JTI: ${decoded.jti} | IP: ${request.ip || "unknown"}`
          );
        }
      } catch (error) {
        console.warn(`[AUDIT AUTH] Erreur lors du blacklist token (logout):`, error.message);
      }
    }

    clearAuthCookies(reply);
    reply.type("application/json");
    reply.send({
      success: true,
      message: "Déconnexion réussie",
    });
  } catch (error) {
    console.error("Erreur lors du logout:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la déconnexion",
    });
  }
};

export const refreshToken = async (request, reply) => {
  try {
    const refreshTokenValue =
      request.cookies?.[COOKIE_REFRESH] ||
      request.body?.refreshToken;

    if (!refreshTokenValue) {
      return reply.code(400).send({
        success: false,
        message: "Refresh token requis",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET non configuré");
    }

    // Vérifier le refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshTokenValue, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return reply.code(401).send({
          success: false,
          message: "Refresh token expiré",
        });
      }
      return reply.code(401).send({
        success: false,
        message: "Refresh token invalide",
      });
    }

    // Vérifier que c'est bien un refresh token
    if (decoded.type !== "refresh") {
      return reply.code(401).send({
        success: false,
        message: "Token invalide (doit être un refresh token)",
      });
    }

    // Vérifier que le token n'est pas blacklisté
    if (decoded.jti) {
      const isBlacklisted = await BlacklistedToken.isBlacklisted(decoded.jti);
      if (isBlacklisted) {
        console.warn(
          `[AUDIT AUTH] Tentative d'utilisation d'un refresh token blacklisté | ` +
          `UserId: ${decoded.userId} | JTI: ${decoded.jti} | IP: ${request.ip || "unknown"}`
        );
        return reply.code(401).send({
          success: false,
          message: "Token révoqué",
        });
      }
    }

    // Vérifier que l'utilisateur existe toujours
    const user = await User.findById(decoded.userId);
    if (!user) {
      return reply.code(401).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    // 🔐 ROTATION REFRESH TOKEN (CRITIQUE) : Blacklister l'ancien refresh token
    // Protection contre vol de refresh token : même si volé, il devient inutilisable après premier refresh
    if (decoded.jti && decoded.exp) {
      const expiresAt = new Date(decoded.exp * 1000);
      await BlacklistedToken.blacklist(
        decoded.jti,
        decoded.userId,
        expiresAt,
        "refresh_rotation"
      );
      console.log(
        `[AUDIT AUTH] Refresh token roté (ancien blacklisté) | ` +
        `UserId: ${decoded.userId} | JTI: ${decoded.jti} | IP: ${request.ip || "unknown"}`
      );
    }

    const tokens = await generateTokens(user.id, request.ip, request.headers["user-agent"]);
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken, tokens.accessTokenExpiresIn);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Tokens renouvelés",
    });
  } catch (error) {
    console.error("Erreur lors du refresh token:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors du renouvellement du token",
    });
  }
};

export const requestPro = async (request, reply) => {
  try {
    const user = request.user;
    const { companyName, siret, address, city, zipCode, companyCountry, vatNumber } = request.body;

    if (!companyName) {
      return reply.code(400).send({
        success: false,
        message: "Le nom de l'entreprise est requis",
      });
    }

    // SIRET requis uniquement si pas de numéro de TVA intracommunautaire
    const hasVatNumber = vatNumber && vatNumber.trim().length > 0;
    
    if (!hasVatNumber && !siret) {
      return reply.code(400).send({
        success: false,
        message: "Le SIRET est requis (sauf si vous avez un numéro de TVA intracommunautaire)",
      });
    }

    // Vérification du format du SIRET (uniquement si fourni)
    if (siret && (siret.length !== 14 || !/^\d+$/.test(siret))) {
      return reply.code(400).send({
        success: false,
        message: "Le SIRET doit contenir exactement 14 chiffres",
      });
    }

    if (user.proStatus === "verified") {
      return reply.code(400).send({
        success: false,
        message: "Votre compte professionnel est déjà validé",
      });
    }

    if (user.proStatus === "pending" && user.decisionSource != null) {
      return reply.code(400).send({
        success: false,
        message: "Une décision a déjà été prise sur votre demande",
      });
    }

    // Validation du numéro de TVA intracommunautaire si fourni
    let vatStatus = "none";
    if (vatNumber && companyCountry) {
      const cleanVatNumber = vatNumber.replace(/[\s\-\.]/g, "").toUpperCase();
      const cleanCountryCode = companyCountry.toUpperCase();

      // Vérification du format
      if (!isValidVatFormat(cleanCountryCode, cleanVatNumber)) {
        return reply.code(400).send({
          success: false,
          message: "Le format du numéro de TVA intracommunautaire est invalide",
        });
      }

      // Vérification via VIES (asynchrone, ne bloque pas la réponse)
      verifyVatNumber(cleanCountryCode, cleanVatNumber)
        .then((result) => {
          if (result.valid) {
            // TVA validée automatiquement
            User.update(user.id, {
              "company.vatStatus": "validated",
              "company.vatValidationDate": new Date().toISOString(),
            }).catch((err) => console.error("Erreur mise à jour vatStatus:", err));
          } else if (result.technicalError) {
            // Erreur technique VIES → validation manuelle
            User.update(user.id, {
              "company.vatStatus": "pending_manual",
            }).catch((err) => console.error("Erreur mise à jour vatStatus:", err));
          } else {
            // Numéro invalide
            User.update(user.id, {
              "company.vatStatus": "rejected",
            }).catch((err) => console.error("Erreur mise à jour vatStatus:", err));
          }
        })
        .catch((err) => {
          console.error("Erreur vérification VIES:", err);
          // En cas d'erreur → validation manuelle
          User.update(user.id, {
            "company.vatStatus": "pending_manual",
          }).catch((e) => console.error("Erreur mise à jour vatStatus:", e));
        });

      // Par défaut, on démarre en pending_manual (sera mis à jour par le callback ci-dessus)
      vatStatus = "pending_manual";
    }

    const updateData = {
      company: {
        ...(user.company || {}),
        name: companyName.trim(),
        siret: siret || null,
        address: address?.trim() || user.company?.address || "",
        city: city?.trim() || user.company?.city || "",
        zipCode: zipCode?.trim() || user.company?.zipCode || "",
        country: companyCountry?.trim().toUpperCase() || "FR",
        vatNumber: vatNumber?.trim().toUpperCase() || null,
        vatStatus: vatStatus,
        vatValidationDate: null,
      },
      proStatus: "pending",
      isPro: false,
      verificationMode: hasVatNumber ? "manual" : "auto",
      decisionSource: null,
      decisionAt: null,
      reviewedByAdminId: null,
      lastVerificationError: null,
    };

    await User.update(user.id, updateData);

    // Lancement de la validation INSEE uniquement si SIRET fourni
    if (siret) {
      const additionalData = {
        address: updateData.company.address || undefined,
        city: updateData.company.city || undefined,
        zipCode: updateData.company.zipCode || undefined,
      };

      validateCompanyAsync(
        user.id,
        siret,
        companyName.trim(),
        additionalData
      ).catch((err) => {
        console.error(
          `Erreur lors de la validation asynchrone pour l'utilisateur ${user.id}:`,
          err
        );
      });
    }

    reply.type("application/json");
    return reply.code(200).send({
      success: true,
      message: "Demande de validation professionnelle en cours de traitement",
    });
  } catch (error) {
    console.error("Erreur lors de la demande pro:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la demande de validation professionnelle",
    });
  }
};

export const validateProManually = async (request, reply) => {
  try {
    const { userId, approved } = request.body;
    const adminId = request.user.id;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        message: "L'ID de l'utilisateur est requis",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    if (user.decisionSource != null) {
      return reply.code(400).send({
        success: false,
        message:
          "Une décision a déjà été prise pour ce compte (automatique ou manuelle). Aucune modification possible.",
      });
    }

    const updatedUser = await User.update(user.id, {
      proStatus: approved ? "verified" : "rejected",
      isPro: approved || false,
      decisionSource: "manual",
      decisionAt: new Date().toISOString(),
      reviewedByAdminId: adminId,
      lastVerificationError: null,
    });

    reply.type("application/json");
    return reply.code(200).send({
      success: true,
      message: approved
        ? "Compte professionnel validé avec succès"
        : "Compte professionnel rejeté",
      data: {
        user: User.toJSON(updatedUser),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la validation manuelle:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la validation",
    });
  }
};

/**
 * Reprise automatique INSEE (admin uniquement).
 * Autorisé uniquement si pro_status = pending, verification_mode = manual, decision_source IS NULL.
 * Repasse verification_mode = auto et relance validateCompanyAsync.
 */
/**
 * Validation manuelle d'un numéro de TVA intracommunautaire (admin uniquement)
 * Autorisé uniquement si vat_status = "pending_manual"
 */
export const validateVatManually = async (request, reply) => {
  try {
    const { userId, approved } = request.body;
    const adminId = request.user.id;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        message: "L'ID de l'utilisateur est requis",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    if (!user.company || !user.company.vatNumber) {
      return reply.code(400).send({
        success: false,
        message: "Aucun numéro de TVA renseigné pour cet utilisateur",
      });
    }

    if (user.company.vatStatus !== "pending_manual") {
      return reply.code(400).send({
        success: false,
        message: `Validation manuelle impossible. Statut actuel: ${user.company.vatStatus}`,
      });
    }

    const updatedUser = await User.update(user.id, {
      "company.vatStatus": approved ? "validated" : "rejected",
      "company.vatValidationDate": new Date().toISOString(),
    });

    reply.type("application/json");
    return reply.code(200).send({
      success: true,
      message: approved
        ? "Numéro de TVA intracommunautaire validé avec succès"
        : "Numéro de TVA intracommunautaire rejeté",
      data: {
        user: User.toJSON(updatedUser),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la validation manuelle TVA:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la validation TVA",
    });
  }
};

export const retryProInsee = async (request, reply) => {
  try {
    const { userId } = request.body;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        message: "L'ID de l'utilisateur est requis",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    if (user.decisionSource != null) {
      return reply.code(400).send({
        success: false,
        message:
          "Une décision a déjà été prise pour ce compte. La reprise automatique INSEE n'est plus possible.",
      });
    }

    if (user.proStatus !== "pending") {
      return reply.code(400).send({
        success: false,
        message: "Seuls les comptes en attente (pending) peuvent être retentés.",
      });
    }

    if (user.verificationMode !== "manual") {
      return reply.code(400).send({
        success: false,
        message: "La reprise INSEE est réservée aux demandes passées en vérification manuelle (erreur technique).",
      });
    }

    if (!user.company?.siret) {
      return reply.code(400).send({
        success: false,
        message: "Aucun SIRET enregistré pour cet utilisateur.",
      });
    }

    await User.update(user.id, { verificationMode: "auto" });

    const additionalData = {
      address: user.company?.address,
      city: user.company?.city,
      zipCode: user.company?.zipCode,
    };

    validateCompanyAsync(
      user.id,
      user.company.siret,
      user.company?.name || "",
      additionalData
    ).catch((err) => {
      console.error(`Erreur reprise INSEE pour l'utilisateur ${user.id}:`, err);
    });

    reply.type("application/json");
    return reply.code(200).send({
      success: true,
      message: "Vérification INSEE relancée. Le statut sera mis à jour sous peu.",
    });
  } catch (error) {
    console.error("Erreur lors de la reprise INSEE:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la reprise de la vérification INSEE",
    });
  }
};

export const testProRequest = async (request, reply) => {
  try {
    const userId = request.user.id;
    const { companyName, siret, address, city, zipCode } = request.body;

    if (!companyName || !siret) {
      return reply.code(400).send({
        success: false,
        message: "Le nom de l'entreprise et le SIRET sont requis",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    // Mode test : valider automatiquement sans vérification INSEE
    const updatedUser = await User.update(user.id, {
      company: {
        ...(user.company || {}),
        name: companyName.trim(),
        siret: siret,
        address: address?.trim() || "",
        city: city?.trim() || "",
        zipCode: zipCode?.trim() || "",
      },
      proStatus: "verified",
      isPro: true,
      decisionSource: "auto",
      decisionAt: new Date().toISOString(),
      verificationMode: "auto",
      lastVerificationError: null,
    });

    reply.type("application/json");
    return reply.code(200).send({
      success: true,
      message: "Compte professionnel validé en mode test (sans vérification INSEE)",
      data: {
        user: User.toJSON(updatedUser),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la demande pro test:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la demande de validation professionnelle",
    });
  }
};

export const updateProfile = async (request, reply) => {
  try {
    const { firstName, lastName, address, city, zipCode, phone } = request.body;
    const userId = request.user.id;

    if (!firstName || !lastName || !address || !city || !zipCode || !phone) {
      return reply.code(400).send({
        success: false,
        message: "Tous les champs sont requis",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    const updatedUser = await User.update(userId, {
      firstName,
      lastName,
      address,
      city,
      zipCode,
      phone,
    });

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Profil mis a jour avec succes",
      data: {
        user: User.toJSON(updatedUser),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise a jour du profil:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la MAJ du profile",
    });
  }
};

export const updateCompanyProfile = async (request, reply) => {
  try {
    const userId = request.user.id;
    const { companyName, siret, address, city, zipCode, companyPhone, companyEmail } = request.body;

    const user = await User.findById(userId);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    if (!user.isPro) {
      return reply.code(403).send({
        success: false,
        message: "Seuls les comptes professionnels peuvent modifier les informations entreprise",
      });
    }

    if (!companyName?.trim() || !siret?.trim()) {
      return reply.code(400).send({
        success: false,
        message: "Le nom de l'entreprise et le SIRET sont requis",
      });
    }

    if (siret.replace(/\D/g, "").length !== 14) {
      return reply.code(400).send({
        success: false,
        message: "Le SIRET doit contenir exactement 14 chiffres",
      });
    }

    const updatedUser = await User.update(userId, {
      company: {
        ...(user.company || {}),
        name: companyName.trim(),
        siret: siret.replace(/\D/g, ""),
        address: address?.trim() || null,
        city: city?.trim() || null,
        zipCode: zipCode?.trim() || null,
        phone: companyPhone?.trim() || null,
        email: companyEmail?.trim() || null,
      },
    });

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Informations entreprise mises a jour avec succes",
      data: {
        user: User.toJSON(updatedUser),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise a jour des infos entreprise:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise a jour des informations entreprise",
    });
  }
};

// Admin: Lister tous les utilisateurs
export const getAllUsers = async (request, reply) => {
  try {
    const users = await User.findAll();
    
    reply.type("application/json");
    reply.send({
      success: true,
      data: {
        users: users.map((user) => User.toJSON(user)),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des utilisateurs:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des utilisateurs",
    });
  }
};

// Admin: Modifier le rôle d'un utilisateur
export const updateUserRole = async (request, reply) => {
  try {
    const { userId } = request.params;
    const { role } = request.body;

    if (!role || !["user", "admin"].includes(role)) {
      return reply.code(400).send({
        success: false,
        message: "Le rôle doit être 'user' ou 'admin'",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    // Empêcher de retirer le rôle admin à soi-même
    if (request.user.id === userId && role === "user") {
      return reply.code(400).send({
        success: false,
        message: "Vous ne pouvez pas retirer votre propre rôle d'administrateur",
      });
    }

    const updatedUser = await User.update(userId, { role });

    reply.type("application/json");
    reply.send({
      success: true,
      message: `Rôle mis à jour avec succès`,
      data: {
        user: User.toJSON(updatedUser),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du rôle:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour du rôle",
    });
  }
};

// Admin: Créer un utilisateur admin
export const createAdminUser = async (request, reply) => {
  try {
    const { email, password, firstName, lastName, role } = request.body;

    if (!email || !password || !firstName || !lastName) {
      return reply.code(400).send({
        success: false,
        message: "Email, mot de passe, prénom et nom sont requis",
      });
    }

    if (password.length < 6) {
      return reply.code(400).send({
        success: false,
        message: "Le mot de passe doit contenir au moins 6 caractères",
      });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return reply.code(400).send({
        success: false,
        message: "Cet email est déjà utilisé",
      });
    }

    const userRole = role === "admin" ? "admin" : "user";

    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      authProvider: "local",
      isVerified: true,
      role: userRole,
    });

    reply.type("application/json");
    reply.send({
      success: true,
      message: `Utilisateur ${userRole === "admin" ? "administrateur" : ""} créé avec succès`,
      data: {
        user: User.toJSON(user),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur:", error);
    reply.type("application/json");
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la création de l'utilisateur",
    });
  }
};