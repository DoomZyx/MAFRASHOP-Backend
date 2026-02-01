/**
 * Module de vérification des numéros de TVA intracommunautaire via VIES
 * (VAT Information Exchange System - Commission Européenne)
 * 
 * API: https://ec.europa.eu/taxation_customs/vies/
 * 
 * Règles de gestion :
 * - Timeout 15 secondes
 * - En cas d'erreur technique → pending_manual (validation back-office)
 * - En cas de numéro invalide → rejected
 * - En cas de numéro valide → validated
 */

import https from "https";

const VIES_API_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/ms";
const REQUEST_TIMEOUT = 15000; // 15 secondes

/**
 * Vérifie un numéro de TVA intracommunautaire via VIES
 * 
 * @param {string} countryCode - Code pays ISO (ex: "FR", "BE", "DE")
 * @param {string} vatNumber - Numéro TVA sans le préfixe pays (ex: "12345678901")
 * @returns {Promise<{valid: boolean, companyName?: string, companyAddress?: string, technicalError?: string, businessError?: string}>}
 */
export async function verifyVatNumber(countryCode, vatNumber) {
  if (!countryCode || !vatNumber) {
    return {
      valid: false,
      businessError: "missing_data",
    };
  }

  // Nettoyer le numéro TVA (enlever espaces, tirets, points)
  const cleanVatNumber = vatNumber.replace(/[\s\-\.]/g, "").toUpperCase();
  const cleanCountryCode = countryCode.toUpperCase();

  // Vérifier que le code pays est valide (2 lettres)
  if (!/^[A-Z]{2}$/.test(cleanCountryCode)) {
    return {
      valid: false,
      businessError: "invalid_country_code",
    };
  }

  // Construire l'URL de l'API VIES
  const apiUrl = `${VIES_API_URL}/${cleanCountryCode}/vat/${cleanVatNumber}`;

  return new Promise((resolve) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const options = {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "MAFRASHOP-VAT-Checker/1.0",
      },
    };

    https
      .get(apiUrl, options, (res) => {
        clearTimeout(timeoutId);

        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            // VIES renvoie 200 même si le numéro est invalide
            if (res.statusCode === 200) {
              const response = JSON.parse(data);

              // Structure de réponse VIES :
              // {
              //   "isValid": true/false,
              //   "requestDate": "2026-01-31",
              //   "userError": "...",
              //   "name": "...",
              //   "address": "..."
              // }

              if (response.isValid === true) {
                resolve({
                  valid: true,
                  companyName: response.name || null,
                  companyAddress: response.address || null,
                });
              } else if (response.isValid === false) {
                resolve({
                  valid: false,
                  businessError: "invalid_vat_number",
                });
              } else {
                // Réponse inattendue
                resolve({
                  valid: false,
                  technicalError: "unexpected_response",
                });
              }
            } else if (res.statusCode === 400) {
              // Erreur de format
              resolve({
                valid: false,
                businessError: "invalid_format",
              });
            } else if (res.statusCode === 404) {
              // Pays non supporté ou numéro invalide
              resolve({
                valid: false,
                businessError: "not_found",
              });
            } else if (res.statusCode >= 500) {
              // Erreur serveur VIES
              resolve({
                valid: false,
                technicalError: "vies_server_error",
              });
            } else {
              // Autre erreur HTTP
              resolve({
                valid: false,
                technicalError: `http_error_${res.statusCode}`,
              });
            }
          } catch (parseError) {
            resolve({
              valid: false,
              technicalError: "parse_error",
            });
          }
        });
      })
      .on("error", (error) => {
        clearTimeout(timeoutId);

        if (error.name === "AbortError") {
          resolve({
            valid: false,
            technicalError: "vies_timeout",
          });
        } else {
          resolve({
            valid: false,
            technicalError: "network_error",
          });
        }
      });
  });
}

/**
 * Valide le format d'un numéro de TVA intracommunautaire (basique)
 * Ne remplace PAS la vérification VIES, juste une pré-validation
 * 
 * @param {string} countryCode - Code pays ISO
 * @param {string} vatNumber - Numéro TVA
 * @returns {boolean}
 */
export function isValidVatFormat(countryCode, vatNumber) {
  if (!countryCode || !vatNumber) return false;

  const cleanVat = vatNumber.replace(/[\s\-\.]/g, "").toUpperCase();
  const country = countryCode.toUpperCase();

  // Formats basiques par pays (non exhaustif)
  const formats = {
    FR: /^[A-Z]{2}\d{9}$/, // FR + 9 chiffres
    BE: /^(0|1)\d{9}$/, // 0 ou 1 + 9 chiffres
    DE: /^\d{9}$/, // 9 chiffres
    IT: /^\d{11}$/, // 11 chiffres
    ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, // Lettre/chiffre + 7 chiffres + lettre/chiffre
    NL: /^\d{9}B\d{2}$/, // 9 chiffres + B + 2 chiffres
    PT: /^\d{9}$/, // 9 chiffres
    LU: /^\d{8}$/, // 8 chiffres
    IE: /^(\d{7}[A-Z]{1,2}|\d[A-Z]\d{5}[A-Z])$/, // Formats irlandais
    AT: /^U\d{8}$/, // U + 8 chiffres
    SE: /^\d{12}$/, // 12 chiffres
    DK: /^\d{8}$/, // 8 chiffres
    FI: /^\d{8}$/, // 8 chiffres
    PL: /^\d{10}$/, // 10 chiffres
    CZ: /^\d{8,10}$/, // 8 à 10 chiffres
    RO: /^\d{2,10}$/, // 2 à 10 chiffres
    BG: /^\d{9,10}$/, // 9 ou 10 chiffres
    HR: /^\d{11}$/, // 11 chiffres
    CY: /^\d{8}[A-Z]$/, // 8 chiffres + lettre
    EE: /^\d{9}$/, // 9 chiffres
    GR: /^\d{9}$/, // 9 chiffres
    HU: /^\d{8}$/, // 8 chiffres
    LT: /^(\d{9}|\d{12})$/, // 9 ou 12 chiffres
    LV: /^\d{11}$/, // 11 chiffres
    MT: /^\d{8}$/, // 8 chiffres
    SK: /^\d{10}$/, // 10 chiffres
    SI: /^\d{8}$/, // 8 chiffres
  };

  const format = formats[country];
  if (!format) return false;

  return format.test(cleanVat);
}

export default {
  verifyVatNumber,
  isValidVatFormat,
};
