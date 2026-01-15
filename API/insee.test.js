import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifySiretAndCompanyName } from "./insee.js";

// Mock des variables d'environnement
process.env.INSEE_CONSUMER_KEY = "test_key";
process.env.INSEE_CONSUMER_SECRET = "test_secret";

// Mock de fetch global
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Helper pour créer des données INSEE mock valides
const createMockInseeData = (options = {}) => {
  const {
    denomination = "MON ENTREPRISE",
    etatAdministratif = "A",
    activitePrincipale = "45.11Z",
    categorieJuridique = "5710", // Forme valide (SARL par exemple, pas dans la liste exclue)
    etablissementSiege = true,
  } = options;

  return {
    etablissement: {
      uniteLegale: {
        denominationUniteLegale: denomination,
        etatAdministratifUniteLegale: etatAdministratif,
        activitePrincipaleUniteLegale: activitePrincipale,
        nomenclatureActivitePrincipaleUniteLegale: "NAF",
        categorieJuridiqueUniteLegale: categorieJuridique,
        dateCreationUniteLegale: "2020-01-01",
      },
      etablissementSiege: etablissementSiege,
      adresseEtablissement: {
        numeroVoieEtablissement: "1",
        typeVoieEtablissement: "RUE",
        libelleVoieEtablissement: "TEST",
        libelleCommuneEtablissement: "PARIS",
        codePostalEtablissement: "75001",
      },
    },
  };
};

describe("verifySiretAndCompanyName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Validation du format SIRET", () => {
    it("devrait rejeter un SIRET avec un format invalide (trop court)", async () => {
      const result = await verifySiretAndCompanyName(
        "123456789",
        "Test Company"
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("SIRET invalide (doit contenir 14 chiffres)");
    });

    it("devrait rejeter un SIRET avec des caractères non numériques", async () => {
      const result = await verifySiretAndCompanyName(
        "1234567890123A",
        "Test Company"
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("SIRET invalide (doit contenir 14 chiffres)");
    });

    it("devrait rejeter un SIRET vide", async () => {
      const result = await verifySiretAndCompanyName("", "Test Company");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("SIRET invalide (doit contenir 14 chiffres)");
    });
  });

  describe("SIRET introuvable (404)", () => {
    it("devrait retourner une erreur si le SIRET n'existe pas", async () => {
      // Mock du token
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test_token", expires_in: 3600 }),
      });

      // Mock de la réponse 404 pour le SIRET
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      const result = await verifySiretAndCompanyName(
        "12345678901234",
        "Test Company"
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("SIRET introuvable dans la base INSEE");
    });
  });

  describe("Vérification du nom d'entreprise", () => {
    it("devrait valider si le nom correspond exactement", async () => {
      const siret = "12345678901234";
      const companyName = "MON ENTREPRISE";

      // Mock du token
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test_token", expires_in: 3600 }),
      });

      // Mock de la réponse INSEE avec nom correspondant et forme juridique valide
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockInseeData({
            denomination: "MON ENTREPRISE",
            categorieJuridique: "5498", // Forme non exclue
          }),
      });

      const result = await verifySiretAndCompanyName(siret, companyName);

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.companyName).toBe("MON ENTREPRISE");
    });

    it("devrait valider si le nom correspond avec variations (accents, majuscules)", async () => {
      const siret = "12345678901234";
      const companyName = "Mon Entreprise"; // Nom fourni par l'utilisateur

      // Mock du token
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test_token", expires_in: 3600 }),
      });

      // Mock de la réponse INSEE avec nom en majuscules
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockInseeData({
            denomination: "MON ENTREPRISE",
            categorieJuridique: "5498", // Forme non exclue
          }),
      });

      const result = await verifySiretAndCompanyName(siret, companyName);

      expect(result.valid).toBe(true);
      expect(result.companyName).toBe("MON ENTREPRISE");
    });

    it("devrait rejeter si le nom ne correspond pas", async () => {
      const siret = "12345678901234";
      const companyName = "MAUVAISE ENTREPRISE";

      // Mock du token
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test_token", expires_in: 3600 }),
      });

      // Mock de la réponse INSEE avec nom différent
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockInseeData({
            denomination: "BONNE ENTREPRISE",
            categorieJuridique: "5498", // Forme non exclue
          }),
      });

      const result = await verifySiretAndCompanyName(siret, companyName);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("nom d'entreprise");
    });
  });
});
