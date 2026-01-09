import dotenv from "dotenv";
dotenv.config();

const INSEE_API_BASE_URL = "https://api.insee.fr/entreprises/sirene/V3.11";
const INSEE_TOKEN_URL = "https://api.insee.fr/token";

// Cache du token OAuth2
let tokenCache = {
  /** @type {string | null} */
  accessToken: null,
  /** @type {number | null} */
  expiresAt: null,
};

// Rate limiting : 30 requêtes par minute
const rateLimiter = {
  requests: /** @type {number[]} */ ([]),
  maxRequests: 30,
  windowMs: 60 * 1000, // 1 minute
};

/**
 * Nettoie les requêtes expirées du rate limiter
 */
const cleanExpiredRequests = () => {
  const now = Date.now();
  rateLimiter.requests = rateLimiter.requests.filter(
    (timestamp) => now - timestamp < rateLimiter.windowMs
  );
};

/**
 * Vérifie si on peut faire une nouvelle requête (rate limiting)
 */
const checkRateLimit = () => {
  cleanExpiredRequests();

  if (rateLimiter.requests.length >= rateLimiter.maxRequests) {
    const oldestRequest = rateLimiter.requests[0];
    if (oldestRequest !== undefined) {
      const waitTime = rateLimiter.windowMs - (Date.now() - oldestRequest);
      throw new Error(
        `Rate limit atteint. Réessayez dans ${Math.ceil(
          waitTime / 1000
        )} secondes.`
      );
    }
  }

  rateLimiter.requests.push(Date.now());
  return true;
};

/**
 * Génère un nouveau token OAuth2 auprès de l'API INSEE
 */
