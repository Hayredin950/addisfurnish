import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  name: string;
  name_am: string | null;
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
  /** Personal picture; used when the seller has no shop logo. */
  avatar_url: string | null;
  verified: boolean;
  city: string | null;
  phone: string | null;
  last_seen: string;
  is_online: boolean;
  whatsapp: string | null;
  telegram: string | null;
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
  featured: boolean;
  delivery_offered: boolean;
  delivery_fee: number | null;
  discount_expires_at: string | null;
  latitude: number | null;
  longitude: number | null;
  video_url: string | null;
  listing_images: { id: string; url: string; position: number }[];
  profiles?: SellerSummary | null;
  categories?: { name: string; slug: string; name_am: string | null } | null;
};

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author_id: string;
  profiles?: { full_name: string; avatar_url?: string | null } | null;
};

export type NotificationRow = {
  id: string;
  type: string;
  payload: {
    title?: string;
    listingId?: string;
    offerId?: string;
    conversationId?: string;
    query?: string | null;
    status?: string;
    oldPrice?: number;
    newPrice?: number;
    rating?: number;
    shopSlug?: string;
    phone?: string;
    buyerName?: string;
    amount?: number;
  } | null;
  is_read: boolean;
  created_at: string;
};

export type SavedSearch = {
  id: string;
  query: string | null;
  filters: { category?: string; min?: number; max?: number };
  created_at: string;
};

export type BuyerPreferences = {
  category_ids: string[];
  price_min: number | null;
  price_max: number | null;
  preferred_cities: string[];
  telegram_alerts_enabled: boolean;
};

const LISTING_SELECT =
  "*, listing_images(id,url,position), profiles!listings_seller_id_fkey(id,full_name,shop_name,shop_slug,shop_logo_url,avatar_url,verified,city,phone,last_seen,is_online,whatsapp,telegram), categories(name,slug,name_am)";

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  staleTime: 1000 * 60 * 10,
  queryFn: async () => {
    const { data, error } = await supabase.from("categories").select("*").order("sort_order");
    if (error) throw error;
    return (data ?? []) as Category[];
  },
});

/**
 * Active-listing count per category, including each category's direct children
 * (mirrors how browse.tsx filters a root category). Backed by the
 * `category_listing_counts` view.
 */
export const categoryCountsQuery = queryOptions({
  queryKey: ["category-counts"],
  staleTime: 1000 * 60 * 5,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("category_listing_counts")
      .select("category_id,listing_count");
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      // View columns are nullable in the generated types; skip incomplete rows.
      if (row.category_id) counts[row.category_id] = Number(row.listing_count ?? 0);
    }
    return counts;
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
  featured?: boolean;
  sort?: string;
  sellerId?: string;
  limit?: number;
};

export function listingsQuery(filters: ListingFilters = {}) {
  return queryOptions({
    queryKey: ["listings", filters],
    queryFn: async () => {
      let query = supabase.from("listings").select(LISTING_SELECT).neq("status", "draft");

      if (filters.q)
        query = query.or(`title.ilike.%${filters.q}%,description.ilike.%${filters.q}%`);
      if (filters.condition) query = query.eq("condition", filters.condition);
      if (filters.material) query = query.eq("material", filters.material);
      if (filters.room) query = query.eq("room_type", filters.room);
      if (filters.city) query = query.eq("city", filters.city);
      if (filters.sellerId) query = query.eq("seller_id", filters.sellerId);
      if (typeof filters.min === "number" && filters.min > 0)
        query = query.gte("price", filters.min);
      if (typeof filters.max === "number" && filters.max > 0)
        query = query.lte("price", filters.max);
      if (filters.discounted) query = query.not("original_price", "is", null);
      if (filters.featured) query = query.eq("featured", true);
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
        // `reviews` has two FKs to `profiles` (author_id and seller_id), so the
        // embed must name the constraint or PostgREST rejects it as ambiguous.
        .select(
          "id,rating,comment,created_at,author_id,profiles!reviews_author_id_fkey(full_name,avatar_url)",
        )
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });
}

/** Search suggestions: matching listing titles for the header autocomplete. */
export function searchSuggestionsQuery(term: string, limit = 6) {
  return queryOptions({
    queryKey: ["search-suggestions", term],
    enabled: term.trim().length >= 2,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id,title,city,price")
        .or(`title.ilike.%${term}%,description.ilike.%${term}%`)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; city: string; price: number }[];
    },
  });
}

