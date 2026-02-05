import sharp from "sharp";

/**
 * Convertit une image en WebP
 * @param {Buffer} imageBuffer - Le buffer de l'image originale
 * @param {object} options - Options de conversion
 * @param {number} options.quality - Qualité WebP (0-100, défaut: 85)
 * @param {number} options.maxWidth - Largeur maximale en pixels (défaut: 1920)
 * @param {number} options.maxHeight - Hauteur maximale en pixels (défaut: 1920)
 * @returns {Promise<Buffer>} Le buffer de l'image convertie en WebP
 */
export const convertToWebP = async (
  imageBuffer,
  options = {}
) => {
  const {
    quality = 85,
    maxWidth = 1920,
    maxHeight = 1920,
  } = options;

  try {
    const webpBuffer = await sharp(imageBuffer)
      .resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();

    return webpBuffer;
  } catch (error) {
    console.error("Erreur lors de la conversion en WebP:", error);
    throw new Error(`Erreur lors de la conversion de l'image: ${error.message}`);
  }
};

/**
 * Génère un nom de fichier WebP à partir d'un nom de fichier original
 * @param {string} originalFileName - Le nom de fichier original
 * @returns {string} Le nom de fichier avec l'extension .webp
 */
export const generateWebPFileName = (originalFileName) => {
  // Extraire le nom sans extension
  const nameWithoutExt = originalFileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .toLowerCase();

  // Ajouter l'extension .webp
  return `${nameWithoutExt}.webp`;
};