const generateAccessToken = async () => {
  try {
    const consumerKey = process.env.INSEE_CONSUMER_KEY;
    const consumerSecret = process.env.INSEE_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      throw new Error(
        "INSEE_CONSUMER_KEY et INSEE_CONSUMER_SECRET doivent être configurés dans .env"
      );
    }

    // Encodage en base64 pour l'authentification OAuth2
    const credentials = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const response = await fetch(INSEE_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Erreur génération token INSEE: ${response.status} - ${errorText}`
      );
      throw new Error("Échec de la génération du token OAuth2 INSEE");
    }

    const data = await response.json();

    if (!data.access_token) {
      throw new Error("Token d'accès non reçu de l'API INSEE");
    }

    // Cache le token avec expiration à 55 minutes (les tokens expirent après 1h)
    const expiresIn = (data.expires_in || 3600) * 1000; // Convertir en millisecondes
    const expiresAt = Date.now() + expiresIn - 5 * 60 * 1000; // 5 minutes de marge
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: expiresAt,
    };

    console.log("Token INSEE généré avec succès");
    return tokenCache.accessToken;
  } catch (error) {
    console.error("Erreur lors de la génération du token INSEE:", error);
    throw error;
  }
};

/**
 * Récupère un token valide (du cache ou en génère un nouveau)
 */
const getValidToken = async () => {
  const now = Date.now();

  // Vérifie si le token en cache est encore valide
  if (
    tokenCache.accessToken &&
    tokenCache.expiresAt &&
    now < tokenCache.expiresAt
  ) {
    return tokenCache.accessToken;
  }

  // Génère un nouveau token
  return await generateAccessToken();
};

/**
 * Normalise un nom d'entreprise pour la comparaison
 */
const normalizeCompanyName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .replace(/[^a-z0-9]/g, "") // Garde uniquement les lettres et chiffres
    .trim();
};

/**
 * Compare deux noms d'entreprise (tolérance aux variations)
 */
const compareCompanyNames = (name1, name2) => {
  const normalized1 = normalizeCompanyName(name1);
  const normalized2 = normalizeCompanyName(name2);

  // Comparaison exacte
  if (normalized1 === normalized2) return true;

  // Vérification si un nom contient l'autre (pour gérer les abréviations)
  if (normalized1.length > 0 && normalized2.length > 0) {
    const longer =
      normalized1.length > normalized2.length ? normalized1 : normalized2;
    const shorter =
      normalized1.length > normalized2.length ? normalized2 : normalized1;

    // Si le nom le plus court fait au moins 5 caractères et est contenu dans le plus long
    if (shorter.length >= 5 && longer.includes(shorter)) {
      return true;
    }
  }

  return false;
};

/**
 * Vérifie le SIRET et le nom d'entreprise via l'API INSEE
 * @param {string} siret - Numéro SIRET (14 chiffres)
 * @param {string} companyName - Nom de l'entreprise
 * @param {Object} [additionalData] - Données supplémentaires pour vérification
 * @param {string} [additionalData.address] - Adresse de l'entreprise
 * @param {string} [additionalData.city] - Ville de l'entreprise
 * @param {string} [additionalData.zipCode] - Code postal de l'entreprise
 */
export const verifySiretAndCompanyName = async (
  siret,
  companyName,
  additionalData
) => {
  if (!additionalData) {
    additionalData = {};
  }
  try {
    // Vérification du format du SIRET
    if (!siret || siret.length !== 14 || !/^\d+$/.test(siret)) {
      return {
        valid: false,
        error: "SIRET invalide (doit contenir 14 chiffres)",
      };
    }

    // Rate limiting
    checkRateLimit();

    // Récupération d'un token valide
    const accessToken = await getValidToken();

    // Requête à l'API INSEE
    const response = await fetch(`${INSEE_API_BASE_URL}/siret/${siret}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          valid: false,
          error: "SIRET introuvable dans la base INSEE",
        };
      }
      if (response.status === 401 || response.status === 403) {
        // Token expiré, réessayer avec un nouveau token
        if (response.status === 401) {
          tokenCache.accessToken = null;
          tokenCache.expiresAt = null;
          const newToken = await getValidToken();

          const retryResponse = await fetch(
            `${INSEE_API_BASE_URL}/siret/${siret}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${newToken}`,
                Accept: "application/json",
              },
            }
          );

          if (!retryResponse.ok) {
            const errorText = await retryResponse.text();
            console.error(
              `Erreur API INSEE après refresh token: ${retryResponse.status} - ${errorText}`
            );
            return {
              valid: false,
              error: "Erreur d'authentification API INSEE",
            };
          }

          // Utiliser les données de la nouvelle requête
          const retryData = await retryResponse.json();
          return processInseeData(
            retryData,
            siret,
            companyName,
            additionalData
          );
        }

        console.error("Erreur d'authentification API INSEE");
        return {
          valid: false,
          error: "Erreur d'authentification API INSEE",
        };
      }
      const errorText = await response.text();
      console.error(`Erreur API INSEE: ${response.status} - ${errorText}`);
      return {
        valid: false,
        error: "Erreur lors de la vérification INSEE",
      };
    }

    const data = await response.json();
    return processInseeData(data, siret, companyName, additionalData);
  } catch (error) {
    if (error.message.includes("Rate limit")) {
      return {
        valid: false,
        error: error.message,
      };
    }
    console.error("Erreur lors de la vérification INSEE:", error);
    return {
      valid: false,
      error: "Erreur technique lors de la vérification",
    };
  }
};

/**
 * Normalise une adresse pour la comparaison
 */
const normalizeAddress = (address) => {
  if (!address) return "";
  return address
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .replace(/[^a-z0-9]/g, "") // Garde uniquement les lettres et chiffres
    .trim();
};

/**
 * Compare deux adresses (tolérance aux variations)
 */
const compareAddresses = (addr1, addr2) => {
  const normalized1 = normalizeAddress(addr1);
  const normalized2 = normalizeAddress(addr2);

  if (normalized1 === normalized2) return true;

  // Si l'une des adresses fait au moins 10 caractères et est contenue dans l'autre
  if (normalized1.length >= 10 && normalized2.length >= 10) {
    const longer =
      normalized1.length > normalized2.length ? normalized1 : normalized2;
    const shorter =
      normalized1.length > normalized2.length ? normalized2 : normalized1;

    // Si le plus court est contenu dans le plus long à 80%
    const similarity = shorter.length / longer.length;
    if (similarity >= 0.8 && longer.includes(shorter)) {
      return true;
    }
  }

  return false;
};

