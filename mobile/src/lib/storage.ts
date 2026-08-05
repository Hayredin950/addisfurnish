import { supabase } from "./supabase";

const BUCKET = "listing-images";
const DOCS_BUCKET = "verification-docs";

/**
 * Resolves a stored image reference to something <Image source={{ uri }}> can load.
 *
 * The database stores storage *paths* (`<uuid>/photo.jpg`), not URLs. React Native
 * fails silently on a non-URL uri — no error, no broken-image icon, just an empty
 * box — which is why every listing photo, avatar and shop logo rendered blank
 * before this existed.
 *
 * `listing-images` is a public bucket, so this is a pure string build: no network
 * call, no expiry, and the CDN can cache it. Signing would also actively break
 * signed-out browsing — it makes Postgres evaluate every SELECT policy on
 * storage.objects, including one that calls has_role(), which anon may not
 * execute. Web hit exactly that (see web/src/lib/storage.ts) and guests saw no
 * images at all.
 */
export function imageUrl(
  pathOrUrl: string | null | undefined,
  bucket: string = BUCKET,
): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return supabase.storage.from(bucket).getPublicUrl(pathOrUrl).data.publicUrl;
}

/** `source` prop for <Image>, or undefined so the caller can render a placeholder. */
export function imageSource(
  pathOrUrl: string | null | undefined,
  bucket: string = BUCKET,
): { uri: string } | undefined {
  const uri = imageUrl(pathOrUrl, bucket);
  return uri ? { uri } : undefined;
}

/**
 * Verification documents live in a private bucket, so they need a signed URL.
 * Valid for an hour.
 */
export async function signedDocumentUrl(path: string): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data, error } = await supabase.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
