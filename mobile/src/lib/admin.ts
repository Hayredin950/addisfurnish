import { supabase } from "./supabase";

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