/**
 * Traite les données retournées par l'API INSEE
 */
const processInseeData = (data, siret, companyName, additionalData = {}) => {
  if (!data.etablissement || !data.etablissement.uniteLegale) {
    return {
      valid: false,
      error: "Données INSEE invalides",
    };
  }

  const etablissement = data.etablissement;
  const uniteLegale = etablissement.uniteLegale;

  // Récupération du nom de l'entreprise (nom usuel ou dénomination)
  const inseeCompanyName =
    uniteLegale.denominationUniteLegale ||
    uniteLegale.nomUniteLegale ||
    (uniteLegale.prenom1UniteLegale
      ? `${uniteLegale.prenom1UniteLegale || ""} ${
          uniteLegale.nomUniteLegale || ""
        }`.trim()
      : "");

  if (!inseeCompanyName) {
    return {
      valid: false,
      error: "Nom d'entreprise introuvable dans les données INSEE",
    };
  }

  // Vérification du statut de l'entreprise (doit être active)
  const etatAdministratifUniteLegale = uniteLegale.etatAdministratifUniteLegale;
  if (etatAdministratifUniteLegale !== "A") {
    return {
      valid: false,
      error: "Entreprise inactive ou fermée",
      companyName: inseeCompanyName,
    };
  }

  // Comparaison des noms si un nom d'entreprise est fourni
  let namesMatch = true;
  if (companyName && companyName.trim()) {
    namesMatch = compareCompanyNames(companyName, inseeCompanyName);
  }

  // Construction de l'adresse INSEE
  const inseeAddress = etablissement.adresseEtablissement
    ? `${etablissement.adresseEtablissement.numeroVoieEtablissement || ""} ${
        etablissement.adresseEtablissement.typeVoieEtablissement || ""
      } ${
        etablissement.adresseEtablissement.libelleVoieEtablissement || ""
      }`.trim()
    : null;

  const inseeCity =
    etablissement.adresseEtablissement?.libelleCommuneEtablissement || null;
  const inseeZipCode =
    etablissement.adresseEtablissement?.codePostalEtablissement || null;

  // Vérifications supplémentaires
  const validationErrors = [];
  const validationWarnings = [];

  // 1. Vérification de l'adresse (si fournie)
  let addressMatch = true;
  if (additionalData.address && inseeAddress) {
    addressMatch = compareAddresses(additionalData.address, inseeAddress);
    if (!addressMatch) {
      validationErrors.push(
        "L'adresse ne correspond pas à celle enregistrée dans la base INSEE"
      );
    }
  }

  // 2. Vérification de la ville (doit être exacte)
  let cityMatch = true;
  if (additionalData.city && inseeCity) {
    const normalizedUserCity = normalizeCompanyName(additionalData.city);
    const normalizedInseeCity = normalizeCompanyName(inseeCity);
    cityMatch = normalizedUserCity === normalizedInseeCity;
    if (!cityMatch) {
      validationErrors.push(
        `La ville "${additionalData.city}" ne correspond pas à "${inseeCity}"`
      );
    }
  }

  // 3. Vérification du code postal (doit être exact)
  let zipCodeMatch = true;
  if (additionalData.zipCode && inseeZipCode) {
    zipCodeMatch = additionalData.zipCode.trim() === inseeZipCode.trim();
    if (!zipCodeMatch) {
      validationErrors.push(
        `Le code postal "${additionalData.zipCode}" ne correspond pas à "${inseeZipCode}"`
      );
    }
  }

  // 4. Vérification de la forme juridique (exclure les auto-entrepreneurs/micro-entreprises)
  const formeJuridique = uniteLegale.categorieJuridiqueUniteLegale;
  const codeFormeJuridique = formeJuridique?.toString() || "";

  // Codes des formes juridiques à exclure (auto-entrepreneur, micro-entreprise)
  const excludedForms = ["5499", "5710"]; // Auto-entrepreneur et micro-entreprise individuelle
  let isExcludedForm = false;
  if (codeFormeJuridique && excludedForms.includes(codeFormeJuridique)) {
    isExcludedForm = true;
    validationWarnings.push(
      "Cette forme juridique (auto-entrepreneur/micro-entreprise) n'est pas éligible"
    );
  }

  // 5. Vérification du type d'établissement (préférer le siège social)
  const etablissementSiege = etablissement.etablissementSiege === true;
  if (!etablissementSiege) {
    validationWarnings.push("L'établissement n'est pas le siège social");
  }

  // 6. Vérification de l'ancienneté de l'entreprise (minimum 3 mois)
  const dateCreation = uniteLegale.dateCreationUniteLegale;
  let isRecentCompany = false;
  if (dateCreation) {
    const creationDate = new Date(dateCreation);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    if (creationDate > threeMonthsAgo) {
      isRecentCompany = true;
      validationWarnings.push(
        "L'entreprise a été créée il y a moins de 3 mois"
      );
    }
  }

  // 7. Vérification du code APE/NAF (activité principale)
  const codeApe = uniteLegale.activitePrincipaleUniteLegale;
  const libelleApe = uniteLegale.nomenclatureActivitePrincipaleUniteLegale;

  // Codes NAF autorisés pour le secteur automobile
  const authorizedNafCodes = [
    "4511Z", // Commerce de voitures et de véhicules automobiles légers
    "4519Z", // Commerce d'autres véhicules automobiles
    "4520A", // Entretien et réparation de véhicules automobiles légers
    "4520B", // Entretien et réparation d'autres véhicules automobiles
    "4531Z", // Commerce de gros d'équipements automobiles
    "4532Z", // Commerce de détail d'équipements automobiles
    "4540Z", // Commerce et réparation de motocycles
  ];

  // Normaliser le code APE/NAF (enlever les points, mettre en majuscules)
  const normalizedApeCode = codeApe
    ? codeApe.replace(/\./g, "").toUpperCase().trim()
    : null;

  let isAuthorizedNafCode = false;
  if (normalizedApeCode) {
    isAuthorizedNafCode = authorizedNafCodes.includes(normalizedApeCode);
    if (!isAuthorizedNafCode) {
      validationErrors.push(
        `Le code d'activité (NAF ${normalizedApeCode}) ne correspond pas au secteur automobile`
      );
    }
  } else {
    validationErrors.push(
      "Code d'activité (NAF/APE) introuvable dans les données INSEE"
    );
  }

  // Déterminer si la validation globale est valide
  // La validation échoue si : nom ne correspond pas OU adresse ne correspond pas OU ville/code postal incorrects OU forme exclue OU code NAF non autorisé
  const isValid =
    namesMatch &&
    addressMatch &&
    cityMatch &&
    zipCodeMatch &&
    !isExcludedForm &&
    isAuthorizedNafCode;

  const errorMessage = !isValid
    ? validationErrors.length > 0
      ? validationErrors[0]
      : !namesMatch
      ? "Le nom d'entreprise ne correspond pas au SIRET"
      : "Vérifications échouées"
    : null;

  return {
    valid: isValid,
    error: errorMessage,
    warnings: validationWarnings.length > 0 ? validationWarnings : null,
    companyName: inseeCompanyName,
    siret: siret,
    address: inseeAddress || null,
    city: inseeCity,
    zipCode: inseeZipCode,
    legalForm: codeFormeJuridique,
    legalFormLabel: formeJuridique,
    isHeadOffice: etablissementSiege,
    activityCode: codeApe || null,
    activityLabel: libelleApe || null,
    creationDate: dateCreation || null,
    isRecentCompany: isRecentCompany,
  };
};

/**
 * Fonction simple pour vérifier uniquement le SIRET (sans nom)
 */
export const verifySiret = async (siret) => {
  const result = await verifySiretAndCompanyName(siret, "", {});
  return result.valid;
};
