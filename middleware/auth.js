import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
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
    
    if (!config.JWT_SECRET) {
      throw new Error("JWT_SECRET non configuré");
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);
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
    
    if (!config.JWT_SECRET) {
      return;
    }
    
    const decoded = jwt.verify(token, config.JWT_SECRET);
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

export const validateCompanyAsync = async (userId, siret, companyName, additionalData = {}) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error(`Utilisateur ${userId} introuvable`);
      return;
    }

    // Utiliser les données supplémentaires fournies ou celles de l'utilisateur
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

    // Préparer les données de mise à jour
    const updateData = {
      proStatus: result.valid ? "validated" : "rejected",
      isPro: result.valid,
      company: {
        // Gérer le cas où user.company est null
        ...(user.company || {}),
        name: result.companyName || user.company?.name || companyName,
        siret: siret,
        address: result.address || user.company?.address || additionalData.address || "",
        city: result.city || user.company?.city || additionalData.city || "",
        zipCode: result.zipCode || user.company?.zipCode || additionalData.zipCode || "",
      },
    };

    // Utiliser User.update au lieu de findByIdAndUpdate
    await User.update(userId, updateData);

    if (!result.valid) {
      const warnings = result.warnings ? ` Avertissements: ${result.warnings.join(", ")}` : "";
      console.log(
        `Validation échouée pour l'utilisateur ${userId}: ${result.error}${warnings}`
      );
    } else {
      const warnings = result.warnings ? ` Avertissements: ${result.warnings.join(", ")}` : "";
      console.log(
        `Validation réussie pour l'utilisateur ${userId}: ${result.companyName}${warnings}`
      );
    }
  } catch (err) {
    console.error(`Erreur lors de la validation pour l'utilisateur ${userId}:`, err);
    await User.update(userId, {
      proStatus: "rejected",
      isPro: false,
    });
  }
};