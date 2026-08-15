import { File } from "expo-file-system";
import { supabase } from "./supabase";
import type { Database } from "./db-types";

export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type SavedSearch = Database["public"]["Tables"]["saved_searches"]["Row"];
export type VerificationDoc = Database["public"]["Tables"]["seller_verification_documents"]["Row"];

/** Listing with joined images + seller profile + category (mirrors web LISTING_SELECT). */
export type Listing = ListingRow & {
  listing_images: { id: string; url: string; position: number }[];
  profiles?: Pick<
    Profile,
    | "id"
    | "full_name"
    | "shop_name"
    | "shop_slug"
    | "shop_logo_url"
    | "verified"
    | "city"
    | "phone"
    | "last_seen"
    | "is_online"
    | "whatsapp"
    | "telegram"
  > | null;
  categories?: { name: string; slug: string; name_am: string | null } | null;
};

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

const LISTING_SELECT =
  "*, listing_images(id,url,position), profiles!listings_seller_id_fkey(id,full_name,shop_name,shop_slug,shop_logo_url,verified,city,phone,last_seen,is_online,whatsapp,telegram), categories(name,slug,name_am)";

/** Fetch listings with the same filter semantics as the web app. */
export async function fetchListings(filters: ListingFilters = {}): Promise<Listing[]> {
  let query = supabase.from("listings").select(LISTING_SELECT).neq("status", "draft");

  if (filters.q) query = query.or(`title.ilike.%${filters.q}%,description.ilike.%${filters.q}%`);
  if (filters.condition) query = query.eq("condition", filters.condition);
  if (filters.material) query = query.eq("material", filters.material);
  if (filters.room) query = query.eq("room_type", filters.room);
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.sellerId) query = query.eq("seller_id", filters.sellerId);
  if (typeof filters.min === "number" && filters.min > 0) query = query.gte("price", filters.min);
  if (typeof filters.max === "number" && filters.max > 0) query = query.lte("price", filters.max);
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
}

