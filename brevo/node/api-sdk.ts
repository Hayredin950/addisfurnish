/**
 * Brevo Transactional Email API — official SDK path.
 *
 * Works on Node 18+, Deno, Bun, Cloudflare Workers and React Native.
 *
 * Fill in .env first (see ../.env.example), then:
 *   npm install && npx tsx api-sdk.ts
 */
import "dotenv/config";
import {
  BrevoClient,
  BrevoError,
  UnauthorizedError,
  TooManyRequestsError,
} from "@getbrevo/brevo";

const apiKey = process.env.BREVO_API_KEY ?? "";
const sender = process.env.BREVO_SENDER ?? "";

if (!apiKey || !sender) {
  console.error("Set BREVO_API_KEY and BREVO_SENDER in .env first.");
  process.exit(1);
}

const brevo = new BrevoClient({
  apiKey,
  timeoutInSeconds: 30,
  maxRetries: 3, // auto-retries 408/429/5xx with exponential backoff
});

async function sendTransactionalEmail() {
  const result = await brevo.transactionalEmails.sendTransacEmail({
    sender: {
      name: process.env.BREVO_SENDER_NAME ?? "Your App",
      email: sender,
    },
    to: [{ email: "recipient@example.com", name: "Recipient" }],
    subject: "Hello from Brevo 👋",
    htmlContent: "<h1>Hello!</h1><p>Sent via the Brevo Node SDK.</p>",
    textContent: "Hello!\n\nSent via the Brevo Node SDK.", // always send plain-text too (spam hygiene)
  });
  console.log("Email sent:", result);
}

try {
  await sendTransactionalEmail();
} catch (err) {
  if (err instanceof UnauthorizedError) {
    console.error("Invalid API key — regenerate it in SMTP & API → API Keys.");
  } else if (err instanceof TooManyRequestsError) {
    const retryAfter = err.rawResponse.headers["retry-after"];
    console.error(`Rate limited — retry after ${retryAfter}s`);
  } else if (err instanceof BrevoError) {
    console.error(`Brevo API error ${err.statusCode}: ${err.message}`);
  } else {
    console.error("Unexpected error:", err);
  }
  process.exit(1);
}
