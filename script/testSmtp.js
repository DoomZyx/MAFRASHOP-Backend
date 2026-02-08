import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env.NODE_ENV || "development";

let envFile = ".env";
if (env === "preprod") envFile = ".env.preprod";
else if (env === "production") envFile = ".env.prod";

dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

async function testSmtp() {
  try {
    console.log("=== Test de configuration SMTP ===\n");

    // Vérifier les variables d'environnement
    const requiredVars = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      console.error("❌ Variables d'environnement manquantes:");
      missingVars.forEach((varName) => {
        console.error(`   - ${varName}`);
      });
      console.error("\n💡 Ajoutez ces variables dans votre fichier .env");
      process.exit(1);
    }

    console.log("✅ Variables d'environnement présentes:");
    console.log(`   - SMTP_HOST: ${process.env.SMTP_HOST}`);
    console.log(`   - SMTP_PORT: ${process.env.SMTP_PORT || "587"}`);
    console.log(`   - SMTP_USER: ${process.env.SMTP_USER}`);
    console.log(`   - SMTP_SECURE: ${process.env.SMTP_SECURE || "false"}`);
    console.log(`   - SMTP_PASS: ${process.env.SMTP_PASS ? "***" : "MANQUANT"}`);
    console.log(`   - CONTACT_EMAIL: ${process.env.CONTACT_EMAIL || process.env.SMTP_USER || "Non défini"}`);

    // Créer le transporteur
    console.log("\n🔄 Création du transporteur SMTP...");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Tester la connexion
    console.log("🔄 Test de connexion au serveur SMTP...");
    await transporter.verify();
    console.log("✅ Connexion SMTP réussie !");

    // Envoyer un email de test
    const testEmail = process.env.CONTACT_EMAIL || process.env.SMTP_USER;
    console.log(`\n🔄 Envoi d'un email de test à ${testEmail}...`);

    const mailOptions = {
      from: `"MAFRASHOP Test" <${process.env.SMTP_USER}>`,
      to: testEmail,
      subject: "Test SMTP - MAFRASHOP",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d32f2f;">Test de configuration SMTP</h2>
          <p>Cet email confirme que votre configuration SMTP est opérationnelle.</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Si vous recevez cet email, tout fonctionne correctement ! ✅
          </p>
        </div>
      `,
      text: "Test de configuration SMTP - Cet email confirme que votre configuration SMTP est opérationnelle.",
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email de test envoyé avec succès !");
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Réponse: ${info.response}`);

    console.log("\n✅ Configuration SMTP opérationnelle !");
    console.log("\n📧 Les emails suivants fonctionneront :");
    console.log("   - Formulaire de contact (SAV)");
    console.log("   - Tous les emails configurés dans l'application");

  } catch (error) {
    console.error("\n❌ Erreur lors du test SMTP:");
    console.error(`   ${error.message}`);

    if (error.code === "EAUTH") {
      console.error("\n💡 Vérifiez vos identifiants SMTP (SMTP_USER et SMTP_PASS)");
    } else if (error.code === "ECONNECTION") {
      console.error("\n💡 Vérifiez votre configuration SMTP (SMTP_HOST et SMTP_PORT)");
    } else if (error.code === "ETIMEDOUT") {
      console.error("\n💡 Le serveur SMTP ne répond pas. Vérifiez SMTP_HOST et SMTP_PORT");
    }

    process.exit(1);
  } finally {
    process.exit(0);
  }
}

testSmtp();

