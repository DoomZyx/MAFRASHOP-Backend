import jwt from "jsonwebtoken";
import User from "../models/user.js";
import { verifySiretAndCompanyName } from "../API/insee.js";

export const verifyToken = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.code(401).send({ 
        success: false, 
        message: "Token d'authentification manquant" 
      });
    }

    const token = authHeader.split(" ")[1];
    
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET non configuré");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return reply.code(401).send({ 
        success: false, 
        message: "Utilisateur introuvable" 
      });
    }

    request.user = user;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return reply.code(401).send({ 
        success: false, 
        message: "Token expiré" 
      });
    }
    
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