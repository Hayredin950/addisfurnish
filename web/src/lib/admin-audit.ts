import { supabase } from "@/integrations/supabase/client";

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
};

/**
 * Records an admin action in `admin_audit_log` (spec §21). Fire-and-forget:
 * a failed audit write must never block the action it documents, but it is
 * surfaced to the console so gaps are noticeable during development.
 */
export async function logAdminAction(input: AuditInput): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const adminId = data.user?.id;
    if (!adminId) return;

    const { error } = await supabase.from("admin_audit_log").insert({
      admin_user_id: adminId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      reason: input.reason ?? null,
    });
    if (error) throw error;
  } catch (error) {
    console.error("[audit] failed to record admin action", error);
  }
}
