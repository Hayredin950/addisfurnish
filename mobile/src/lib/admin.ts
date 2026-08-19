import { supabase } from "./supabase";
import { deleteCloudinaryAssets, fetchTrendingSearches, syncListingChannel } from "./api";

/**
 * Admin-only moderation actions for the mobile app.
 *
 * The web app routes these through server actions backed by a service-role
 * client. Mobile has no server, so every call here relies on the RLS policies
 * and SECURITY DEFINER RPCs that already gate admin work client-side:
 *
 *  - `has_role` / "admin reads all profiles" / "admin updates any profile"
 *  - `admin_notify_user` (notifies any user; gated on the admin role)
 *  - `admin_revoke_sessions` / `admin_set_ban` (SECURITY DEFINER, admin-gated)
 *  - reports / seller_verification_documents / verification_decisions policies
 *
 * The UI is only ever the trigger — the database re-verifies the admin role on
 * every write, exactly as it does for the web server actions.
 */

export async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || data === null || data === undefined) return false;
  return data === true;
}

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

export async function fetchAdminReports(): Promise<AdminReport[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*, listings(title,id), profiles(full_name,shop_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AdminReport[];
}

/** Resolve or dismiss a report and close the loop with the reporter. */
export async function resolveReport(
  report: AdminReport,
  status: "reviewed" | "dismissed",
): Promise<void> {
  const { error } = await supabase.from("reports").update({ status }).eq("id", report.id);
  if (error) throw error;
  if (report.reporter_id) {
    try {
      await supabase.rpc("admin_notify_user", {
        _user_id: report.reporter_id,
        _type: status === "reviewed" ? "report_resolved" : "report_dismissed",
        _payload: {
          title: report.listings?.title ?? report.profiles?.shop_name ?? report.reason,
          ...(report.listings?.id ? { listingId: report.listings.id } : {}),
        },
      });
    } catch {
      // notification must never fail the moderation action
    }
  }
}

export type AdminVerificationDoc = {
  id: string;
  document_type: string;
  file_url: string;
  status: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  seller_id: string;
  profiles?: {
    full_name: string;
    shop_name: string | null;
    shop_slug: string | null;
    phone: string | null;
    city: string | null;
    shop_address: string | null;
    registration_number: string | null;
    created_at: string;
  } | null;
};

export async function fetchVerificationQueue(): Promise<AdminVerificationDoc[]> {
  const { data, error } = await supabase
    .from("seller_verification_documents")
    .select(
      "id,document_type,file_url,status,rejection_reason,reviewed_at,created_at,seller_id," +
        "profiles!seller_verification_documents_seller_id_fkey(full_name,shop_name,shop_slug,phone,city,shop_address,registration_number,created_at)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AdminVerificationDoc[];
}

export type VerificationDecision = {
  id: string;
  action: string;
  reason: string | null;
  created_at: string;
  reviewer_id: string;
  seller_id: string;
  profiles?: { full_name: string } | null;
  seller?: { full_name: string; shop_name: string | null } | null;
};

export async function fetchVerificationDecisions(): Promise<VerificationDecision[]> {
  const { data, error } = await supabase
    .from("verification_decisions")
    .select(
      "id,action,reason,created_at,reviewer_id,seller_id," +
        "profiles!verification_decisions_reviewer_id_fkey(full_name)," +
        "seller:profiles!verification_decisions_seller_id_fkey(full_name,shop_name)",
    )
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data ?? []) as unknown as VerificationDecision[];
}

/**
 * Approve or reject a seller verification document. Mirrors the web server
 * action: flips the document, records the audit-trail row, updates the
 * verified badge on approval, and notifies the seller (in-app + Telegram via
 * the DB trigger on notifications).
 */
export async function decideDocument(
  documentId: string,
  action: "approved" | "rejected",
  reason?: string,
): Promise<void> {
  const { data: doc } = await supabase
    .from("seller_verification_documents")
    .select("id,seller_id,status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.status !== "pending") throw new Error("not_found");

  const reviewerId = (await supabase.auth.getUser()).data.user?.id ?? doc.seller_id;

  const { error: docErr } = await supabase
    .from("seller_verification_documents")
    .update({
      status: action,
      reviewed_at: new Date().toISOString(),
      rejection_reason: action === "rejected" ? reason ?? null : null,
    })
    .eq("id", documentId);
  if (docErr) throw docErr;

  const { error: trailErr } = await supabase.from("verification_decisions").insert({
    seller_id: doc.seller_id,
    document_id: doc.id,
    reviewer_id: reviewerId,
    action,
    reason: action === "rejected" ? (reason ?? null) : null,
  });
  if (trailErr) throw trailErr;

  if (action === "approved") {
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ verified: true })
      .eq("id", doc.seller_id);
    if (profileErr) throw profileErr;
  }

  // `admin_notify_user` is the mobile-safe path (notifications INSERT is not
  // granted to authenticated; the RPC is SECURITY DEFINER and admin-gated).
  try {
    await supabase.rpc("admin_notify_user", {
      _user_id: doc.seller_id,
      _type: action === "approved" ? "seller_verified" : "seller_rejected",
      _payload: { status: action, reason: action === "rejected" ? (reason ?? "") : "" },
    });
  } catch {
    // notification must never fail the moderation action
  }
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
  created_at: string;
  phone: string | null;
  city: string | null;
  banned_until: string | null;
  ban_reason: string | null;
};

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,full_name,shop_name,shop_slug,avatar_url,shop_logo_url,verified,is_seller,created_at,phone,city,banned_until,ban_reason",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminUser[];
}

