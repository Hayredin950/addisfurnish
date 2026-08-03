import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "listing-images";
const DOCS_BUCKET = "verification-docs";

/** Resolves a stored image reference (storage path or absolute URL) to a usable src. */
export function useImageUrl(pathOrUrl: string | null | undefined, bucket: string = BUCKET) {
  return useQuery({
    queryKey: ["image-url", bucket, pathOrUrl],
    enabled: !!pathOrUrl,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const value = pathOrUrl!;
      if (value.startsWith("http")) return value;
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
