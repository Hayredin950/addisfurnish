import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, LogOut, Mail, Search as SearchIcon, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { UserAvatar } from "@/components/UserAvatar";
import { BanDialog } from "@/components/admin/BanDialog";
import {
  adminReviewEmailChange,
  adminSetUserEmail,
  emailChangeQueueQuery,
  type AdminUser,
} from "@/lib/marketplace";
import { adminBanUser, adminRevokeSessions, adminUnbanUser } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RoleKey = "admin" | "moderator" | "verification" | "category_manager" | "analytics";

const ADMIN_ROLES: RoleKey[] = [
  "moderator",
  "verification",
  "category_manager",
  "analytics",
  "admin",
];

/**
 * Super-administration of individual accounts: assign/revoke roles, change
 * sign-in email (queue + direct), revoke sessions, and suspend/lift.
 * Lives in the Settings tab (super admin only). The Users tab stays a
 * read-only directory.
 */
export function UserAccessManager({
  users,
  onChanged,
}: {
  users: AdminUser[];
  onChanged: () => void;
}) {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const roleName = (role: RoleKey) =>
    role === "admin"
      ? t("admin.roleAdmin")
      : role === "moderator"
        ? t("admin.roleModerator")
        : role === "verification"
          ? t("admin.roleVerification")
          : role === "category_manager"
            ? t("admin.roleCategoryManager")
            : t("admin.roleAnalytics");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => users.find((u) => u.id === selectedId) ?? null,
    [users, selectedId],
  );

  // Keep the selected user in sync if the underlying list refreshes/removes him.
  useEffect(() => {
    if (selectedId && !users.some((u) => u.id === selectedId)) setSelectedId(null);
  }, [users, selectedId]);

  // ── Email changes (queue + direct) ────────────────────────────────────
  const { data: emailQueue } = useQuery(emailChangeQueueQuery());
  const [emailTarget, setEmailTarget] = useState<{
    id: string;
    name: string;
    current: string | null;
  } | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [emailReason, setEmailReason] = useState("");
  const [rejectTarget, setRejectTarget] = useState<{ id: string; email: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const emailError = (code: string | undefined) =>
    code === "invalid_email"
      ? t("error.emailInvalid")
      : code === "email_taken"
        ? t("error.emailTaken")
        : code === "unchanged"
          ? t("error.emailUnchanged")
          : t("admin.emailChangeFailed");

  const refreshEmailQueue = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-email-change-queue"] });
    queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
  };

  const approveEmail = async (id: string) => {
    setBusy(true);
    const res = await adminReviewEmailChange(id, true);
    setBusy(false);
    if (!res.ok) {
      toast.error(emailError(res.error));
      return;
    }
    toast.success(t("admin.emailApplied"));
    refreshEmailQueue();
    onChanged();
  };

  const rejectEmail = async () => {
    if (!rejectTarget) return;
    setBusy(true);
    const res = await adminReviewEmailChange(rejectTarget.id, false, rejectReason.trim());
    setBusy(false);
    if (!res.ok) {
      toast.error(emailError(res.error));
      return;
    }
    toast.success(t("admin.emailRejected"));
    setRejectTarget(null);
    setRejectReason("");
    refreshEmailQueue();
    onChanged();
  };

  const applyDirectEmail = async () => {
    if (!emailTarget || !emailValue.trim()) return;
    setBusy(true);
    const res = await adminSetUserEmail(emailTarget.id, emailValue.trim(), emailReason.trim());
    setBusy(false);
    if (!res.ok) {
      toast.error(emailError(res.error));
      return;
    }
    toast.success(t("admin.emailApplied"));
    setEmailTarget(null);
    setEmailValue("");
    setEmailReason("");
    refreshEmailQueue();
    onChanged();
  };

  // ── Suspension ────────────────────────────────────────────────────────
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);

  const confirmBan = async (hours: number, reason: string) => {
    if (!banTarget) return;
    setBusy(true);
    const res = await adminBanUser({ data: { userId: banTarget.id, hours, reason } });
    setBusy(false);
    if (!res.ok) {
      toast.error(friendlyError(res.error, t, "toast.updateFailed"));
      return;
    }
    toast.success(t("admin.banned"));
    void logAdminAction({
      action: "user_suspended",
      entityType: "user",
      entityId: banTarget.id,
      newValue: { hours, reason },
    });
    setBanTarget(null);
    queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    onChanged();
  };

  const unban = async (id: string) => {
    const res = await adminUnbanUser({ data: { userId: id } });
    if (!res.ok) {
      toast.error(friendlyError(res.error, t, "toast.updateFailed"));
      return;
    }
    toast.success(t("admin.unbanned"));
    void logAdminAction({ action: "user_restored", entityType: "user", entityId: id });
    queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    onChanged();
  };

  const revoke = async (id: string) => {
    const res = await adminRevokeSessions({ data: { userId: id } });
    if (!res.ok) {
      toast.error(friendlyError(res.error, t, "toast.updateFailed"));
      return;
    }
    toast.success(t("admin.sessionsRevoked"));
    void logAdminAction({ action: "sessions_revoked", entityType: "user", entityId: id });
    onChanged();
  };

  // ── Roles (email-code confirmed) ──────────────────────────────────────
  const [roleTarget, setRoleTarget] = useState<{
    id: string;
    name: string;
    action: "grant" | "revoke";
    role: RoleKey;
  } | null>(null);
  const [roleCodeSent, setRoleCodeSent] = useState(false);
  const [roleCode, setRoleCode] = useState("");

  const requestRoleChange = async () => {
    if (!roleTarget) return;
    if (roleTarget.id === user?.id) {
      toast.error(t("admin.roleChangeSelf"));
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_request_role_change", {
      _target_user_id: roleTarget.id,
      _role: roleTarget.role,
      _action: roleTarget.action,
    });
    setBusy(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      const err = (data as { error?: string } | null)?.error ?? error?.message;
      toast.error(
        err === "super_admin"
          ? t("admin.superAdminProtected")
          : err === "self" || err === "self_demote"
            ? t("admin.roleChangeSelf")
            : err === "no_email"
              ? t("admin.roleChangeNoEmail")
              : err === "already_role"
                ? t("admin.roleChangeAlreadyRole")
                : t("admin.roleChangeFailed"),
      );
      return;
    }
    toast.success(t("admin.roleChangeEmailSent"));
    setRoleCodeSent(true);
  };

  const confirmRoleChange = async () => {
    if (!roleTarget || roleCode.length !== 6) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_confirm_role_change", {
      _code: roleCode,
    });
    setBusy(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      const err = (data as { error?: string } | null)?.error ?? error?.message;
      toast.error(
        err === "expired"
          ? t("admin.roleChangeExpired")
          : err === "invalid"
            ? t("admin.roleChangeInvalidCode")
            : err === "super_admin"
              ? t("admin.superAdminProtected")
              : err === "self" || err === "self_demote"
                ? t("admin.roleChangeSelf")
                : t("admin.roleChangeFailed"),
      );
      return;
    }
    toast.success(
      roleTarget.action === "grant" ? t("admin.roleChangeSuccess") : t("admin.roleChangeRemoved"),
    );
    void logAdminAction({
      action: roleTarget.action === "grant" ? "role_granted" : "role_revoked",
      entityType: "user",
      entityId: roleTarget.id,
      newValue: { role: roleTarget.role, confirmedViaEmailCode: true },
    });
    setRoleTarget(null);
    setRoleCodeSent(false);
    setRoleCode("");
    queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    onChanged();
  };

  const term = search.trim().toLowerCase();
  const pickable = users
    .filter((u) =>
      !term
        ? true
        : [u.full_name, u.shop_name, u.phone, u.city, u.email]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(term)),
    )
    .slice(0, 25);

  const ownedRole = selected
    ? ((selected.role_names ?? []).find((r) =>
        ["admin", "moderator", "verification", "category_manager", "analytics"].includes(r),
      ) as RoleKey | undefined)
    : undefined;
  const suspended = !!selected?.banned_until && new Date(selected.banned_until) > new Date();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedId(null);
            }}
            placeholder={t("admin.searchUsers")}
            className="h-9 pl-8"
          />
        </div>
        {selected ? (
          <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
            {t("admin.clearSelection")}
          </Button>
        ) : null}
      </div>

      {!selected ? (
        pickable.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noUsers")}</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border bg-card p-1.5">
            {pickable.map((u) => {
              const name = u.shop_name ?? u.full_name;
              const roles = (u.role_names ?? []).filter((r) => r !== "user") as RoleKey[];
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setSelectedId(u.id);
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <UserAvatar name={name} avatarUrl={u.shop_logo_url ?? u.avatar_url} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {u.email}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {u.is_super_admin ? (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {t("admin.roleSuperAdmin")}
                        </span>
                      ) : roles.length ? (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {roleName(roles[0] as RoleKey)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {u.is_seller ? t("admin.roleSeller") : t("admin.roleBuyer")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <UserAvatar
                name={selected.shop_name ?? selected.full_name}
                avatarUrl={selected.shop_logo_url ?? selected.avatar_url}
                size={44}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {selected.shop_name ?? selected.full_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">{selected.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {selected.phone ?? "—"} · {selected.city ?? "—"} · {timeAgo(selected.created_at)}
                </p>
              </div>
            </div>
            {suspended ? (
              <p className="text-xs font-medium text-destructive">
                {t("admin.suspendedUntil", {
                  date: new Date(selected.banned_until!).toLocaleString(),
                })}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {selected.is_super_admin || selected.id === user?.id ? null : ownedRole ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setRoleTarget({
                    id: selected.id,
                    name: selected.full_name,
                    action: "revoke",
                    role: ownedRole,
                  })
                }
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" /> {t("admin.revokeRole")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setRoleTarget({
                    id: selected.id,
                    name: selected.full_name,
                    action: "grant",
                    role: "moderator",
                  })
                }
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" /> {t("admin.grantRole")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => revoke(selected.id)}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> {t("admin.revokeSessions")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEmailTarget({
                  id: selected.id,
                  name: selected.shop_name ?? selected.full_name,
                  current: selected.email ?? null,
                });
                setEmailValue("");
                setEmailReason("");
              }}
            >
              <Mail className="mr-1.5 h-3.5 w-3.5" /> {t("admin.emailChangeUser")}
            </Button>
            {suspended ? (
              <Button size="sm" variant="outline" onClick={() => unban(selected.id)}>
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> {t("admin.unban")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={selected.id === user?.id}
                onClick={() =>
                  setBanTarget({ id: selected.id, name: selected.shop_name ?? selected.full_name })
                }
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" /> {t("admin.ban")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Pending email-change requests */}
      {emailQueue && emailQueue.length > 0 ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-center gap-2 font-display text-sm font-semibold">
            <Mail className="h-4 w-4 text-primary" /> {t("admin.emailQueue")} ({emailQueue.length})
          </p>
          <ul className="mt-3 space-y-2">
            {emailQueue.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {r.profiles?.shop_name ?? r.profiles?.full_name ?? "—"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("admin.emailQueueFrom", { old: r.old_email ?? "—", new: r.new_email })}
                  </p>
                  {r.reason ? <p className="mt-1 text-xs italic">{r.reason}</p> : null}
                  <p className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" disabled={busy} onClick={() => approveEmail(r.id)}>
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> {t("admin.emailApprove")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => {
                      setRejectTarget({ id: r.id, email: r.new_email });
                      setRejectReason("");
                    }}
                  >
                    {t("admin.emailReject")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <BanDialog
        open={!!banTarget}
        onOpenChange={(open) => {
          if (!open) setBanTarget(null);
        }}
        onConfirm={confirmBan}
        subjectName={banTarget?.name ?? ""}
        pending={busy}
      />

      {/* Role grant/revoke (email-code confirmed) */}
      <AlertDialog
        open={!!roleTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRoleTarget(null);
            setRoleCodeSent(false);
            setRoleCode("");
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {roleCodeSent
                ? t("admin.roleChangeEnterCode")
                : roleTarget?.action === "grant"
                  ? t("admin.grantTitle")
                  : t("admin.revokeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {roleCodeSent
                ? t("admin.roleChangeCodeHint")
                : roleTarget?.action === "grant"
                  ? t("admin.grantBody")
                  : t("admin.revokeBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {roleTarget?.action === "grant" && !roleCodeSent ? (
            <div className="space-y-2">
              <Label>{t("admin.selectRole")}</Label>
              <Select
                value={roleTarget.role}
                onValueChange={(v) =>
                  setRoleTarget((prev) => (prev ? { ...prev, role: v as RoleKey } : prev))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("admin.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleName(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {roleCodeSent && (
            <div className="flex justify-center py-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
                placeholder="000000"
                className="w-48 rounded-md border border-input bg-background px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={busy}>{t("admin.cancel")}</AlertDialogCancel>
            {roleCodeSent ? (
              <AlertDialogAction
                disabled={busy || roleCode.length !== 6}
                onClick={(e) => {
                  e.preventDefault();
                  confirmRoleChange();
                }}
                className="bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                {busy ? t("admin.roleChangeVerifying") : t("admin.roleChangeConfirmCode")}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  requestRoleChange();
                }}
                className="bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                {busy ? t("admin.roleChangeSending") : t("admin.roleChangeSendCode")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject a queued email request */}
      <AlertDialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">{t("admin.emailReject")}</AlertDialogTitle>
            <AlertDialogDescription>{rejectTarget?.email}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="email-reject-reason">{t("admin.emailRejectReason")}</Label>
            <Textarea
              id="email-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={busy}>{t("admin.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                rejectEmail();
              }}
              className="bg-destructive text-white shadow-sm hover:bg-destructive/90"
            >
              {t("admin.emailReject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change an address directly */}
      <AlertDialog
        open={!!emailTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEmailTarget(null);
            setEmailValue("");
            setEmailReason("");
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {t("admin.emailChangeUser")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.emailChangeUserBody", {
                name: emailTarget?.name ?? "",
                email: emailTarget?.current ?? "—",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-new-email">{t("profile.emailChangeNew")}</Label>
              <Input
                id="admin-new-email"
                type="email"
                autoComplete="off"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-email-reason">{t("profile.emailChangeReason")}</Label>
              <Textarea
                id="admin-email-reason"
                value={emailReason}
                onChange={(e) => setEmailReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={busy}>{t("admin.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !emailValue.trim()}
              onClick={(e) => {
                e.preventDefault();
                applyDirectEmail();
              }}
              className="bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              {t("admin.emailChangeUser")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