/** Log the user out of every device (deletes sessions + refresh tokens). */
export async function revokeSessions(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_revoke_sessions", { _user_id: userId });
  if (error) throw error;
}

/**
 * Suspend a user for `hours`. Mirrors the web `adminBanUser`: the profiles
 * mirror drives the admin list display; token rejection comes from the
 * profiles ban columns enforced through the auth layer.
 */
export async function banUser(userId: string, hours: number, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("admin_set_ban", {
    _user_id: userId,
    _until: new Date(Date.now() + hours * 3_600_000).toISOString(),
    _reason: reason ?? null,
  });
  if (error) throw error;
}

export async function unbanUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_set_ban", {
    _user_id: userId,
    _until: null,
    _reason: null,
  });
  if (error) throw error;
}

// ── Categories / Listings / Stats (admin tabs) ────────────────────────────
// All three ride existing RLS: "admins manage categories" (FOR ALL) and the
// listings policies (admin delete) — the same policies the web admin screen
// relies on through its server actions.

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  icon: string | null;
  sort_order: number;
};

export async function fetchAdminCategories(): Promise<AdminCategory[]> {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as AdminCategory[];
}

export async function createCategory(name: string, parentId?: string | null, icon?: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const { error } = await supabase.from("categories").insert({
    name: name.trim(),
    slug,
    parent_id: parentId || null,
    icon: icon || null,
    sort_order: 1,
  });
  if (error) throw error;
}

export async function renameCategory(id: string, name: string, icon?: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const { error } = await supabase
    .from("categories")
    .update({ name: name.trim(), slug, ...(icon !== undefined ? { icon: icon || null } : {}) })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Swap a category's sort_order with the adjacent sibling so the admin can
 * reorder the tree. Siblings = same parent_id, ordered by sort_order.
 */
export async function moveCategory(id: string, direction: "up" | "down") {
  const { data, error } = await supabase
    .from("categories")
    .select("id,parent_id,sort_order")
    .order("sort_order");
  if (error) throw error;
  const all = (data ?? []) as { id: string; parent_id: string | null; sort_order: number }[];
  const row = all.find((c) => c.id === id);
  if (!row) return;
  const siblings = all.filter((c) => c.parent_id === row.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const index = siblings.findIndex((c) => c.id === id);
  const swap = direction === "up" ? siblings[index - 1] : siblings[index + 1];
  if (!swap) return; // already first/last
  await Promise.all([
    supabase.from("categories").update({ sort_order: swap.sort_order }).eq("id", id),
    supabase.from("categories").update({ sort_order: row.sort_order }).eq("id", swap.id),
  ]);
}

/** Active-listing count per category (via the category_listing_counts view). */
export async function fetchAdminCategoryCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("category_listing_counts").select("category_id,listing_count");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { category_id: string | null; listing_count: number | null }[]) {
    if (row.category_id) counts[row.category_id] = Number(row.listing_count ?? 0);
  }
  return counts;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export type AdminListing = {
  id: string;
  title: string;
  price: number;
  status: string;
  city: string | null;
  featured: boolean;
  created_at: string;
  seller_id: string;
  listing_images: { url: string }[];
  profiles?: { full_name: string; shop_name: string | null; shop_slug: string | null } | null;
};

export async function fetchAdminListings(): Promise<AdminListing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id,title,price,status,city,featured,created_at,seller_id,listing_images(url),profiles(full_name,shop_name,shop_slug)",
    )
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as unknown as AdminListing[];
}

