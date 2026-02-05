import jwt from "jsonwebtoken";
import User from "../models/user.js";
import { verifySiretAndCompanyName } from "../API/insee.js";
import BlacklistedToken from "../models/blacklistedTokens.js";
import UserSession from "../models/userSessions.js";

/**
 * Journaliser un échec d'authentification pour audit sécurité
 */
const logAuthFailure = (reason, details = {}) => {
  const ip = details.ip || "unknown";
  const userId = details.userId || "unknown";
  const timestamp = new Date().toISOString();
  
  console.warn(
    `[AUDIT AUTH] Échec authentification: ${reason} | ` +
    `IP: ${ip} | UserId: ${userId} | Timestamp: ${timestamp} | ` +
    `Details: ${JSON.stringify(details)}`
  );
};

export const verifyToken = async (request, reply) => {
  const clientIp = request.ip || request.headers["x-forwarded-for"] || "unknown";
  
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logAuthFailure("Token manquant", { ip: clientIp, path: request.url });
      return reply.code(401).send({ 
        success: false, 
        message: "Token d'authentification manquant" 
      });
    }

    const token = authHeader.split(" ")[1];
    
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET non configuré");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      // Journaliser selon le type d'erreur
      if (jwtError.name === "TokenExpiredError") {
        logAuthFailure("Token expiré", { 
          ip: clientIp, 
          path: request.url,
          userId: jwt.decode(token)?.userId || "unknown"
        });
        return reply.code(401).send({ 
          success: false, 
          message: "Token expiré" 
        });
      }
      
      if (jwtError.name === "JsonWebTokenError") {
        logAuthFailure("Token invalide (signature)", { 
          ip: clientIp, 
          path: request.url 
        });
      } else {
        logAuthFailure("Erreur vérification token", { 
          ip: clientIp, 
          path: request.url,
          error: jwtError.name 
        });
      }
      
      return reply.code(401).send({ 
        success: false, 
        message: "Token invalide" 
      });
    }

    // VÉRIFICATION BLACKLIST : Vérifier si le token est blacklisté
    if (decoded.jti) {
      const isBlacklisted = await BlacklistedToken.isBlacklisted(decoded.jti);
      if (isBlacklisted) {
        logAuthFailure("Token blacklisté", { 
          ip: clientIp, 
          path: request.url,
          userId: decoded.userId,
          jti: decoded.jti
        });
        return reply.code(401).send({ 
          success: false, 
          message: "Token révoqué" 
        });
      }

      // VÉRIFICATION SESSION : Vérifier si la session est active
      // Protection contre invalidation complète (changement password/email)
      const isSessionActive = await UserSession.isActive(decoded.jti);
      if (!isSessionActive) {
        logAuthFailure("Session invalidée", { 
          ip: clientIp, 
          path: request.url,
          userId: decoded.userId,
          jti: decoded.jti
        });
        return reply.code(401).send({ 
          success: false, 
          message: "Session invalidée. Veuillez vous reconnecter." 
        });
      }
    }

    // Vérifier que c'est un access token (pas un refresh token)
    if (decoded.type && decoded.type !== "access") {
      logAuthFailure("Mauvais type de token", { 
        ip: clientIp, 
        path: request.url,
        userId: decoded.userId,
        tokenType: decoded.type
      });
      return reply.code(401).send({ 
        success: false, 
        message: "Token invalide (type incorrect)" 
      });
    }

    const user = await User.findById(decoded.userId);
    
    if (!user) {
      logAuthFailure("Utilisateur introuvable", { 
        ip: clientIp, 
        path: request.url,
        userId: decoded.userId 
      });
      return reply.code(401).send({ 
        success: false, 
        message: "Utilisateur introuvable" 
      });
    }

    // SÉCURITÉ : Le rôle vient toujours de la DB, jamais du JWT
    // Même si le JWT est modifié, le rôle est récupéré depuis la DB
    request.user = user;
  } catch (error) {
    logAuthFailure("Erreur serveur authentification", { 
      ip: clientIp, 
      path: request.url,
      error: error.message 
    });
    
    return reply.code(401).send({ 
      success: false, 
      message: "Token invalide" 
    });
  }
};

