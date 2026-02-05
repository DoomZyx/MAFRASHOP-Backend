import { createClient } from "@supabase/supabase-js";

let supabaseStorageClient = null;

/**
 * Initialise le client Supabase Storage
 */
const getSupabaseStorageClient = () => {
  if (!supabaseStorageClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(
        "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être configurés pour l'upload d'images"
      );
    }

    supabaseStorageClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseStorageClient;
};

/**
 * Upload une image vers Supabase Storage
 * @param {Buffer} fileBuffer - Le buffer du fichier
 * @param {string} fileName - Le nom du fichier
 * @param {string} folder - Le dossier de destination (par défaut: 'products')
 * @returns {Promise<string>} L'URL publique de l'image
 */
export const uploadImage = async (fileBuffer, fileName, folder = "") => {
  try {
    const supabase = getSupabaseStorageClient();

    // Générer un nom de fichier unique avec timestamp
    const timestamp = Date.now();
    const sanitizedFileName = fileName
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .toLowerCase();
    const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
    // Si folder est vide, uploader directement dans le bucket
    const filePath = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

    // Déterminer le type MIME depuis le nom de fichier
    // Toutes les images sont maintenant en WebP
    const getContentType = (fileName) => {
      const ext = fileName.toLowerCase().split(".").pop();
      if (ext === "webp") {
        return "image/webp";
      }
      // Par défaut, on retourne webp car toutes les images sont converties
      return "image/webp";
    };

    // Upload du fichier
    const { data, error } = await supabase.storage
      .from("product-images")
      .upload(filePath, fileBuffer, {
        contentType: getContentType(fileName),
        upsert: false,
      });

    if (error) {
      throw new Error(`Erreur lors de l'upload: ${error.message}`);
    }

    // Récupérer l'URL publique
    const {
      data: { publicUrl },
    } = supabase.storage.from("product-images").getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error("Erreur upload image Supabase:", error);
    throw error;
  }
};

/**
 * Supprime une image de Supabase Storage
 * @param {string} imageUrl - L'URL de l'image à supprimer
 * @returns {Promise<boolean>}
 */
export const deleteImage = async (imageUrl) => {
  try {
    if (!imageUrl || !imageUrl.includes("product-images")) {
      return false;
    }

    const supabase = getSupabaseStorageClient();

    // Extraire le chemin du fichier depuis l'URL
    const urlParts = imageUrl.split("/product-images/");
    if (urlParts.length < 2) {
      return false;
    }

    const filePath = urlParts[1].split("?")[0];

    const { error } = await supabase.storage
      .from("product-images")
      .remove([filePath]);

    if (error) {
      console.error("Erreur suppression image:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Erreur suppression image Supabase:", error);
    return false;
  }
};

export default getSupabaseStorageClient;

