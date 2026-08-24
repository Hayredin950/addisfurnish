import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "listing-images";
const DOCS_BUCKET = "verification-docs";

/**
 * Resolves a public-bucket image reference to a CDN URL, synchronously.
 *
 * `getPublicUrl` is pure string manipulation — no network, no auth — so this is
 * safe to call during SSR. Route loaders use it to build absolute `og:image`
 * URLs for social/Telegram link previews, which have to be present in the
 * server-rendered HTML because scrapers never run our JS.
 *
 * Cloudinary uploads store full https URLs, which pass straight through.
 * Returns null for a missing reference so callers can fall back to a default.
 *
 * `width` caps the delivered size. Photos that arrive from the Flutter app or
 * the Telegram bot land in the bucket untouched — 2 to 5 MB each — so a feed of
 * them is slow enough to look broken, and an `og:image` that heavy is dropped
 * by the scrapers it exists for. Cloudinary URLs get a `w_<width>` derivative;
 * bucket paths go through the storage transformation endpoint.
 */
export function resolveImageUrl(
  pathOrUrl: string | null | undefined,
  bucket: string = BUCKET,
  width?: number,
): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return cloudThumb(pathOrUrl, width);
  // Strip a leading bucket prefix so legacy rows that stored
  // `listing-images/<uuid>/photo.jpg` don't double-prefix.
  const path = pathOrUrl.startsWith(`${bucket}/`)
    ? pathOrUrl.substring(bucket.length + 1)
    : pathOrUrl;
  if (width && width > 0) {
    return supabase.storage.from(bucket).getPublicUrl(path, {
      transform: { width, quality: 70, resize: "contain" },
    }).data.publicUrl;
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * A width-capped Cloudinary derivative: the transformation goes between
 * `/image/upload/` and the version segment, and `q_auto,f_auto` let Cloudinary
 * pick the format and compression per device. Anything that isn't a Cloudinary
 * image URL is returned unchanged.
 */
function cloudThumb(url: string, width?: number): string {
  const marker = "/image/upload/";
  const idx = url.indexOf(marker);
  if (!width || width <= 0 || idx === -1 || !url.startsWith("https://res.cloudinary.com/")) {
    return url;
  }
  return `${url.slice(0, idx + marker.length)}w_${width},q_auto,f_auto/${url.slice(
    idx + marker.length,
  )}`;
}

/**
 * Resolves a stored image reference (storage path or absolute URL) to a usable src.
 *
 * `listing-images` is a public bucket, so it resolves to a plain CDN URL — no
 * round trip, no expiry, and cacheable. Signing was also actively harmful
 * there: it makes Postgres evaluate every SELECT policy on storage.objects,
 * including one that calls has_role(), which anon may not execute — so
 * logged-out visitors saw no images at all.
 *
 * Private buckets (verification documents) still need a signed URL.
 */
export function useImageUrl(
  pathOrUrl: string | null | undefined,
  bucket: string = BUCKET,
  width?: number,
) {
  const isPublicBucket = bucket === BUCKET;
  return useQuery({
    queryKey: ["image-url", bucket, pathOrUrl, width ?? 0],
    enabled: !!pathOrUrl,
    // Signed URLs last an hour; re-fetch well before they expire.
    staleTime: isPublicBucket ? Infinity : 1000 * 60 * 30,
    queryFn: async () => {
      const value = pathOrUrl!;
      if (isPublicBucket || value.startsWith("http")) return resolveImageUrl(value, bucket, width)!;
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(value, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/**
 * Asks the cloudinary-sign edge function for a fresh set of signed upload
 * params (folder pinned to the current user) and POSTs the file to Cloudinary.
 * Returns the stored secure_url. The API secret never leaves the server.
 */
async function uploadViaCloudinary(
  file: File,
  scope: "listing" | "video" | "logo",
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("cloudinary-sign", {
    body: { scope },
  });
  if (error || !data?.signature) {
    throw error ?? new Error("cloudinary sign failed");
  }

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", data.api_key);
  form.append("timestamp", data.timestamp);
  form.append("signature", data.signature);
  form.append("folder", data.folder);

  const res = await fetch(data.upload_url, { method: "POST", body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.secure_url) {
    throw new Error(json?.error?.message ?? "cloudinary upload failed");
  }
  return json.secure_url as string;
}

export async function uploadListingImage(userId: string, file: File): Promise<string> {
  return uploadViaCloudinary(file, "listing");
}

/**
 * Short showcase video (≤ ~60s, validated in the sell form). Uploaded to
 * Cloudinary the same way as photos; returns the stored secure URL.
 */
export async function uploadListingVideo(userId: string, file: File): Promise<string> {
  return uploadViaCloudinary(file, "video");
}

/**
 * Shop logos go to Cloudinary too — same signed flow, logo folder. The userId
 * parameter is kept for call-site symmetry with the old storage paths.
 */
export async function uploadShopLogo(userId: string, file: File): Promise<string> {
  return uploadViaCloudinary(file, "logo");
}

/**
 * Best-effort delete of Cloudinary assets (listing images, videos, logos).
 * Supabase storage paths are untouched — callers handle those separately.
 * Never throws: a failed media delete must not fail the surrounding delete.
 */
export async function deleteCloudinaryAssets(urls: string[]) {
  const cloudUrls = (urls ?? []).filter((u) => u?.startsWith("https://res.cloudinary.com/"));
  if (cloudUrls.length === 0) return;
  try {
    await supabase.functions.invoke("cloudinary-delete", { body: { urls: cloudUrls } });
  } catch {
    // best-effort
  }
}

/** Uploads a verification document to the private (owner+admin only) bucket. */
export async function uploadVerificationDocument(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