/** Admin: recent listings for curation (featured toggle, removal). */
export function adminListingsQuery() {
  return queryOptions({
    queryKey: ["admin-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id,title,price,status,view_count,featured,created_at,listing_images(id,url,position)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Popular searches derived from the search log (top N this week). */
async function fetchTrendingSearches(limit = 8): Promise<string[]> {
  const { data, error } = await supabase
    .from("search_log")
    .select("query")
    .gte("created_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString());
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const q = (row.query ?? "").trim().toLowerCase();
    if (!q) continue;
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([query]) => query);
}

export function trendingSearchesQuery(limit = 8) {
  return queryOptions({
    queryKey: ["trending-searches", limit],
    staleTime: 1000 * 60 * 5,
    queryFn: () => fetchTrendingSearches(limit),
  });
}

export function recentlyViewedQuery(userId: string) {
  return queryOptions({
    queryKey: ["recently-viewed", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recently_viewed")
        .select(`listing_id, listings(${LISTING_SELECT})`)
        .eq("user_id", userId)
        .order("viewed_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []).map((row) => row.listings).filter(Boolean) as unknown as Listing[];
    },
  });
}

export function notificationsQuery(userId: string) {
  return queryOptions({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,payload,is_read,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

/** App-level helpers ------------------------------------------------- */

export async function recordListingView(listingId: string) {
  const { error } = await supabase.rpc("record_listing_view", {
    _listing_id: listingId,
  });
  if (error) console.error("record view failed", error);
}

export async function logSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  const { error } = await supabase.from("search_log").insert({ query: q });
  if (error) console.error("log search failed", error);
}

export async function notifyUser(
  userId: string,
  type: string,
  payload: {
    title?: string;
    listingId?: string;
    offerId?: string;
    conversationId?: string;
    query?: string | null;
    status?: string;
    oldPrice?: number;
    newPrice?: number;
    senderName?: string;
    messagePreview?: string;
    phone?: string;
    buyerName?: string;
    buyerId?: string;
    buyerPhone?: string;
    note?: string;
    message?: string;
    amount?: number;
  } = {},
) {
  if (!userId) return;
  const { error } = await supabase.rpc("notify_user", {
    _user_id: userId,
    _type: type,
    _payload: payload,
  });
  if (error) console.error("notify failed", error);
}

export async function submitReview(
  sellerId: string,
  authorId: string,
  rating: number,
  comment: string,
) {
  const { error } = await supabase
    .from("reviews")
    .upsert(
      { seller_id: sellerId, author_id: authorId, rating, comment },
      { onConflict: "seller_id,author_id" },
    );
  if (error) throw error;
}

/** Removes the caller's own review. RLS restricts this to author_id = auth.uid(). */
export async function deleteReview(reviewId: string) {
  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) throw error;
}

export async function submitReport(input: {
  reporterId: string;
  reason: string;
  details?: string | null | undefined;
  listingId?: string | null | undefined;
  reportedUserId?: string | null | undefined;
}) {
  const { error } = await supabase.from("reports").insert({
    reporter_id: input.reporterId,
    reason: input.reason,
    details: input.details ?? null,
    listing_id: input.listingId ?? null,
    reported_user_id: input.reportedUserId ?? null,
  });
  if (error) throw error;
}

/** Saved searches (with alerts) ---------------------------------------- */

export function savedSearchesQuery(userId: string) {
  return queryOptions({
    queryKey: ["saved-searches", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_searches")
        .select("id,query,filters,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SavedSearch[];
    },
  });
}

export async function saveSearch(
  userId: string,
  input: {
    query?: string | undefined;
    category?: string | undefined;
    min?: number | undefined;
    max?: number | undefined;
  },
) {
  const { error } = await supabase.from("saved_searches").insert({
    user_id: userId,
    query: input.query?.trim() || null,
    filters: {
      category: input.category || undefined,
      min: input.min && input.min > 0 ? input.min : undefined,
      max: input.max && input.max > 0 ? input.max : undefined,
    },
  });
  if (error) throw error;
}

export async function deleteSavedSearch(id: string) {
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  if (error) throw error;
}

/** Buyer preferences (Telegram alert filtering) ------------------------ */

export function buyerPreferencesQuery(userId: string) {
  return queryOptions({
    queryKey: ["buyer-preferences", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buyer_preferences")
        .select("category_ids,price_min,price_max,preferred_cities,telegram_alerts_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        category_ids: [],
        price_min: null,
        price_max: null,
        preferred_cities: [],
        telegram_alerts_enabled: false,
      }) as unknown as BuyerPreferences;
    },
  });
}

export async function saveBuyerPreferences(userId: string, prefs: BuyerPreferences) {
  const { error } = await supabase
    .from("buyer_preferences")
    .upsert({ user_id: userId, ...prefs }, { onConflict: "user_id" });
  if (error) throw error;
}

/** Dashboard: views per day for the seller's listings (14 days). -------- */

export function sellerViewsPerDayQuery(sellerId: string) {
  return queryOptions({
    queryKey: ["seller-views-per-day", sellerId],
    enabled: !!sellerId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data: ids } = await supabase.from("listings").select("id").eq("seller_id", sellerId);
      if (!ids || ids.length === 0) return [] as { date: string; count: number }[];
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString();
      const { data, error } = await supabase
        .from("listing_views")
        .select("created_at")
        .in(
          "listing_id",
          ids.map((r) => r.id),
        )
        .gte("created_at", since);
      if (error) throw error;
      const byDay = new Map<string, number>();
      for (const row of data ?? []) {
        const day = row.created_at.slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      }
      // Fill the last 14 days so the chart has a continuous axis.
      const out: { date: string; count: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 1000 * 60 * 60 * 24).toISOString().slice(0, 10);
        out.push({ date: d, count: byDay.get(d) ?? 0 });
      }
      return out;
    },
  });
}

/** Seller verification documents --------------------------------------- */

export type VerificationDocument = {
  id: string;
  document_type: string;
  file_url: string;
  status: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export function sellerVerificationDocsQuery(userId: string) {
  return queryOptions({
    queryKey: ["seller-verification-docs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_verification_documents")
        .select("id,document_type,file_url,status,rejection_reason,reviewed_at,created_at")
        .eq("seller_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VerificationDocument[];
    },
  });
}

export async function submitVerificationDocument(
  sellerId: string,
  documentType: string,
  fileUrl: string,
) {
  const { error } = await supabase.from("seller_verification_documents").insert({
    seller_id: sellerId,
    document_type: documentType,
    file_url: fileUrl,
  });
  if (error) throw error;
}

export type AdminVerificationDoc = VerificationDocument & {
  profiles?: {
    full_name: string;
    shop_name: string | null;
    shop_slug: string | null;
    avatar_url?: string | null;
    shop_logo_url?: string | null;
    phone?: string | null;
    city?: string | null;
    shop_address?: string | null;
    registration_number?: string | null;
    created_at?: string;
  } | null;
};

export function adminVerificationQueueQuery() {
  return queryOptions({
    queryKey: ["admin-verification-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_verification_documents")
        .select(
          "id,document_type,file_url,status,rejection_reason,reviewed_at,created_at,seller_id," +
            // Two FKs point at profiles (seller_id and reviewed_by), so the embed
            // must name the constraint or PostgREST rejects it as ambiguous.
            "profiles!seller_verification_documents_seller_id_fkey(full_name,shop_name,shop_slug,avatar_url,shop_logo_url,phone,city,shop_address,registration_number,created_at)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AdminVerificationDoc[];
    },
  });
}

export function adminVerificationDecisionsQuery() {
  return queryOptions({
    queryKey: ["admin-verification-decisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verification_decisions")
        .select(
          "id,action,reason,created_at,reviewer_id,seller_id,profiles!verification_decisions_reviewer_id_fkey(full_name),seller:profiles!verification_decisions_seller_id_fkey(full_name,shop_name)",
        )
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        action: string;
        reason: string | null;
        created_at: string;
        reviewer_id: string;
        seller_id: string;
        profiles?: { full_name: string } | null;
        seller?: { full_name: string; shop_name: string | null } | null;
      }[];
    },
  });
}

/** Admin -------------------------------------------------------------- */

export type AdminReport = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter_id: string;
  listing_id: string | null;
  reported_user_id: string | null;
  listings?: { title: string; id: string } | null;
  profiles?: { full_name: string; shop_name: string | null } | null;
};

export function adminReportsQuery() {
  return queryOptions({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*, listings(title,id), profiles(full_name,shop_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminReport[];
    },
  });
}

export type AdminUser = {
  id: string;
  full_name: string;
  shop_name: string | null;
  shop_slug: string | null;
  avatar_url: string | null;
  shop_logo_url: string | null;
  verified: boolean;
  is_seller: boolean;
  is_super_admin: boolean;
  created_at: string;
  phone: string | null;
  city: string | null;
  banned_until: string | null;
  ban_reason: string | null;
  // Each user's roles (admin / moderator / user). Readable by admins via the
  // "admins read all roles" policy; drives the promote/demote toggle.
  user_roles?: { role: string }[] | null;
};

/**
 * Every account, for the admin users tab. Readable only by admins — the
 * "admin reads all profiles" policy gates it.
 */
export function adminAllUsersQuery(filter: "all" | "sellers" | "buyers" = "all") {
  return queryOptions({
    queryKey: ["admin-all-users", filter],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select(
          "id,full_name,shop_name,shop_slug,avatar_url,shop_logo_url,verified,is_seller,is_super_admin,created_at,phone,city,banned_until,ban_reason,user_roles(role)",
        )
        .order("created_at", { ascending: false });
      if (filter === "sellers") query = query.eq("is_seller", true);
      if (filter === "buyers") query = query.eq("is_seller", false);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
  });
}

export function pendingSellersQuery() {
  return queryOptions({
    queryKey: ["admin-sellers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,full_name,shop_name,shop_slug,avatar_url,shop_logo_url,verified,created_at,phone,city,banned_until,ban_reason",
        )
        .eq("is_seller", true)
        .eq("verified", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Admin: listings grouped by category (top categories analytics). */
export function adminTopCategoriesQuery() {
  return queryOptions({
    queryKey: ["admin-top-categories"],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("categories(name)")
        .neq("status", "draft");
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const name = (row.categories as { name: string } | null)?.name ?? "Uncategorised";
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));
    },
  });
}

export function adminStatsQuery() {
  return queryOptions({
    queryKey: ["admin-stats"],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [
        listings,
        users,
        sellers,
        verified,
        views,
        trending,
        statuses,
        featured,
        conversations,
        messages,
        reviews,
        newListings,
        newUsers,
        telegramLog,
        telegramLinked,
        telegramBlocked,
        telegramChannelPosts,
        telegramProcessed,
      ] = await Promise.all([
        supabase.from("listings").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_seller", true),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_seller", true)
          .eq("verified", true),
        supabase.from("listings").select("view_count").neq("status", "draft"),
        (async () => {
          const { data } = await supabase
            .from("search_log")
            .select("query")
            .gte("created_at", weekAgo);
          const counts = new Map<string, number>();
          for (const row of data ?? []) {
            const q = (row.query ?? "").trim().toLowerCase();
            if (!q) continue;
            counts.set(q, (counts.get(q) ?? 0) + 1);
          }
          return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([name, count]) => ({ name, count }));
        })(),
        supabase.from("listings").select("status"),
        supabase.from("listings").select("id", { count: "exact", head: true }).eq("featured", true),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("reviews").select("id", { count: "exact", head: true }),
        supabase
          .from("listings")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
        // ── Telegram integration health (spec §19 monitoring gap) ──
        supabase.from("telegram_delivery_log").select("ok,error").gte("created_at", weekAgo),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .not("telegram_chat_id", "is", null),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("telegram_blocked", true),
        supabase.from("telegram_channel_posts").select("id", { count: "exact", head: true }),
        supabase.from("telegram_processed_updates").select("id", { count: "exact", head: true }),
      ]);
      const totalViews = (views.data ?? []).reduce(
        (sum: number, l: { view_count: number }) => sum + (l.view_count ?? 0),
        0,
      );
      // Status breakdown (active / sold / everything else pending, e.g. draft).
      const statusCounts: Record<string, number> = {};
      for (const l of (statuses.data ?? []) as { status: string }[]) {
        statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;
      }
      return {
        listings: listings.count ?? 0,
        users: users.count ?? 0,
        sellers: sellers.count ?? 0,
        verifiedSellers: verified.count ?? 0,
        totalViews,
        topSearches: trending,
        activeListings: statusCounts["active"] ?? 0,
        soldListings: statusCounts["sold"] ?? 0,
        otherListings:
          listings.count ?? 0 - (statusCounts["active"] ?? 0) - (statusCounts["sold"] ?? 0),
        featuredListings: featured.count ?? 0,
        conversations: conversations.count ?? 0,
        messages: messages.count ?? 0,
        reviews: reviews.count ?? 0,
        newListings7d: newListings.count ?? 0,
        newUsers7d: newUsers.count ?? 0,
        // Telegram delivery health — last 7 days of sends.
        telegramSends7d: (telegramLog.data ?? []).length,
        telegramOk7d: (telegramLog.data ?? []).filter((r) => r.ok).length,
        telegramFailures7d: (telegramLog.data ?? []).filter((r) => !r.ok).length,
        telegramFailureReasons: [
          ...new Map(
            (telegramLog.data ?? [])
              .filter((r) => !r.ok && r.error)
              .map((r) => [r.error as string, r.error as string]),
          ).keys(),
        ].slice(0, 3),
        telegramLinkedUsers: telegramLinked.count ?? 0,
        telegramBlockedUsers: telegramBlocked.count ?? 0,
        telegramChannelPosts: telegramChannelPosts.count ?? 0,
        telegramProcessedUpdates: telegramProcessed.count ?? 0,
      };
    },
  });
}

