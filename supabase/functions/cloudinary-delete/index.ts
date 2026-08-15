// Deletes Cloudinary assets uploaded by the calling user.
//
// Listing photos, videos and shop logos now live on Cloudinary (see
// cloudinary-sign). When a listing or a shop logo is removed, the app must
// delete the real files — Cloudinary storage costs money and the whole point
// of the move was space. The API secret lives only here.
//
// Every asset lives under addisfurnish/<user_id>/…, so the function extracts
// the public id from each secure_url and refuses any asset outside the
// caller's own folder. Admins may delete any user's assets.
//
// Deploy + secrets: same as cloudinary-sign (CLOUDINARY_CLOUD_NAME,
// CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY).
//
// Client flow:
//   POST /functions/v1/cloudinary-delete
//     { "urls": ["https://res.cloudinary.com/…/image/upload/…"] }
//   with the user's JWT. Best-effort: never fails the surrounding delete.

import { createClient } from "npm:@supabase/supabase-js@2";

const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME");
const API_KEY = Deno.env.get("CLOUDINARY_API_KEY");
const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

/** Cloudinary admin API delete for uploaded images/videos. */
async function destroyByPublicIds(publicIds: string[]): Promise<{ ok: boolean; deleted: string[] }> {
  const body = new URLSearchParams();
  for (const id of publicIds) body.append("public_ids[]", id);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image/upload`, {
    method: "DELETE",
    headers: {
      Authorization: "Basic " + btoa(`${API_KEY}:${API_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (res.ok) return { ok: true, deleted: publicIds };
  // Videos live under a different resource type; retry once with video.
  const res2 = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/video/upload`, {
    method: "DELETE",
    headers: {
      Authorization: "Basic " + btoa(`${API_KEY}:${API_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return { ok: res2.ok, deleted: res2.ok ? publicIds : [] };
}

/** Extract the Cloudinary public id (path after /upload/) from a secure_url. */
function publicIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("res.cloudinary.com")) return null;
    // …/image/upload/v1234/folder/file or …/video/upload/v1234/folder/file
    const m = u.pathname.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!CLOUD_NAME || !API_KEY || !API_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return new Response("server misconfigured", { status: 500 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const { data: userData } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return new Response("unauthorized", { status: 401 });

  // Admins can delete anyone's assets; regular users only their own folder.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";

  const body = await req.json().catch(() => null);
  const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];
  if (urls.length === 0) return Response.json({ ok: true, deleted: 0 });

  const folderPrefix = `addisfurnish/${userId}/`;
  const mine: string[] = [];
  for (const url of urls) {
    const publicId = publicIdFromUrl(url);
    if (!publicId) continue; // not a Cloudinary asset — nothing to do
    if (!isAdmin && !publicId.startsWith(folderPrefix)) continue; // not theirs
    mine.push(publicId);
  }
  if (mine.length === 0) return Response.json({ ok: true, deleted: 0 });

  const result = await destroyByPublicIds(mine);
  return Response.json({ ok: result.ok, deleted: result.deleted.length });
});