export async function fetchListing(id: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Listing | null;
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function fetchShop(slug: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("shop_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchReviews(sellerId: string) {
  const { data, error } = await supabase
    .from("reviews")
    // `reviews` has two FKs to `profiles` (author_id and seller_id), so the
    // embed must name the constraint or PostgREST rejects it as ambiguous
    // (same fix as the web's reviewsQuery).
    .select("id,rating,comment,created_at,author_id,profiles!reviews_author_id_fkey(full_name)")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function recordListingView(listingId: string) {
  const { error } = await supabase.rpc("record_listing_view", { _listing_id: listingId });
  if (error) console.warn("record view failed", error);
}

export async function logSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  const { error } = await supabase.from("search_log").insert({ query: q });
  if (error) console.warn("log search failed", error);
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function updateProfile(userId: string, patch: Partial<Profile>) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

// ── Favorites ────────────────────────────────────────────────────────────

export async function fetchFavoriteIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("favorites")
    .select("listing_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((f) => f.listing_id);
}

export async function toggleFavorite(userId: string, listingId: string, isFav: boolean) {
  if (isFav) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("listing_id", listingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("favorites")
      .insert({ user_id: userId, listing_id: listingId });
    if (error) throw error;
  }
}

export async function fetchFavorites(userId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from("favorites")
    .select(`listing_id, listings(${LISTING_SELECT})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as { listings: unknown }[];
  return rows.map((r) => r.listings).filter(Boolean) as unknown as Listing[];
}

// ── Conversations & messages ─────────────────────────────────────────────

export async function fetchConversations(userId: string) {
  // Hide conversations the current user deleted for themselves (per-side soft
  // delete — see 20260815000000_conversation_delete.sql).
  const { data, error } = await supabase
    .from("conversations")
    .select("id,last_message_at,buyer_id,seller_id,listings(id,title,price,listing_images(url))")
    .or(
      `and(buyer_id.eq.${userId},buyer_deleted_at.is.null),and(seller_id.eq.${userId},seller_deleted_at.is.null)`,
    )
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as {
    id: string;
    last_message_at: string;
    buyer_id: string;
    seller_id: string;
    listings: {
      id: string;
      title: string;
      price: number;
      listing_images: { url: string }[];
    } | null;
  }[];

  // The other party is the participant who is not the current user.
  const otherIds = rows.map((r) => (r.buyer_id === userId ? r.seller_id : r.buyer_id));
  const uniq = [...new Set(otherIds)];
  let profiles: {
    id: string;
    full_name: string;
    shop_name: string | null;
    shop_logo_url: string | null;
  }[] = [];
  if (uniq.length > 0) {
    const { data: p } = await supabase
      .from("profiles")
      .select("id,full_name,shop_name,shop_logo_url")
      .in("id", uniq);
    profiles = (p ?? []) as typeof profiles;
  }
  const byId = new Map(profiles.map((p) => [p.id, p]));

  // Unread per conversation: messages from the other side with no read_at.
  let unreadCounts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: unread } = await supabase
      .from("messages")
      .select("conversation_id,id")
      .in(
        "conversation_id",
        rows.map((r) => r.id),
      )
      .neq("sender_id", userId)
      .is("read_at", null);
    unreadCounts = new Map<string, number>();
    for (const row of unread ?? []) {
      unreadCounts.set(row.conversation_id, (unreadCounts.get(row.conversation_id) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    last_message_at: r.last_message_at,
    listings: r.listings,
    profiles: byId.get(r.buyer_id === userId ? r.seller_id : r.buyer_id) ?? null,
    unread: unreadCounts.get(r.id) ?? 0,
  }));
}

/** Hide a conversation from the caller's own inbox (the other side keeps it). */
export async function deleteConversation(conversationId: string, myUserId: string) {
  const { data: conv } = await supabase
    .from("conversations")
    .select("buyer_id,seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return;
  const patch =
    conv.buyer_id === myUserId
      ? { buyer_deleted_at: new Date().toISOString() }
      : { seller_deleted_at: new Date().toISOString() };
  const { error } = await supabase.from("conversations").update(patch).eq("id", conversationId);
  if (error) throw error;
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id,body,sender_id,created_at,edited_at,deleted_at,read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Message[];
}

/** Edit an existing message body (web parity: `edited_at` gets stamped). */
export async function editMessage(messageId: string, body: string) {
  const { error } = await supabase
    .from("messages")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw error;
}

/** Soft-delete: row stays so the other side sees a "deleted" placeholder. */
export async function deleteMessage(messageId: string) {
  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw error;
}

/** Mark the counterpart's messages as read in this conversation. */
export async function markConversationRead(conversationId: string, myUserId: string) {
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", myUserId)
    .is("read_at", null);
  if (error) console.warn("mark read failed", error);
}

/** Conversation with its listing + both participants (chat header banner). */
export async function fetchConversation(conversationId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id,last_message_at,buyer_id,seller_id," +
        "listings(id,title,price,status,listing_images(url))," +
        "buyer:profiles!conversations_buyer_id_fkey(id,full_name,shop_name,shop_logo_url)," +
        "seller:profiles!conversations_seller_id_fkey(id,full_name,shop_name,shop_logo_url)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as {
    id: string;
    last_message_at: string;
    buyer_id: string;
    seller_id: string;
    listings: {
      id: string;
      title: string;
      price: number;
      status: string;
      listing_images: { url: string }[];
    } | null;
    buyer: {
      id: string;
      full_name: string;
      shop_name: string | null;
      shop_logo_url: string | null;
    } | null;
    seller: {
      id: string;
      full_name: string;
      shop_name: string | null;
      shop_logo_url: string | null;
    } | null;
  } | null;
}

/** Find or create a conversation for a buyer + listing, then return its id. */
export async function ensureConversation(
  listingId: string,
  buyerId: string,
  sellerId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await supabase
    .from("conversations")
    .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body });
  if (error) throw error;
}

export async function notifyUser(
  userId: string,
  type: string,
  payload: Record<string, unknown> = {},
) {
  if (!userId) return;
  const { error } = await supabase.rpc("notify_user", {
    _user_id: userId,
    _type: type,
    _payload: payload as never,
  });
  if (error) console.warn("notify failed", error);
}

// ── Telegram ─────────────────────────────────────────────────────────────
// Delivery lives in the `telegram-notify` edge function, shared with the web
// app. Seller alerts for messages and callbacks are NOT sent from here — they
// ride the telegram_on_notification DB trigger off the notifications row that
// notifyUser() inserts, so one call fans out to in-app, push and Telegram.

/** Fire-and-forget: Telegram must never fail the user's action. */
async function invokeTelegram(body: Record<string, unknown>) {
  try {
    await supabase.functions.invoke("telegram-notify", { body });
  } catch (error) {
    console.warn("telegram-notify failed", error);
  }
}

/**
 * Announce a newly published listing: posts it to the public channel and DMs
 * buyers whose saved preferences match. Called after the images are inserted,
 * because the channel post uses the first image as its cover photo.
 */
export function announceListing(listingId: string) {
  void invokeTelegram({ kind: "listing", listing_id: listingId });
}

/** Seller "your item is getting views" ping (throttled in the edge function). */
export function pingListingView(listingId: string) {
  void invokeTelegram({ kind: "view", listing_id: listingId });
}

/**
 * Keep the public channel post in sync with the listing's real state.
 *
 * Call AFTER an edit (price drop, title, sold…) so the post's caption is
 * re-rendered (sold listings get a "✅ SOLD" header). For a hard delete, call
 * with action "delete" BEFORE deleting the listings row — the channel-post
 * record cascades off it, so there's no way to find the message afterwards.
 */
export function syncListingChannel(listingId: string, action: "auto" | "delete" = "auto") {
  void invokeTelegram({ kind: "sync_listing", listing_id: listingId, action });
}

/**
 * Mints a single-use, 15-minute token and returns the t.me deep link that binds
 * this user's Telegram chat to their account when they press Start.
 * Returns null when no bot is configured for the build.
 */
export async function getTelegramConnectUrl(): Promise<string | null> {
  const username = process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!username) return null;
  const { data, error } = await supabase.rpc("mint_telegram_link_token");
  if (error || !data) {
    console.warn("mint telegram token failed", error);
    return null;
  }
  return `https://t.me/${username.replace(/^@/, "")}?start=${data}`;
}

/** True when this build has a bot configured — gates the Connect UI. */
export function telegramConfigured(): boolean {
  return !!process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME;
}

/** Disconnects Telegram from the app side (the bot's /stop does the same). */
export async function disconnectTelegram(): Promise<boolean> {
  const { error } = await supabase.rpc("unlink_telegram");
  if (error) console.warn("unlink telegram failed", error);
  return !error;
}

// ── Notifications center ─────────────────────────────────────────────────

export async function fetchNotifications(userId: string) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id,type,payload,is_read,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationsRead(userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .is("is_read", false);
  if (error) throw error;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

/** Dismiss a notification. RLS restricts the delete to the owner's own rows
 *  (see 20260804090000_chat_edit_delete_receipts.sql). */
export async function deleteNotification(id: string) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw error;
}

// ── Push tokens (Expo Push Service) ──────────────────────────────────────

export async function savePushToken(token: string, platform: string) {
  // The SECURITY DEFINER RPC clears any stale row for this device's token
  // (e.g. a previous account on the same phone) and attaches it to the
  // current user in one step — a plain delete+insert would hit RLS on
  // another user's row and the unique-token constraint.
  const { error } = await supabase.rpc("claim_push_token", {
    _token: token,
    _platform: platform,
  });
  if (error) throw error;
}

export async function deletePushToken(token: string) {
  const { error } = await supabase.from("push_tokens").delete().eq("token", token);
  if (error) throw error;
}

// ── Saved searches ───────────────────────────────────────────────────────

export async function fetchSavedSearches(userId: string): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from("saved_searches")
    .select("id,query,filters,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SavedSearch[];
}

export async function saveSearch(
  userId: string,
  input: {
    query?: string;
    category?: string;
    min?: number;
    max?: number;
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

// ── Reviews ──────────────────────────────────────────────────────────────

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

// ── Verification documents ───────────────────────────────────────────────

export async function fetchMyVerificationDocs(userId: string): Promise<VerificationDoc[]> {
  const { data, error } = await supabase
    .from("seller_verification_documents")
    .select("*")
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Buyer preferences ────────────────────────────────────────────────────

export type BuyerPreferences = {
  category_ids: string[];
  price_min: number | null;
  price_max: number | null;
  preferred_cities: string[];
  telegram_alerts_enabled: boolean;
};

export async function fetchBuyerPreferences(userId: string): Promise<BuyerPreferences | null> {
  const { data, error } = await supabase
    .from("buyer_preferences")
    .select("category_ids,price_min,price_max,preferred_cities,telegram_alerts_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as BuyerPreferences | null;
}

export async function saveBuyerPreferences(userId: string, prefs: BuyerPreferences) {
  const { error } = await supabase.from("buyer_preferences").upsert({ user_id: userId, ...prefs });
  if (error) throw error;
}

// ── Seller dashboard ─────────────────────────────────────────────────────

export async function updateListingStatus(id: string, status: string) {
  const { error } = await supabase.from("listings").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Mark a listing sold and ping every buyer who has a conversation about it. */
export async function markListingSold(id: string, title: string) {
  await updateListingStatus(id, "sold");
  // The channel post gets a "✅ SOLD" header (no-op if never posted).
  syncListingChannel(id);
  const { data: buyers, error } = await supabase
    .from("conversations")
    .select("buyer_id")
    .eq("listing_id", id);
  if (error) throw error;
  for (const row of buyers ?? []) {
    await notifyUser(row.buyer_id, "listing_sold", { title, listingId: id }).catch(() => {});
  }
}

/** Delete a listing (images cascade; storage objects removed best-effort). */
export async function deleteListing(id: string): Promise<void> {
  // Retract the channel post BEFORE the row is deleted — the channel-post
  // record cascades off the listing, so afterwards there's no way to find it.
  syncListingChannel(id, "delete");
  const { data: listing } = await supabase
    .from("listings")
    .select("listing_images(url)")
    .eq("id", id)
    .maybeSingle();
  const allUrls = ((listing?.listing_images ?? []) as { url: string }[]).map((img) => img.url);
  const paths = allUrls.filter((url) => !!url && !url.startsWith("http"));
  const { error } = await supabase.from("listings").delete().eq("id", id);
  if (error) throw error;
  if (paths.length) {
    await supabase.storage.from("listing-images").remove(paths).catch(() => {});
  }
  // Cloudinary assets (listing photos, showcase videos) are deleted too.
  await deleteCloudinaryAssets(allUrls);
}

/**
 * Buyer asks the seller to call them back.
 *
 * The callback_requests row must be inserted BEFORE notify_user: that RPC only
 * allows notifying someone you already share a conversation or callback thread
 * with, so notifying first is silently dropped. The insert is what establishes
 * the thread. Inserting it also drives push and Telegram via the notifications
 * triggers.
 */
export async function requestCallback(input: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  listingTitle: string;
  phone: string;
  note?: string | null;
  buyerName?: string | null;
}) {
  const { error } = await supabase.from("callback_requests").insert({
    listing_id: input.listingId,
    buyer_id: input.buyerId,
    seller_id: input.sellerId,
    phone: input.phone,
    note: input.note || null,
  });
  if (error) throw error;
  // The phone rides in the payload so the seller can call straight back from
  // the notification (in-app, push and Telegram all render it).
  await notifyUser(input.sellerId, "callback_request", {
    title: input.listingTitle,
    listingId: input.listingId,
    phone: input.phone,
    buyerName: input.buyerName ?? null,
  });
}

export async function fetchCallbacks(sellerId: string) {
  const { data, error } = await supabase
    .from("callback_requests")
    .select("id,phone,note,status,created_at,buyer_id,listings(title)")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string;
    phone: string;
    note: string | null;
    status: string;
    buyer_id: string;
    created_at: string;
    listings: { title: string } | null;
  }[];
}

// ── Offers ────────────────────────────────────────────────────────────────

/**
 * Buyer proposes an amount on a listing.
 *
 * The offer row must be inserted BEFORE notify_user: that RPC only notifies
 * someone you share a conversation, callback or offer thread with, and the
 * offer row is what establishes the thread (same pattern as requestCallback).
 */
export async function makeOffer(input: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  listingTitle: string;
  amount: number;
  message?: string | null;
}) {
  const { error } = await supabase.from("offers").insert({
    listing_id: input.listingId,
    buyer_id: input.buyerId,
    seller_id: input.sellerId,
    amount: input.amount,
    message: input.message || null,
  });
  if (error) throw error;
  await notifyUser(input.sellerId, "offer_received", {
    title: input.listingTitle,
    listingId: input.listingId,
    amount: input.amount,
  });
}

export async function fetchOffersForSeller(sellerId: string) {
  const { data, error } = await supabase
    .from("offers")
    .select(
      "id,amount,message,status,created_at,buyer_id," +
        "listings(id,title),buyer:profiles!offers_buyer_id_fkey(full_name,phone)",
    )
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string;
    amount: number;
    message: string | null;
    status: string;
    buyer_id: string;
    created_at: string;
    listings: { id: string; title: string } | null;
    buyer: { full_name: string | null; phone: string | null } | null;
  }[];
}

/** Seller accepts or declines; the buyer is notified either way. */
export async function respondToOffer(input: {
  id: string;
  status: "accepted" | "declined";
  buyerId: string;
  listingTitle: string | null;
  listingId: string;
  amount: number;
}) {
  const { error } = await supabase
    .from("offers")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) throw error;
  await notifyUser(input.buyerId, "offer_response", {
    status: input.status,
    title: input.listingTitle,
    listingId: input.listingId,
    amount: input.amount,
  });
}

export async function updateCallbackStatus(
  id: string,
  status: "contacted" | "closed",
  buyerId?: string | null,
  listingTitle?: string | null,
) {
  const { error } = await supabase.from("callback_requests").update({ status }).eq("id", id);
  if (error) throw error;
  if (buyerId) {
    const payload: { status: string; title?: string } = { status };
    if (listingTitle) payload.title = listingTitle;
    await notifyUser(buyerId, "callback_response", payload).catch(() => {});
  }
}

export async function fetchConversationCount(sellerId: string): Promise<number> {
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", sellerId);
  if (error) throw error;
  return count ?? 0;
}

/** Views per day for the seller's listings over the last 14 days (web parity). */
export async function fetchViewsPerDay(sellerId: string): Promise<{ date: string; count: number }[]> {
  const { data: ids } = await supabase.from("listings").select("id").eq("seller_id", sellerId);
  if (!ids || ids.length === 0) return [];
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
  const out: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 1000 * 60 * 60 * 24).toISOString().slice(0, 10);
    out.push({ date: d, count: byDay.get(d) ?? 0 });
  }
  return out;
}

// ── Reports ──────────────────────────────────────────────────────────────

export async function submitReport(input: {
  reporterId: string;
  reason: string;
  details?: string;
  listingId?: string;
  reportedUserId?: string;
}) {
  const { error } = await supabase.from("reports").insert({
    reporter_id: input.reporterId,
    reason: input.reason,
    details: input.details?.trim() || null,
    listing_id: input.listingId ?? null,
    reported_user_id: input.reportedUserId ?? null,
    status: "pending",
  });
  if (error) throw error;
}

// ── Sell ─────────────────────────────────────────────────────────────────

/**
 * Reads a local file's bytes with expo-file-system and returns a Blob.
 *
 * Cloudinary uploads need multipart FormData. React Native's FormData accepts
 * a Blob, but the old `{ uri, name, type }` descriptor stopped working in
 * Expo SDK 54 (the WinterCG fetch's encoder throws "Unsupported FormDataPart
 * implementation"). Building the Blob from the file's bytes sidesteps that.
 */
async function fileToBlob(file: { uri: string; mimeType?: string }): Promise<Blob> {
  const bytes = await new File(file.uri).bytes();
  return new Blob([bytes], { type: file.mimeType ?? "application/octet-stream" });
}

/**
 * Asks cloudinary-sign for signed upload params (folder pinned to the current
 * user) and POSTs the file to Cloudinary. Returns the stored secure_url. The
 * API secret never leaves the server.
 */
async function uploadViaCloudinary(
  file: { uri: string; name?: string; mimeType?: string },
  scope: "listing" | "video" | "logo",
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("cloudinary-sign", {
    body: { scope },
  });
  if (error || !data?.signature) {
    throw error ?? new Error("cloudinary sign failed");
  }

  const form = new FormData();
  form.append("file", await fileToBlob(file));
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

export function uploadListingImage(
  userId: string,
  file: { uri: string; name?: string; mimeType?: string },
): Promise<string> {
  return uploadViaCloudinary(file, "listing");
}

/**
 * Short showcase video (≤ ~60s) for a listing. Same signed Cloudinary flow as
 * photos; the seller's userId is kept for call-site symmetry.
 */
export function uploadListingVideo(
  userId: string,
  file: { uri: string; name?: string; mimeType?: string },
): Promise<string> {
  return uploadViaCloudinary(file, "video");
}

/**
 * Shop logos go to Cloudinary too — same signed flow, logo folder. The userId
 * parameter is kept for call-site symmetry with the old storage paths.
 */
export function uploadShopLogo(
  userId: string,
  file: { uri: string; name?: string; mimeType?: string },
): Promise<string> {
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

/** Verification documents stay in the private (owner + admin only) bucket. */
export function uploadVerificationDocument(
  userId: string,
  file: { uri: string; name?: string; mimeType?: string },
): Promise<string> {
  const ext = (file.name ?? "doc.jpg").split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  return (async () => {
    const bytes = await new File(file.uri).bytes();
    const { error } = await supabase.storage.from("verification-docs").upload(path, bytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`,
    });
    if (error) throw error;
    return path;
  })();
}

export async function createListing(input: {
  sellerId: string;
  title: string;
  description: string;
  price: number;
  originalPrice: number | null;
  negotiable: boolean;
  condition: string;
  material: string | null;
  color: string | null;
  roomType: string | null;
  brand: string | null;
  city: string;
  subCity: string | null;
  categoryId: string | null;
  deliveryOffered: boolean;
  deliveryFee: number | null;
  discountExpiresAt: string | null;
  latitude: number | null;
  longitude: number | null;
  imagePaths: string[];
  videoUrl?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from("listings")
    .insert({
      seller_id: input.sellerId,
      title: input.title,
      description: input.description,
      price: input.price,
      original_price: input.originalPrice,
      negotiable: input.negotiable,
      condition: input.condition,
      material: input.material,
      color: input.color,
      room_type: input.roomType,
      brand: input.brand,
      city: input.city,
      sub_city: input.subCity,
      category_id: input.categoryId,
      delivery_offered: input.deliveryOffered,
      delivery_fee: input.deliveryFee,
      discount_expires_at: input.discountExpiresAt,
      latitude: input.latitude,
      longitude: input.longitude,
      video_url: input.videoUrl ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.imagePaths.length > 0) {
    const { error: imgError } = await supabase
      .from("listing_images")
      .insert(input.imagePaths.map((url, i) => ({ listing_id: data.id, url, position: i })));
    if (imgError) throw imgError;
  }
  // Announce only after the images exist — the channel post uses the first one
  // as its cover photo.
  announceListing(data.id);
  return data.id;
}

export async function fetchMyListings(sellerId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_SELECT)
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Listing[];
}

/** Load one listing with images for the seller edit screen. */
export async function fetchListingForEdit(id: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Listing | null;
}

/** Update a listing's core fields (sell/edit screen, owner-only via RLS). */
export async function updateListing(
  id: string,
  patch: {
    title?: string;
    description?: string;
    price?: number;
    original_price?: number | null;
    negotiable?: boolean;
    condition?: string;
    material?: string | null;
    color?: string | null;
    room_type?: string | null;
    brand?: string | null;
    city?: string;
    sub_city?: string | null;
    category_id?: string | null;
    delivery_offered?: boolean;
    delivery_fee?: number | null;
    discount_expires_at?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    video_url?: string | null;
  },
) {
  const { error } = await supabase.from("listings").update(patch).eq("id", id);
  if (error) throw error;
  // Keep the channel post in sync (price drop, title change…).
  syncListingChannel(id);
}

/** Replace the image set for an edited listing (delete-then-insert in one call). */
export async function replaceListingImages(listingId: string, urls: string[]) {
  const { error } = await supabase
    .from("listing_images")
    .delete()
    .eq("listing_id", listingId);
  if (error) throw error;
  if (urls.length === 0) return;
  const { error: insErr } = await supabase
    .from("listing_images")
    .insert(urls.map((url, i) => ({ listing_id: listingId, url, position: i })));
  if (insErr) throw insErr;
}

// ── Sharing & attribution (spec §4) ─────────────────────────────────────

/** Public web URL used in shared listing links (override in .env). */
export const SITE_URL =
  process.env.EXPO_PUBLIC_SITE_URL ?? "https://addisfurnish.vercel.app";

/** Listing link with utm attribution, for the OS share sheet. */
export function shareUrl(listingId: string, source = "mobile"): string {
  return `${SITE_URL}/listing/${listingId}?utm_source=${encodeURIComponent(source)}&utm_medium=share`;
}

/** Record the share for the admin analytics view — never blocks the share. */
export async function trackShare(source: string, listingId?: string | null) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("analytics_events").insert({
      event_name: "listing_shared",
      user_id: data.user?.id ?? null,
      listing_id: listingId ?? null,
      source,
      medium: "share",
    });
  } catch {
    // analytics must never break a share
  }
}

// ── Search suggestions / trending ────────────────────────────────────────

export async function fetchTrendingSearches(limit = 8): Promise<string[]> {
  const { data, error } = await supabase
    .from("search_log")
    .select("query")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? [])
    .map((r) => r.query)
    .filter((q) => (seen.has(q) ? false : (seen.add(q), true)));
}
