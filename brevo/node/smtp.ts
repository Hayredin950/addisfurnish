/**
 * Brevo SMTP relay path (nodemailer).
 *
 * Use this when you need a plain SMTP client — e.g. a Supabase Auth
 * "send email" hook (see supabase/functions/send-mail/index.ts for the
 * full hook implementation) or existing mail infrastructure.
 *
 * Fill in .env first (see ../.env.example), then:
 *   npm install && npx tsx smtp.ts
 */
import "dotenv/config";
import nodemailer from "nodemailer";

const HOST = process.env.BREVO_SMTP_HOST ?? "smtp-relay.brevo.com";
const PORT = Number(process.env.BREVO_SMTP_PORT ?? 465);
const USER = process.env.BREVO_SMTP_USER ?? "";
const PASS = process.env.BREVO_SMTP_KEY ?? "";
const SENDER = process.env.BREVO_SENDER ?? "";
const SENDER_NAME = process.env.BREVO_SENDER_NAME ?? "Your App";

if (!USER || !PASS || !SENDER) {
  console.error(
    "Set BREVO_SMTP_USER, BREVO_SMTP_KEY and BREVO_SENDER in .env first.",
  );
  console.error(
    "BREVO_SMTP_USER is the relay LOGIN (xxxxx@smtp-brevo.com), not your account email.",
  );
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: HOST,
  port: PORT,
  secure: PORT === 465, // 465 = implicit TLS, 587 = STARTTLS
  auth: { user: USER, pass: PASS },
});

// Crude HTML → text fallback (sending multipart text+HTML is a spam-hygiene win).
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

const html = "<h1>Hello!</h1><p>Sent over the Brevo SMTP relay.</p>";

try {
  await transporter.sendMail({
    from: `"${SENDER_NAME}" <${SENDER}>`,
    replyTo: SENDER,
    to: "recipient@example.com",
    subject: "Hello from Brevo 👋 (SMTP)",
    html,
    text: htmlToText(html),
    messageId: `<${Date.now()}.${Math.random().toString(36).slice(2, 10)}@yourdomain.com>`,
  });
  console.log("Email sent over SMTP relay.");
} catch (err) {
  console.error("SMTP send failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
