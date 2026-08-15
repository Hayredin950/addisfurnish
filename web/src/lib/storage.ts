import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "listing-images";
const DOCS_BUCKET = "verification-docs";

/**
 * Resolves a stored image reference (storage path or absolute URL) to a usable src.
 *
 * `listing-images` is a public bucket, so it resolves to a plain CDN URL — no
 * round trip, no expiry, and cacheable. Signing was also actively harmful
 * there: it makes Postgres evaluate every SELECT policy on storage.objects,
 * including one that calls has_role(), which anon may not execute — so
 * logged-out visitors saw no images at all.
 *
 * Cloudinary uploads store full https URLs, which pass straight through.
 *
 * Private buckets (verification documents) still need a signed URL.
 */
export function useImageUrl(pathOrUrl: string | null | undefined, bucket: string = BUCKET) {
  const isPublicBucket = bucket === BUCKET;
  return useQuery({
    queryKey: ["image-url", bucket, pathOrUrl],
    enabled: !!pathOrUrl,
    // Signed URLs last an hour; re-fetch well before they expire.
    staleTime: isPublicBucket ? Infinity : 1000 * 60 * 30,
    queryFn: async () => {
      const value = pathOrUrl!;
      if (value.startsWith("http")) return value;
      if (isPublicBucket) {
        return supabase.storage.from(bucket).getPublicUrl(value).data.publicUrl;
      }
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
