import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  icon: string | null;
  sort_order: number;
};

export type SellerSummary = {
  id: string;
  full_name: string;
  shop_name: string | null;
  shop_slug: string | null;
  shop_logo_url: string | null;
  verified: boolean;
  city: string | null;
  phone: string | null;
  last_seen: string;
};

export type Listing = {
  id: string;
  seller_id: string;
  category_id: string | null;
  title: string;
  description: string;
  price: number;
  original_price: number | null;
  negotiable: boolean;
  condition: string;
  material: string | null;
  color: string | null;
  room_type: string | null;
  brand: string | null;
  city: string;
  sub_city: string | null;
  status: string;
  view_count: number;
  created_at: string;
  listing_images: { id: string; url: string; position: number }[];
  profiles?: SellerSummary | null;
  categories?: { name: string; slug: string } | null;
};

const LISTING_SELECT =
  "*, listing_images(id,url,position), profiles!listings_seller_id_fkey(id,full_name,shop_name,shop_slug,shop_logo_url,verified,city,phone,last_seen), categories(name,slug)";

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  staleTime: 1000 * 60 * 10,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as Category[];
  },
});

export type ListingFilters = {
  q?: string;
  category?: string;
  condition?: string;
  material?: string;
  room?: string;
  city?: string;
  min?: number;
  max?: number;
  discounted?: boolean;
  sort?: string;
  sellerId?: string;
  limit?: number;
};

export function listingsQuery(filters: ListingFilters = {}) {
  return queryOptions({
    queryKey: ["listings", filters],
    queryFn: async () => {
      let query = supabase
        .from("listings")
        .select(LISTING_SELECT)
        .neq("status", "draft");

      if (filters.q) query = query.or(`title.ilike.%${filters.q}%,description.ilike.%${filters.q}%`);
      if (filters.condition) query = query.eq("condition", filters.condition);
      if (filters.material) query = query.eq("material", filters.material);
      if (filters.room) query = query.eq("room_type", filters.room);
      if (filters.city) query = query.eq("city", filters.city);
      if (filters.sellerId) query = query.eq("seller_id", filters.sellerId);
      if (typeof filters.min === "number" && filters.min > 0) query = query.gte("price", filters.min);
      if (typeof filters.max === "number" && filters.max > 0) query = query.lte("price", filters.max);
      if (filters.discounted) query = query.not("original_price", "is", null);
      if (filters.category) {
        const { data: cat } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", filters.category)
          .maybeSingle();
        if (cat) {
          const { data: children } = await supabase
            .from("categories")
            .select("id")
            .eq("parent_id", cat.id);
          const ids = [cat.id, ...(children ?? []).map((c) => c.id)];
          query = query.in("category_id", ids);
        }
      }

      switch (filters.sort) {
        case "price-asc":
          query = query.order("price", { ascending: true });
          break;
        case "price-desc":
          query = query.order("price", { ascending: false });
          break;
        case "viewed":
          query = query.order("view_count", { ascending: false });
          break;
        default:
          query = query.order("created_at", { ascending: false });
      }

      query = query.limit(filters.limit ?? 48);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Listing[];
    },
  });
}

export function listingQuery(id: string) {
  return queryOptions({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(LISTING_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Listing | null;
    },
  });
}

export function shopQuery(slug: string) {
  return queryOptions({
    queryKey: ["shop", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("shop_slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function priceHistoryQuery(listingId: string) {
  return queryOptions({
    queryKey: ["price-history", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_history")
        .select("price,changed_at")
        .eq("listing_id", listingId)
        .order("changed_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function reviewsQuery(sellerId: string) {
  return queryOptions({
    queryKey: ["reviews", sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id,rating,comment,created_at,author_id")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
