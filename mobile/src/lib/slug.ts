import { supabase } from "./supabase";

/** Turn a shop name into a URL-safe slug (lowercase, hyphens). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** Pick a shop_slug that is not already taken, appending -2, -3… as needed. */
export async function uniqueShopSlug(base: string): Promise<string> {
  const candidate = slugify(base) || `shop-${Date.now().toString(36)}`;
  for (let i = 1; ; i++) {
    const slug = i === 1 ? candidate : `${candidate}-${i}`;
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("shop_slug", slug)
      .maybeSingle();
    if (!data) return slug;
  }
}