export type TrendDay = {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Aug 2"
  listings: number;
  users: number;
  messages: number;
  views: number;
};

/**
 * Daily activity series for the admin trend chart. Fetches created_at rows
 * for listings / profiles / messages / views over the last `days` and buckets
 * them by calendar day (zero-filled so the trend line stays continuous).
 */
export function adminTrendQuery(days: number) {
  return queryOptions({
    queryKey: ["admin-trend", days],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<TrendDay[]> => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const [listings, users, messages, views] = await Promise.all([
        supabase.from("listings").select("created_at").gte("created_at", since),
        supabase.from("profiles").select("created_at").gte("created_at", since),
        supabase.from("messages").select("created_at").gte("created_at", since),
        supabase.from("listing_views").select("created_at").gte("created_at", since),
      ]);
      if (listings.error) throw listings.error;
      if (users.error) throw users.error;
      if (messages.error) throw messages.error;
      if (views.error) throw views.error;

      const buckets = new Map<string, TrendDay>();
      const key = (iso: string) => iso.slice(0, 10);
      const label = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const k = key(d.toISOString());
        buckets.set(k, { date: k, label: label(d), listings: 0, users: 0, messages: 0, views: 0 });
      }
      for (const row of listings.data ?? []) {
        const b = buckets.get(key(row.created_at));
        if (b) b.listings += 1;
      }
      for (const row of users.data ?? []) {
        const b = buckets.get(key(row.created_at));
        if (b) b.users += 1;
      }
      for (const row of messages.data ?? []) {
        const b = buckets.get(key(row.created_at));
        if (b) b.messages += 1;
      }
      for (const row of views.data ?? []) {
        const b = buckets.get(key(row.created_at));
        if (b) b.views += 1;
      }
      return [...buckets.values()];
    },
  });
}

export function isAdminQuery(userId: string | undefined) {
  return queryOptions({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}
