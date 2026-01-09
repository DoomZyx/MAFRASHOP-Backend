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

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return reply.code(400).send({
        success: false,
        message: "Cet email est déjà utilisé",
      });
    }

    const user = new User({
      email,
      password,
      firstName,
      lastName,
      authProvider: "local",
    });

    await user.save();

    const token = generateToken(user._id);

    reply.send({
      success: true,
      message: "Inscription réussie",
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'inscription:", error);
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

    const user = await User.findOne({ email });
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

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return reply.code(401).send({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    const token = generateToken(user._id);

    reply.send({
      success: true,
      message: "Connexion réussie",
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion:", error);
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

    let user = await User.findOne({ googleId: googleUser.id });

    if (!user) {
      user = await User.findOne({ email: googleUser.email });

      if (user) {
        // Si un compte existe avec cet email, lier le compte Google
        if (!user.googleId) {
          user.googleId = googleUser.id;
          user.authProvider = "google"; // Permet aussi la connexion Google
        }
        // Mettre à jour l'avatar si nécessaire
        if (googleUser.picture && user.avatar !== googleUser.picture) {
          user.avatar = googleUser.picture;
        }
        await user.save();
      } else {
        // Nouveau compte, créer l'utilisateur
        user = new User({
          email: googleUser.email,
          firstName: googleUser.given_name || "Utilisateur",
          lastName: googleUser.family_name || "Google",
          googleId: googleUser.id,
          avatar: googleUser.picture,
          authProvider: "google",
          isVerified: true,
        });

        await user.save();
      }
    } else {
      if (googleUser.picture && user.avatar !== googleUser.picture) {
        user.avatar = googleUser.picture;
        await user.save();
      }
    }

    const token = generateToken(user._id);

    reply.send({
      success: true,
      message: "Authentification Google réussie",
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'authentification Google:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors de l'authentification Google",
    });
  }
};

export const getMe = async (request, reply) => {
  try {
    const user = await User.findById(request.user._id).select("-password");

    if (!user) {
      return reply.code(404).send({
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    reply.send({
      success: true,
      data: {
        user: user.toJSON(),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du profil:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur serveur",
    });
  }
};

export const logout = async (request, reply) => {
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

    user.company = {
      name: companyName.trim(),
      siret: siret,
      address: address?.trim() || user.company?.address || "",
      city: city?.trim() || user.company?.city || "",
      zipCode: zipCode?.trim() || user.company?.zipCode || "",
      ...user.company, // Conserver les autres champs existants (phone, email)
    };
    user.proStatus = "pending";
    user.isPro = false;

    await user.save();

    // Préparer les données supplémentaires pour la validation
    const additionalData = {
      address: user.company.address || undefined,
      city: user.company.city || undefined,
      zipCode: user.company.zipCode || undefined,
    };

    // Lancement de la validation en asynchrone (ne bloque pas la réponse)
    validateCompanyAsync(
      user._id,
      siret,
      companyName.trim(),
      additionalData
    ).catch((err) => {
      console.error(
        `Erreur lors de la validation asynchrone pour l'utilisateur ${user._id}:`,
        err
      );
    });

    return reply.code(200).send({
      success: true,
      message: "Demande de validation professionnelle en cours de traitement",
    });
  } catch (error) {
    console.error("Erreur lors de la demande pro:", error);
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
    user.proStatus = approved ? "validated" : "rejected";
    user.isPro = approved || false;

    await user.save();

    return reply.code(200).send({
      success: true,
      message: approved
        ? "Compte professionnel validé avec succès"
        : "Compte professionnel rejeté",
      data: {
        user: user.toJSON(),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la validation manuelle:", error);
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la validation",
    });
  }
};

export const testProRequest = async (request, reply) => {
  try {
    const userId = request.user._id;
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
    user.company = {
      name: companyName.trim(),
      siret: siret,
      address: address?.trim() || "",
      city: city?.trim() || "",
      zipCode: zipCode?.trim() || "",
      ...user.company,
    };
    user.proStatus = "validated";
    user.isPro = true;

    await user.save();

    return reply.code(200).send({
      success: true,
      message: "Compte professionnel validé en mode test (sans vérification INSEE)",
      data: {
        user: user.toJSON(),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la demande pro test:", error);
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la demande de validation professionnelle",
    });
  }
};

export const updateProfile = async (request, reply) => {
  try {
    const { firstName, lastName, address, city, zipCode, phone } = request.body;
    const userId = request.user._id;

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

    user.firstName = firstName;
    user.lastName = lastName;
    user.address = address;
    user.city = city;
    user.zipCode = zipCode;
    user.phone = phone;

    await user.save();

    reply.send({
      success: true,
      message: "Profil mis a jour avec succes",
      data: {
        user: user.toJSON(),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise a jour du profil:", error);
    reply.code(500).send({
      success: false,
      message: "Erreur lors de la MAJ du profile",
    });
  }
};
