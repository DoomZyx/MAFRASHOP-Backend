import jwt from "jsonwebtoken";
import User from "../models/user.js";

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
    
    const user = await User.findById(decoded.userId).select("-password");
    
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");
    
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


