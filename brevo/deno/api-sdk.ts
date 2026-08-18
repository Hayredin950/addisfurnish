/**
 * Brevo Transactional Email API — Deno / Supabase edge function path.
 *
 * Same official SDK, imported with the npm: specifier. Reads credentials
 * from Deno.env (set them with `supabase secrets set` or in the dashboard:
 * Project Settings → Edge Functions → Secrets).
 *
 *   supabase secrets set BREVO_API_KEY=xkeysib-... BREVO_SENDER=you@yourdomain.com
 */
import { BrevoClient } from "npm:@getbrevo/brevo@^6";

const brevo = new BrevoClient({
  apiKey: Deno.env.get("BREVO_API_KEY") ?? "",
  timeoutInSeconds: 30,
  maxRetries: 3,
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { message: "method not allowed" });

  let body: { to?: string; subject?: string; html?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { message: "invalid JSON" });
  }

  const to = body.to ?? "";
  if (!to) return json(400, { message: "missing recipient" });

  try {
    const result = await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        name: Deno.env.get("BREVO_SENDER_NAME") ?? "Your App",
        email: Deno.env.get("BREVO_SENDER") ?? "",
      },
      to: [{ email: to }],
      subject: body.subject ?? "Hello from Brevo 👋",
      htmlContent:
        body.html ?? "<h1>Hello!</h1><p>Sent from a Deno edge function.</p>",
      textContent: "Hello!\n\nSent from a Deno edge function.",
    });
    console.log(JSON.stringify({ event: "brevo-send-ok", to }));
    return json(200, { message: "success", data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`brevo-send-error: ${msg}`);
    return json(502, { message: "error", error: msg });
  }
});
