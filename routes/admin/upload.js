import { uploadImage } from "../../utils/supabaseStorage.js";
import { verifyToken } from "../../middleware/auth.js";
import { convertToWebP, generateWebPFileName } from "../../utils/imageConverter.js";

export default async function uploadRoutes(fastify, options) {
  // Upload d'image (admin seulement)
  fastify.post(
    "/api/admin/upload/image",
    { preHandler: verifyToken },
    async (request, reply) => {
      try {
        // Vérifier que l'utilisateur est admin
        if (request.user.role !== "admin") {
          return reply.code(403).send({
            success: false,
            message: "Accès réservé aux administrateurs",
          });
        }

        const data = await request.file();

        if (!data) {
          return reply.code(400).send({
            success: false,
            message: "Aucun fichier fourni",
          });
        }

        // Vérifier le type de fichier
        const allowedMimeTypes = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
        ];
        if (!allowedMimeTypes.includes(data.mimetype)) {
          return reply.code(400).send({
            success: false,
            message:
              "Type de fichier non autorisé. Formats acceptés: JPEG, PNG, WebP",
          });
        }

        // Vérifier la taille (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        const originalBuffer = await data.toBuffer();
        if (originalBuffer.length > maxSize) {
          return reply.code(400).send({
            success: false,
            message: "Le fichier est trop volumineux. Taille maximale: 5MB",
          });
        }

        // Convertir l'image en WebP
        const webpBuffer = await convertToWebP(originalBuffer, {
          quality: 85,
          maxWidth: 1920,
          maxHeight: 1920,
        });

        // Générer le nom de fichier WebP
        const webpFileName = generateWebPFileName(data.filename);

        // Upload vers Supabase Storage (directement dans le bucket, sans dossier)
        const imageUrl = await uploadImage(
          webpBuffer,
          webpFileName,
          ""
        );

        reply.type("application/json");
        return reply.send({
          success: true,
          message: "Image uploadée avec succès",
          data: {
            url: imageUrl,
          },
        });
      } catch (error) {
        console.error("Erreur lors de l'upload d'image:", error);
        reply.type("application/json");
        return reply.code(500).send({
          success: false,
          message: "Erreur lors de l'upload de l'image",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    }
  );
}

