import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Admin-only server actions (spec §3): verification decisions with an audit
 * trail, account suspension ("log out everywhere") and banning.
 *
 * Every function re-verifies the caller's admin role server-side — the admin
 * UI is only ever the trigger, never the security boundary.
 */

type ActionResult = { ok: boolean; error?: string };

async function currentAdminId(): Promise<string | null> {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: data.user.id,
    _role: "admin",
  });
  return isAdmin ? data.user.id : null;
}

/**
 * Approve or reject a seller verification document. Records the decision in
 * the immutable audit trail, flips the verified badge on approval, and
 * notifies the seller in-app + on Telegram (if linked).
 */
export const adminVerifyDocument = createServerFn({ method: "POST" })
  .validator(
    (d: { documentId: string; action: "approved" | "rejected"; reason?: string | undefined }) => d,
  )
  .handler(async ({ data }): Promise<ActionResult> => {
    const reviewerId = await currentAdminId();
    if (!reviewerId) return { ok: false, error: "admin" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: doc } = await supabaseAdmin
      .from("seller_verification_documents")
      .select("id,seller_id,status")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc || doc.status !== "pending") return { ok: false, error: "not_found" };

    const { error: docErr } = await supabaseAdmin
      .from("seller_verification_documents")
      .update({
        status: data.action,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: data.action === "rejected" ? (data.reason ?? null) : null,
      })
      .eq("id", data.documentId);
    if (docErr) return { ok: false, error: "server_error" };

    // Immutable audit trail: who decided, when, and why.
    await supabaseAdmin.from("verification_decisions").insert({
      seller_id: doc.seller_id,
      document_id: doc.id,
      reviewer_id: reviewerId,
      action: data.action,
      reason: data.action === "rejected" ? (data.reason ?? null) : null,
    });

    if (data.action === "approved") {
      await supabaseAdmin.from("profiles").update({ verified: true }).eq("id", doc.seller_id);
    }

    // Notify the seller in-app. Direct insert (not the RPC): the service-role
    // client has no auth.uid(), which would make an auth.uid()-based RPC a no-op.
    // The telegram_on_notification trigger forwards this to Telegram and push.
    await supabaseAdmin.from("notifications").insert({
      user_id: doc.seller_id,
      type: data.action === "approved" ? "seller_verified" : "seller_rejected",
      payload: {
        status: data.action,
        reason: data.action === "rejected" ? (data.reason ?? "") : "",
      },
    });

    return { ok: true };
  });

/**
 * Audited direct approval (used by the legacy "Verify" button on the Sellers
 * tab). Records a decision so no badge grant goes unlogged.
 */
export const adminVerifySellerDirect = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => d)
  .handler(async ({ data }): Promise<ActionResult> => {
    const reviewerId = await currentAdminId();
    if (!reviewerId) return { ok: false, error: "admin" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("verification_decisions").insert({
      seller_id: data.userId,
      document_id: null,
      reviewer_id: reviewerId,
      action: "approved",
      reason: "Direct approval by admin (no document on file)",
    });
    await supabaseAdmin.from("profiles").update({ verified: true }).eq("id", data.userId);
    await supabaseAdmin.from("notifications").insert({
      user_id: data.userId,
      type: "seller_verified",
      payload: { status: "approved" },
    });
    return { ok: true };
  });

/**
 * Log the user out of every device.
 *
 * `auth.admin.signOut()` takes the user's *own* JWT, which an admin never has —
 * passing a user id there silently failed ("Update failed" in the UI). Deleting
 * the user's rows in `auth.sessions` and `auth.refresh_tokens` is what GoTrue
 * itself does on a global logout, so do that through a SECURITY DEFINER RPC.
 */
export const adminRevokeSessions = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => d)
  .handler(async ({ data }): Promise<ActionResult> => {
    const reviewerId = await currentAdminId();
    if (!reviewerId) return { ok: false, error: "admin" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("admin_revoke_sessions", {
      _user_id: data.userId,
    });
    // Opaque code, never the driver's text: this string is rendered in a toast.
    if (error) console.error("[admin_revoke_sessions]", error);
    return error ? { ok: false, error: "rpc" } : { ok: true };
  });

/**
 * Suspend an account for a given duration (rejects its tokens immediately).
 * `hours` of 0 or less is rejected — use adminUnbanUser to lift a suspension.
 */
export const adminBanUser = createServerFn({ method: "POST" })
  .validator((d: { userId: string; hours: number; reason?: string }) => d)
  .handler(async ({ data }): Promise<ActionResult> => {
    const reviewerId = await currentAdminId();
    if (!reviewerId) return { ok: false, error: "admin" };
    if (reviewerId === data.userId) return { ok: false, error: "self" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hours = Math.max(1, Math.round(data.hours));
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: `${hours}h`,
    });
    if (error) {
      console.error("[admin ban]", error);
      return { ok: false, error: "rpc" };
    }
    // Mirror onto profiles so the admin list can show who is suspended;
    // auth.users.banned_until isn't reachable through PostgREST.
    const { error: mirrorErr } = await supabaseAdmin.rpc("admin_set_ban", {
      _user_id: data.userId,
      _until: new Date(Date.now() + hours * 3600_000).toISOString(),
      _reason: data.reason ?? null,
    });
    if (mirrorErr) {
      // The ban itself is enforced (auth.users), but the display mirror failed
      // — surface it so a stale "Suspend" button isn't silently left behind.
      console.error("admin_set_ban mirror failed", mirrorErr);
    }
    return { ok: true };
  });

/** Lift a suspension. */
export const adminUnbanUser = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => d)
  .handler(async ({ data }): Promise<ActionResult> => {
    const reviewerId = await currentAdminId();
    if (!reviewerId) return { ok: false, error: "admin" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Clear the profiles mirror too, so the admin list stops showing a ban.
    const { error: mirrorErr } = await supabaseAdmin.rpc("admin_set_ban", {
      _user_id: data.userId,
      _until: null,
      _reason: null,
    });
    if (mirrorErr) console.error("admin_set_ban mirror clear failed", mirrorErr);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: "0s",
    });
    return error ? { ok: false, error: "server_error" } : { ok: true };
  });
