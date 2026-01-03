import jwt from "jsonwebtoken";
import User from "../models/user.js";

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

      if (user && user.authProvider !== "google") {
        return reply.code(400).send({
          success: false,
          message: "Un compte existe déjà avec cet email",
        });
      }

      if (!user) {
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
      } else {
        user.googleId = googleUser.id;
        user.avatar = googleUser.picture;
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
