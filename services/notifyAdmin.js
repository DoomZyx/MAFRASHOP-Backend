import nodemailer from "nodemailer";
import "../loadEnv.js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.NOTIFICATIONS_EMAIL;

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Envoie un email au propriétaire pour une nouvelle commande.
 * Ne bloque pas le flux en cas d'erreur (log uniquement).
 */
export async function sendNewOrder(orderId, userName) {
  if (!ADMIN_EMAIL) return;
  const transporter = getTransporter();
  if (!transporter) return;

  const subject = `Nouvelle commande #${orderId} créée`;
  const text = `Une nouvelle commande vient d'être passée par ${userName || "un utilisateur"}. Connectez-vous au back-office pour gérer la commande.`;

  try {
    await transporter.sendMail({
      from: `"MAFRASHOP" <${process.env.SMTP_USER}>`,
      to: ADMIN_EMAIL,
      subject,
      text,
    });
  } catch (err) {
    console.error("[notifyAdmin] Erreur envoi email nouvelle commande:", err.message);
  }
}

/**
 * Envoie un email au propriétaire pour une demande de compte pro.
 * Ne bloque pas le flux en cas d'erreur (log uniquement).
 */
export async function sendProRequest(userEmail) {
  if (!ADMIN_EMAIL) return;
  const transporter = getTransporter();
  if (!transporter) return;

  const subject = "Demande de passage compte pro";
  const text = `L'utilisateur ${userEmail} a demandé un compte pro. Vérifiez et validez dans le back-office.`;

  try {
    await transporter.sendMail({
      from: `"MAFRASHOP" <${process.env.SMTP_USER}>`,
      to: ADMIN_EMAIL,
      subject,
      text,
    });
  } catch (err) {
    console.error("[notifyAdmin] Erreur envoi email demande compte pro:", err.message);
  }
}
