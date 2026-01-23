import jwt from "jsonwebtoken";
import User from "../models/user.js";
import { validateCompanyAsync } from "../middleware/auth.js";

const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET non configuré");
  }

  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
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

    const token = generateToken(user.id);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Inscription réussie",
      data: {
        user: User.toJSON(user),
        token,
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

    const token = generateToken(user.id);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Connexion réussie",
      data: {
        user: User.toJSON(user),
        token,
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

    const token = generateToken(user.id);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Authentification Google réussie",
      data: {
        user: User.toJSON(user),
        token,
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

    const token = generateToken(user.id);

    reply.type("application/json");
    reply.send({
      success: true,
      message: "Connexion admin réussie",
      token,
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
  reply.type("application/json");
  reply.send({
    success: true,
    message: "Déconnexion réussie",
  });
};

export const requestPro = async (request, reply) => {
  try {
    const user = request.user;
    const { companyName, siret, address, city, zipCode } = request.body;

    if (!companyName || !siret) {
      return reply.code(400).send({
        success: false,
        message: "Le nom de l'entreprise et le SIRET sont requis",
      });
    }

    // Vérification du format du SIRET
    if (siret.length !== 14 || !/^\d+$/.test(siret)) {
      return reply.code(400).send({
        success: false,
        message: "Le SIRET doit contenir exactement 14 chiffres",
      });
    }

    if (
      user.proStatus !== "none" &&
      user.proStatus !== "rejected" &&
      user.proStatus !== "pending"
    ) {
      return reply.code(400).send({
        success: false,
        message:
          "Une demande de validation professionnelle est déjà en cours ou validée",
      });
    }

    const updateData = {
      company: {
        ...(user.company || {}),
        name: companyName.trim(),
        siret: siret,
        address: address?.trim() || user.company?.address || "",
        city: city?.trim() || user.company?.city || "",
        zipCode: zipCode?.trim() || user.company?.zipCode || "",
      },
      proStatus: "pending",
      isPro: false,
    };

    await User.update(user.id, updateData);

    // Préparer les données supplémentaires pour la validation
    const additionalData = {
      address: updateData.company.address || undefined,
      city: updateData.company.city || undefined,
      zipCode: updateData.company.zipCode || undefined,
    };

    // Lancement de la validation en asynchrone (ne bloque pas la réponse)
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

    // Validation manuelle : approuver ou rejeter
    const updatedUser = await User.update(user.id, {
      proStatus: approved ? "validated" : "rejected",
      isPro: approved || false,
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
      proStatus: "validated",
      isPro: true,
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