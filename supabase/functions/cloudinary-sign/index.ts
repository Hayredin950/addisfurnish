// Mints signed upload parameters for Cloudinary.
//
// Listing photos, showcase videos and shop logos are uploaded straight from
// the web/mobile clients to Cloudinary's upload API, which requires a
// signature over the upload params. The API secret must never leave the
// server, so this function is the only place it lives: the client asks for a
// signature, then POSTs the file itself with those params.
//
// Deploy + secrets:
//   supabase secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=...
//                         CLOUDINARY_API_SECRET=...
//   supabase functions deploy cloudinary-sign
//
// Client flow (web + mobile):
//   1. POST /functions/v1/cloudinary-sign { scope: "listing" | "video" | "logo" }
//      with the user's session (JWT) — scope is pinned to the caller's folder.
//   2. POST multipart to https://api.cloudinary.com/v1_1/<cloud>/auto/upload
//      with { file, api_key, timestamp, signature, folder }.
//   3. Store the returned secure_url in the DB. Display code already passes
//      full http(s) URLs through untouched, so nothing else changes.
//
// The signature covers `timestamp` + `folder` (sorted k=v pairs + secret,
// SHA-1 hex) exactly as Cloudinary's SDKs compute it. Pinning the folder to
// the caller's user id means a leaked signature can only ever upload into
// that user's own folder.
//
// Required secrets: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
//                   CLOUDINARY_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME");
const API_KEY = Deno.env.get("CLOUDINARY_API_KEY");
const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

/** Folders are scoped per user so a minted signature can't cross accounts. */
const SCOPE_FOLDER: Record<string, string> = {
  listing: "listings",
  video: "videos",
  logo: "logos",
};

const encoder = new TextEncoder();

async function sha1Hex(input: string): Promise<string> {
  const data = await crypto.subtle.digest("SHA-1", encoder.encode(input));
  return [...new Uint8Array(data)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!CLOUD_NAME || !API_KEY || !API_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return new Response("server misconfigured", { status: 500 });
  }

  // Only signed-in users may mint signatures.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const { data: userData } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const scope = (body?.scope as string | undefined) ?? "listing";
  const folderName = SCOPE_FOLDER[scope];
  if (!folderName) return new Response("bad scope", { status: 400 });

  const folder = `addisfurnish/${userId}/${folderName}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = await sha1Hex(toSign + API_SECRET);

  return Response.json({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    timestamp,
    signature,
    folder,
    upload_url: `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
  });
});
