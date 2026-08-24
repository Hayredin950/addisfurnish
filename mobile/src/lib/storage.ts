import { supabase } from "./supabase";

const BUCKET = "listing-images";
const DOCS_BUCKET = "verification-docs";

/**
 * Cloudinary images store the original, full-size file, and phones are slow
 * to pull multi-megabyte originals for every card in a grid. Rewrite the URL
 * to ask Cloudinary for a width-capped, auto-compressed derivative instead:
 * `…/image/upload/w_600,q_auto,f_auto/v123/…`. The transformation sits between
 * `upload/` and the version, and `q_auto`/`f_auto` let Cloudinary pick the
 * best format/size per device. Supabase storage paths are capped too, but by
 * the storage transformation endpoint rather than here — see `imageUrl`.
 */
export function cloudThumb(
  pathOrUrl: string | null | undefined,
  width: number,
): string | null {
  if (!pathOrUrl) return null;
  const marker = "/image/upload/";
  const idx = pathOrUrl.indexOf(marker);
  if (idx !== -1 && pathOrUrl.startsWith("https://res.cloudinary.com/")) {
    const base = pathOrUrl.slice(0, idx + marker.length);
    const rest = pathOrUrl.slice(idx + marker.length);
    return `${base}w_${width},q_auto,f_auto/${rest}`;
  }
  return pathOrUrl;
}

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
 *
 * When `width` is given the image is width-capped before it reaches the phone:
 * Cloudinary URLs get a `w_<width>` derivative (see cloudThumb), storage paths
 * go through the storage transformation endpoint. Either way a grid stops
 * downloading full-size originals.
 */
export function imageUrl(
  pathOrUrl: string | null | undefined,
  bucket: string = BUCKET,
  width?: number,
): string | null {
  if (!pathOrUrl) return null;
  // Already a URL of any flavour — http(s), a local camera/gallery file, or a
  // data URI. Only storage *paths* need resolving; treating local URIs as
  // paths would build "…/object/public/<bucket>/file:///…" garbage.
  if (
    pathOrUrl.startsWith("http") ||
    pathOrUrl.startsWith("file:") ||
    pathOrUrl.startsWith("content:") ||
    pathOrUrl.startsWith("data:")
  ) {
    return width && width > 0 ? cloudThumb(pathOrUrl, width) ?? pathOrUrl : pathOrUrl;
  }
  // Strip a leading bucket prefix so legacy rows that stored
  // `listing-images/<uuid>/photo.jpg` don't double-prefix.
  const path = pathOrUrl.startsWith(`${bucket}/`)
    ? pathOrUrl.substring(bucket.length + 1)
    : pathOrUrl;
  // Ask storage to resize, exactly as Cloudinary URLs are width-capped above.
  // Photos uploaded from the Flutter app and by the Telegram bot go straight
  // into the bucket at full size — 2 to 5 MB each — and a grid of those either
  // takes an age to paint or never paints at all on a phone. The transformation
  // endpoint returns the same picture at 30-50 KB.
  if (width && width > 0) {
    return supabase.storage.from(bucket).getPublicUrl(path, {
      transform: { width, quality: 70, resize: "contain" },
    }).data.publicUrl;
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** `source` prop for <Image>, or undefined so the caller can render a placeholder. */
export function imageSource(
  pathOrUrl: string | null | undefined,
  bucket: string = BUCKET,
  width?: number,
): { uri: string } | undefined {
  const uri = imageUrl(pathOrUrl, bucket, width);
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