export const optionalAuth = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return;
    }

    const token = authHeader.split(" ")[1];
    
    if (!process.env.JWT_SECRET) {
      return;
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (user) {
      request.user = user;
    }
  } catch (error) {
    // Ignore les erreurs pour l'authentification optionnelle
  }
};

export const isAdmin = async (request, reply) => {
  if (!request.user) {
    return reply.code(401).send({ 
      success: false, 
      message: "Authentification requise" 
    });
  }

  if (request.user.role !== "admin") {
    return reply.code(403).send({ 
      success: false, 
      message: "Accès réservé aux administrateurs" 
    });
  }
};

/**
 * Vérification asynchrone SIRET : applique les règles du workflow B2B.
 * - Si decision_source déjà défini (décision humaine) : ne rien modifier.
 * - Si erreur technique API : pro_status reste pending, verification_mode = manual, last_verification_error = code.
 * - Si entreprise valide : pro_status = verified, decision_source = auto, decision_at = now().
 * - Si SIRET invalide / entreprise inactive : pro_status = rejected, decision_source = auto, decision_at = now().
 */
export const validateCompanyAsync = async (userId, siret, companyName, additionalData = {}) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error(`Utilisateur ${userId} introuvable`);
      return;
    }

    if (user.decisionSource != null) {
      console.log(
        `Utilisateur ${userId}: décision déjà prise (source=${user.decisionSource}), aucune modification automatique.`
      );
      return;
    }

    const validationData = {
      address: additionalData.address || user.company?.address,
      city: additionalData.city || user.company?.city,
      zipCode: additionalData.zipCode || user.company?.zipCode,
    };

    const result = await verifySiretAndCompanyName(
      siret,
      companyName || user.company?.name || "",
      validationData
    );

    if (result.technicalError) {
      await User.update(userId, {
        verificationMode: "manual",
        lastVerificationError: result.technicalError,
      });
      console.log(
        `Utilisateur ${userId}: erreur technique INSEE (${result.technicalError}) -> passage en vérification manuelle.`
      );
      return;
    }

    if (result.valid) {
      await User.update(userId, {
        proStatus: "verified",
        isPro: true,
        decisionSource: "auto",
        decisionAt: new Date().toISOString(),
        verificationMode: "auto",
        lastVerificationError: null,
        company: {
          ...(user.company || {}),
          name: result.companyName || user.company?.name || companyName,
          siret: siret,
          address: result.address || user.company?.address || additionalData.address || "",
          city: result.city || user.company?.city || additionalData.city || "",
          zipCode: result.zipCode || user.company?.zipCode || additionalData.zipCode || "",
        },
      });
      const warnings = result.warnings ? ` Avertissements: ${result.warnings.join(", ")}` : "";
      console.log(
        `Validation automatique réussie pour l'utilisateur ${userId}: ${result.companyName}${warnings}`
      );
      return;
    }

    await User.update(userId, {
      proStatus: "rejected",
      isPro: false,
      decisionSource: "auto",
      decisionAt: new Date().toISOString(),
      lastVerificationError: result.lastVerificationError || "invalid_siret",
      company: {
        ...(user.company || {}),
        name: user.company?.name || companyName,
        siret: siret,
        address: user.company?.address || additionalData.address || "",
        city: user.company?.city || additionalData.city || "",
        zipCode: user.company?.zipCode || additionalData.zipCode || "",
      },
    });
    const warnings = result.warnings ? ` Avertissements: ${result.warnings.join(", ")}` : "";
    console.log(
      `Validation automatique refusée pour l'utilisateur ${userId}: ${result.error}${warnings}`
    );
  } catch (err) {
    console.error(`Erreur lors de la validation pour l'utilisateur ${userId}:`, err);
    const user = await User.findById(userId);
    if (user && user.decisionSource == null) {
      await User.update(userId, {
        verificationMode: "manual",
        lastVerificationError: "api_unavailable",
      });
      console.log(
        `Utilisateur ${userId}: exception lors de l'appel INSEE -> passage en vérification manuelle.`
      );
    }
  }
};