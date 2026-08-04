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

export async function uploadListingImage(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/**
 * Uploads a shop logo. The path must start with the uploader's id — the bucket's
 * INSERT policy checks `(storage.foldername(name))[1] = auth.uid()`, so a
 * top-level `logos/` prefix is rejected.
 */
export async function uploadShopLogo(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/logos/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
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
