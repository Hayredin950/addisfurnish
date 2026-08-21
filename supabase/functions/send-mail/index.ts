import nodemailer from "npm:nodemailer@6.9.16";

/**
 * Supabase Auth "send email" hook.
 *
 * GoTrue's own SMTP path (gomail.v2 → Brevo) accepts messages but they never
 * reach Gmail inboxes, while the same message sent with other SMTP clients
 * does. This hook takes over email delivery so we control the sending client.
 *
 * Handles both payload shapes GoTrue has used:
 *   { user, email: { to, subject, content }, token, mailer_type, data }
 *   { metadata, user, email_data: { token, email_action_type, ... } }
 *
 * Returning { message: "success" } tells GoTrue the mail was handled.
 *
 * Deliverability notes (why these messages can still land in spam):
 * - The sender address comes from BREVO_SENDER and, until AddisHome owns a
 *   real domain, it is a gmail.com address relayed through Brevo. Gmail only
 *   trusts gmail.com mail sent from Google's own servers, so SPF/DKIM/DMARC
 *   fail and Gmail may route these to spam. The durable fix is a domain you
 *   control (e.g. noreply@addisfurnish.com) authenticated in Brevo — then
 *   SPF/DKIM pass and delivery is reliable.
 * - What we CAN control here: multipart text+HTML (HTML-only is a spam
 *   signal), a clean Message-ID, and a Reply-To so replies go to the sender.
 */

const HOST = Deno.env.get("BREVO_SMTP_HOST") ?? "smtp-relay.brevo.com";
const PORT = Number(Deno.env.get("BREVO_SMTP_PORT") ?? 465);
const USER = Deno.env.get("BREVO_SMTP_USER") ?? "";
const PASS = Deno.env.get("BREVO_SMTP_KEY") ?? "";
const SENDER = Deno.env.get("BREVO_SENDER") ?? "sadim9812@gmail.com";
const SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") ?? "AddisHome";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Crude but safe HTML → text: drop tags, decode entities, collapse blanks. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderCodeEmail(mailerType: string, token: string): string {
  const isRecovery = mailerType === "recovery";
  const title = isRecovery ? "Password Reset" : "Verify Your Email";
  const purpose = isRecovery
    ? "to reset your password"
    : "to verify your email address";
  return (
    `<h2>${title}</h2>` +
    `<p>Use the verification code below ${purpose}:</p>` +
    `<h1 style="letter-spacing: 8px; font-size: 36px;">${token}</h1>` +
    `<p>This code expires in 15 minutes.</p>` +
    `<p style="color:#666;font-size:12px;">AddisHome — Ethiopia's marketplace for quality second-hand furniture.</p>`
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { message: "method not allowed" });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { message: "invalid JSON" });
  }

  const user = (payload.user ?? {}) as { email?: string };
  const email = (payload.email ?? {}) as Record<string, unknown>;
  const emailData = (payload.email_data ?? {}) as Record<string, unknown>;

  const mailerType = String(
    payload.mailer_type ?? emailData.email_action_type ?? email.action_type ?? "unknown",
  );
  const token = String(payload.token ?? emailData.token ?? email.token ?? "");
  const to = String(email.to ?? email.recipient ?? user.email ?? "");
  const subject = String(
    email.subject ??
      (mailerType === "recovery"
        ? "Reset Your Password"
        : "Verify your email for AddisHome"),
  );
  const content = String(email.content ?? email.body ?? emailData.content ?? "");
  const html = content || renderCodeEmail(mailerType, token);

  console.log(
    JSON.stringify({
      event: "send-mail-hook",
      mailerType,
      to,
      subject,
      token: token ? `${token.slice(0, 3)}…${token.slice(-3)}` : "",
      renderedHere: !content,
    }),
  );

  if (!to) return json(400, { message: "missing recipient" });
  if (!html) return json(400, { message: "missing content" });
  if (!USER || !PASS) {
    console.error("send-mail-error: missing SMTP credentials");
    return json(500, { message: "missing SMTP credentials" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,
      auth: { user: USER, pass: PASS },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER}>`,
      replyTo: SENDER,
      to,
      subject,
      html,
      text: htmlToText(html),
      messageId: `<${Date.now()}.${Math.random().toString(36).slice(2, 10)}@addisfurnish.vercel.app>`,
    });

    console.log(JSON.stringify({ event: "send-mail-ok", mailerType, to, subject }));
    return json(200, { message: "success" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`send-mail-error: ${msg}`);
    return json(500, { message: "error", error: msg });
  }
});