export async function toggleFeatured(id: string, featured: boolean) {
  const { error } = await supabase.from("listings").update({ featured }).eq("id", id);
  if (error) throw error;
}

export async function deleteListingAdmin(id: string) {
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
  // Cloudinary assets (photos + showcase videos) follow the listing.
  await deleteCloudinaryAssets(allUrls);
}

export type AdminStats = {
  listings: number;
  users: number;
  sellers: number;
  verifiedSellers: number;
  totalViews: number;
  topSearches: string[];
  activeListings: number;
  soldListings: number;
  otherListings: number;
  featuredListings: number;
  conversations: number;
  messages: number;
  reviews: number;
  newListings7d: number;
  newUsers7d: number;
  // Telegram integration health (spec §19 monitoring gap).
  telegramSends7d: number;
  telegramOk7d: number;
  telegramFailures7d: number;
  telegramFailureReasons: string[];
  telegramLinkedUsers: number;
  telegramBlockedUsers: number;
  telegramChannelPosts: number;
  telegramProcessedUpdates: number;
};

export async function fetchAdminStats(): Promise<AdminStats> {
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
    fetchTrendingSearches(6),
    supabase.from("listings").select("status"),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("featured", true),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
    supabase.from("reviews").select("id", { count: "exact", head: true }),
    supabase.from("listings").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    // ── Telegram integration health (spec §19 monitoring gap) ──
    supabase
      .from("telegram_delivery_log")
      .select("ok,error")
      .gte("created_at", weekAgo),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("telegram_chat_id", "is", null),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("telegram_blocked", true),
    supabase.from("telegram_channel_posts").select("listing_id", { count: "exact", head: true }),
    supabase.from("telegram_processed_updates").select("update_id", { count: "exact", head: true }),
  ]);
  const totalViews = (views.data ?? []).reduce(
    (sum: number, l: { view_count: number }) => sum + (l.view_count ?? 0),
    0,
  );
  const statusCounts: Record<string, number> = {};
  for (const l of (statuses.data ?? []) as { status: string }[]) {
    statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;
  }
  const total = listings.count ?? 0;
  return {
    listings: total,
    users: users.count ?? 0,
    sellers: sellers.count ?? 0,
    verifiedSellers: verified.count ?? 0,
    totalViews,
    topSearches: trending,
    activeListings: statusCounts["active"] ?? 0,
    soldListings: statusCounts["sold"] ?? 0,
    otherListings: total - (statusCounts["active"] ?? 0) - (statusCounts["sold"] ?? 0),
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
          .filter((r: { ok: boolean; error: string | null }) => !r.ok && r.error)
          .map((r: { error: string | null }) => [r.error as string, r.error as string]),
      ).keys(),
    ].slice(0, 3),
    telegramLinkedUsers: telegramLinked.count ?? 0,
    telegramBlockedUsers: telegramBlocked.count ?? 0,
    telegramChannelPosts: telegramChannelPosts.count ?? 0,
    telegramProcessedUpdates: telegramProcessed.count ?? 0,
  };
}

export type TrendDay = {
  date: string;
  label: string;
  listings: number;
  users: number;
  messages: number;
  views: number;
};

/** Daily activity series for the admin trend chart (zero-filled, like web). */
export async function fetchAdminTrend(days: number): Promise<TrendDay[]> {
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
  const label = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
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
}

/** Top search terms with counts, this week (bars, web parity). */
export async function fetchAdminTopSearches(): Promise<{ name: string; count: number }[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("search_log")
    .select("query")
    .gte("created_at", weekAgo);
  if (error) throw error;
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
}

export async function fetchAdminTopCategories(): Promise<{ name: string; count: number }[]> {
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
}
