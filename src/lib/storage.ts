import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "listing-images";

/** Resolves a stored image reference (storage path or absolute URL) to a usable src. */
export function useImageUrl(pathOrUrl: string | null | undefined) {
  return useQuery({
    queryKey: ["image-url", pathOrUrl],
    enabled: !!pathOrUrl,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const value = pathOrUrl!;
      if (value.startsWith("http")) return value;
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(value, 60 * 60);
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
