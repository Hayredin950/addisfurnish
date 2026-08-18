import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  Ban,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Eye,
  FileCheck2,
  FileText,
  Flag,
  FolderTree,
  LayoutList,
  LogOut,
  Mail,
  MessageSquare,
  Pencil,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminAllUsersQuery,
  adminListingsQuery,
  adminReportsQuery,
  adminStatsQuery,
  adminTopCategoriesQuery,
  adminTrendQuery,
  adminVerificationDecisionsQuery,
  adminVerificationQueueQuery,
  categoriesQuery,
  categoryCountsQuery,
  isAdminQuery,
  type Category,
} from "@/lib/marketplace";
import { CATEGORY_ICON_KEYS, categoryIcon } from "@/lib/category-icons";
import {
  adminBanUser,
  adminRevokeSessions,
  adminUnbanUser,
  adminVerifyDocument,
} from "@/lib/admin";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { RequireAuth } from "@/components/RequireAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { ListingImage } from "@/components/ListingImage";
import { BanDialog } from "@/components/admin/BanDialog";
import { DocumentViewer } from "@/components/admin/DocumentViewer";
import { deleteCloudinaryAssets, useImageUrl } from "@/lib/storage";
import { timeAgo, formatBirr } from "@/lib/format";
import { syncListingChannel } from "@/lib/telegram";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — AddisFurnish" },
      { name: "description", content: "Moderate reports, verify sellers and view platform stats." },
      { property: "og:title", content: "Admin — AddisFurnish" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AdminPage />
    </RequireAuth>
  ),
});

function AdminPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const { data: isAdmin, isLoading: checking } = useQuery(isAdminQuery(user?.id));
  const [tab, setTab] = useState("reports");
  const [drill, setDrill] = useState<"all" | "sellers" | null>(null);

  if (checking) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm text-muted-foreground">
        {t("browse.loading")}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-2xl font-semibold">{t("admin.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("admin.denied")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{t("admin.title")}</h1>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="reports">{t("admin.reports")}</TabsTrigger>
          <TabsTrigger value="users">{t("admin.users")}</TabsTrigger>
          <TabsTrigger value="verification">
            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> {t("admin.verification")}
          </TabsTrigger>
          <TabsTrigger value="categories">
            <FolderTree className="mr-1.5 h-3.5 w-3.5" /> {t("nav.categories")}
          </TabsTrigger>
          <TabsTrigger value="listings">
            <LayoutList className="mr-1.5 h-3.5 w-3.5" /> Listings
          </TabsTrigger>
          <TabsTrigger value="stats">{t("admin.stats")}</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UsersTab drillFilter={drill} />
        </TabsContent>
        <TabsContent value="verification" className="mt-6">
          <VerificationTab />
        </TabsContent>
        <TabsContent value="categories" className="mt-6">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="listings" className="mt-6">
          <ListingsTab />
        </TabsContent>
        <TabsContent value="stats" className="mt-6">
          <StatsTab
            onOpenUsers={(f) => {
              setDrill(f);
              setTab("users");
            }}
            onOpenListings={() => setTab("listings")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportsTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: reports } = useQuery(adminReportsQuery());

  const resolve = async (id: string, status: "reviewed" | "dismissed") => {
    const report = (reports ?? []).find((r) => r.id === id);
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Close the loop with whoever reported it — they never heard back before.
    if (report?.reporter_id) {
      await supabase.rpc("admin_notify_user", {
        _user_id: report.reporter_id,
        _type: status === "reviewed" ? "report_resolved" : "report_dismissed",
        _payload: {
          title: report.listings?.title ?? report.profiles?.shop_name ?? report.reason,
          ...(report.listings?.id ? { listingId: report.listings.id } : {}),
        },
      });
    }
    toast.success(t("admin.reporterNotified"));
    queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
  };

  if (!reports || reports.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("admin.noReports")}</p>;
  }

  return (
    <ul className="space-y-3">
      {reports.map((r) => (
        <li key={r.id} className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Flag className="h-3.5 w-3.5 text-destructive" />
                {r.listings?.title ?? r.profiles?.shop_name ?? r.profiles?.full_name ?? r.reason}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("report.reason")}: {r.reason} · {timeAgo(r.created_at)}
              </p>
              {r.details ? <p className="mt-1 text-sm text-muted-foreground">{r.details}</p> : null}
              {r.listings ? (
                <Link
                  to="/listing/$id"
                  params={{ id: r.listings.id }}
                  className="mt-1 inline-block text-xs text-primary"
                >
                  {t("listing.back")}
                </Link>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={() => resolve(r.id, "dismissed")}>
                {t("admin.dismiss")}
              </Button>
              <Button size="sm" onClick={() => resolve(r.id, "reviewed")}>
                {t("admin.resolved")}
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Every account, with suspension controls. */
function UsersTab({ drillFilter }: { drillFilter: "all" | "sellers" | null }) {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "sellers" | "buyers">("all");
  // Stats-tab drill-down: "Verified sellers" opens this tab pre-filtered.
  useEffect(() => {
    if (drillFilter) setFilter(drillFilter);
  }, [drillFilter]);
  const [search, setSearch] = useState("");
  const { data: users } = useQuery(adminAllUsersQuery(filter));
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);
  const [roleTarget, setRoleTarget] = useState<{
    id: string;
    name: string;
    action: "promote" | "demote";
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const term = search.trim().toLowerCase();
  const visible = (users ?? []).filter((u) =>
    !term
      ? true
      : [u.full_name, u.shop_name, u.phone, u.city]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(term)),
  );

  const confirmBan = async (hours: number, reason: string) => {
    if (!banTarget) return;
    setBusy(true);
    const res = await adminBanUser({ data: { userId: banTarget.id, hours, reason } });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? t("toast.updateFailed"));
      return;
    }
    toast.success(t("admin.banned"));
    setBanTarget(null);
    queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
  };

  const unban = async (id: string) => {
    const res = await adminUnbanUser({ data: { userId: id } });
    if (!res.ok) {
      toast.error(res.error ?? t("toast.updateFailed"));
      return;
    }
    toast.success(t("admin.unbanned"));
    queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
  };

  const revoke = async (id: string) => {
    const res = await adminRevokeSessions({ data: { userId: id } });
    if (!res.ok) {
      toast.error(res.error ?? t("toast.updateFailed"));
      return;
    }
    toast.success(t("admin.sessionsRevoked"));
  };

  const [roleCodeSent, setRoleCodeSent] = useState(false);
  const [roleCode, setRoleCode] = useState("");

  // Step 1: send the 6-digit code to the acting admin's email.
  const requestRoleChange = async () => {
    if (!roleTarget) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_request_role_change", {
      _target_user_id: roleTarget.id,
      _action: roleTarget.action,
    });
    setBusy(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      const err = (data as { error?: string } | null)?.error ?? error?.message;
      toast.error(
        err === "super_admin"
          ? t("admin.superAdminProtected")
          : err === "no_email"
            ? t("admin.roleChangeNoEmail")
            : err === "already_admin"
              ? t("admin.roleChangeAlreadyAdmin")
              : err === "not_admin"
                ? t("admin.roleChangeNotAdmin")
                : t("admin.roleChangeFailed"),
      );
      return;
    }
    toast.success(t("admin.roleChangeEmailSent"));
    setRoleCodeSent(true);
  };

  // Step 2: verify the code and apply the role change.
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
              : t("admin.roleChangeFailed"),
      );
      return;
    }
    toast.success(
      roleTarget.action === "promote"
        ? t("admin.roleChangeSuccess")
        : t("admin.roleChangeRemoved"),
    );
    setRoleTarget(null);
    setRoleCodeSent(false);
    setRoleCode("");
    queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "sellers", "buyers"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "all"
              ? t("admin.users")
              : f === "sellers"
                ? t("admin.roleSeller")
                : t("admin.roleBuyer")}
          </Button>
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.searchUsers")}
          className="h-9 max-w-xs"
        />
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("admin.noUsers")}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visible.map((u) => {
            const suspended = !!u.banned_until && new Date(u.banned_until) > new Date();
            const name = u.shop_name ?? u.full_name;
            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={name} avatarUrl={u.shop_logo_url ?? u.avatar_url} size={36} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {name}
                      {u.verified ? <BadgeCheck className="h-3.5 w-3.5 text-primary" /> : null}
                      {(u.user_roles ?? []).some((r: { role: string }) => r.role === "admin") ? (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {u.is_super_admin ? t("admin.roleSuperAdmin") : t("admin.roleAdmin")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          {u.is_seller ? t("admin.roleSeller") : t("admin.roleBuyer")}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.phone ?? "—"} · {u.city ?? "—"} · {timeAgo(u.created_at)}
                    </p>
                    {suspended ? (
                      <p className="text-xs font-medium text-destructive">
                        {t("admin.suspendedUntil", {
                          date: new Date(u.banned_until!).toLocaleString(),
                        })}
                        {u.ban_reason ? ` — ${u.ban_reason}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {u.shop_slug ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/shop/$slug" params={{ slug: u.shop_slug }}>
                        {t("listing.visitShop")}
                      </Link>
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => revoke(u.id)}>
                    <LogOut className="mr-1.5 h-3.5 w-3.5" /> {t("admin.revokeSessions")}
                  </Button>
                  {/* Promote / demote admin — the change requires email confirmation. */}
                  {!u.is_super_admin && (u.user_roles ?? []).some((r: { role: string }) => r.role === "admin") ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRoleTarget({ id: u.id, name, action: "demote" })}
                    >
                      <Mail className="mr-1.5 h-3.5 w-3.5" /> {t("admin.removeAdmin")}
                    </Button>
                  ) : null}
                  {!u.is_super_admin && !(u.user_roles ?? []).some((r: { role: string }) => r.role === "admin") ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRoleTarget({ id: u.id, name, action: "promote" })}
                    >
                      <Mail className="mr-1.5 h-3.5 w-3.5" /> {t("admin.makeAdmin")}
                    </Button>
                  ) : null}
                  {/* Only ONE of suspend / lift-suspend per user — a suspended
                      account shows "Lift suspension", an active one shows
                      "Suspend". (The profiles mirror is written by the same
                      admin action, so it cannot lag behind.) */}
                  {suspended ? (
                    <Button size="sm" variant="outline" onClick={() => unban(u.id)}>
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> {t("admin.unban")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      // An admin banning themselves would lock them out.
                      disabled={u.id === user?.id}
                      onClick={() => setBanTarget({ id: u.id, name })}
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" /> {t("admin.ban")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BanDialog
        open={!!banTarget}
        onOpenChange={(open) => {
          if (!open) setBanTarget(null);
        }}
        onConfirm={confirmBan}
        subjectName={banTarget?.name ?? ""}
        pending={busy}
      />

      {/* Code-based confirm dialog for admin promote/demote */}
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
                : roleTarget?.action === "promote"
                  ? t("admin.promoteTitle")
                  : t("admin.demoteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {roleCodeSent
                ? t("admin.roleChangeCodeHint")
                : roleTarget?.action === "promote"
                  ? t("admin.promoteBody")
                  : t("admin.demoteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>

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
    </>
  );
}

function VerificationTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: queue } = useQuery(adminVerificationQueueQuery());
  const { data: decisions } = useQuery(adminVerificationDecisionsQuery());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-verification-queue"] });
    queryClient.invalidateQueries({ queryKey: ["admin-verification-decisions"] });
    queryClient.invalidateQueries({ queryKey: ["admin-sellers"] });
  };

  const decide = async (documentId: string, action: "approved" | "rejected", reason?: string) => {
    setBusy(true);
    const res = await adminVerifyDocument({ data: { documentId, action, reason } });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(action === "approved" ? t("admin.verifiedOk") : t("admin.rejectedOk"));
    setRejecting(null);
    setRejectReason("");
    invalidate();
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <FileCheck2 className="h-5 w-5 text-primary" /> {t("admin.queue")}
        </p>
        {!queue || queue.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.queueEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {queue.map((doc) => (
              <VerificationRow
                key={doc.id}
                doc={doc}
                busy={busy}
                rejecting={rejecting === doc.id}
                reason={rejectReason}
                onReason={setRejectReason}
                onStartReject={() => {
                  setRejecting(doc.id);
                  setRejectReason("");
                }}
                onCancelReject={() => setRejecting(null)}
                onApprove={() => decide(doc.id, "approved")}
                onReject={() => decide(doc.id, "rejected", rejectReason)}
              />
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <ClipboardCheck className="h-5 w-5 text-primary" /> {t("admin.auditTrail")}
        </p>
        {!decisions || decisions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.auditEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {decisions.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {d.seller?.shop_name ?? d.seller?.full_name ?? d.seller_id}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs capitalize ${
                        d.action === "approved"
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {d.action}
                    </span>
                  </p>
                  {d.reason ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{d.reason}</p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.by")} {d.profiles?.full_name ?? d.reviewer_id} · {timeAgo(d.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const ADMIN_DOC_TYPE_KEY: Record<
  string,
  "verif.docTypenational_id" | "verif.docTypebusiness_license" | "verif.docTypeother"
> = {
  national_id: "verif.docTypenational_id",
  business_license: "verif.docTypebusiness_license",
  other: "verif.docTypeother",
};

function VerificationRow({
  doc,
  busy,
  rejecting,
  reason,
  onReason,
  onStartReject,
  onCancelReject,
  onApprove,
  onReject,
}: {
  doc: {
    id: string;
    document_type: string;
    file_url: string;
    created_at: string;
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
  busy: boolean;
  rejecting: boolean;
  reason: string;
  onReason: (v: string) => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useLang();
  const { data: imgUrl } = useImageUrl(doc.file_url, "verification-docs");
  const [viewing, setViewing] = useState(false);
  const sellerName = doc.profiles?.shop_name ?? doc.profiles?.full_name ?? doc.id;
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <UserAvatar
            name={sellerName}
            avatarUrl={doc.profiles?.shop_logo_url ?? doc.profiles?.avatar_url}
            size={44}
          />
          <div className="min-w-0">
            <p className="font-medium">{sellerName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(ADMIN_DOC_TYPE_KEY[doc.document_type] ?? "verif.docTypeother")} ·{" "}
              {timeAgo(doc.created_at)}
            </p>
            {/* Everything an admin needs to judge the application, inline. */}
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              {[
                [t("auth.fullName"), doc.profiles?.full_name],
                [t("profile.phone"), doc.profiles?.phone],
                [t("browse.city"), doc.profiles?.city],
                [t("profile.shopAddress"), doc.profiles?.shop_address],
                [t("profile.registrationNumber"), doc.profiles?.registration_number],
              ]
                .filter(([, value]) => !!value)
                .map(([label, value]) => (
                  <div key={label as string} className="flex gap-1.5">
                    <dt className="text-muted-foreground">{label}:</dt>
                    <dd className="truncate font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
            {doc.profiles?.shop_slug ? (
              <Link
                to="/shop/$slug"
                params={{ slug: doc.profiles.shop_slug }}
                className="mt-1.5 inline-block text-xs text-primary"
              >
                {t("listing.visitShop")}
              </Link>
            ) : null}
          </div>
        </div>
        {rejecting ? null : (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setViewing(true)}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> {t("admin.viewDocument")}
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={onStartReject}>
              {t("admin.reject")}
            </Button>
            <Button size="sm" disabled={busy} onClick={onApprove}>
              <BadgeCheck className="mr-1.5 h-3.5 w-3.5" /> {t("admin.approve")}
            </Button>
          </div>
        )}
      </div>

      {/* Inline preview doubles as the trigger for the full-size viewer. The
          seeded demo row points at a file that was never uploaded. */}
      {doc.file_url && !doc.file_url.startsWith("demo/") ? (
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="mt-3 block max-h-64 w-full overflow-hidden rounded-md border bg-muted transition-colors hover:border-primary"
        >
          {imgUrl ? (
            <img
              src={imgUrl}
              alt="Verification document"
              className="mx-auto max-h-64 w-auto object-contain"
            />
          ) : (
            <span className="flex h-24 items-center justify-center text-xs text-muted-foreground">
              {t("admin.viewDocument")}
            </span>
          )}
        </button>
      ) : (
        <p className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          {t("admin.documentMissing")}
        </p>
      )}

      <DocumentViewer
        open={viewing}
        onOpenChange={setViewing}
        filePath={doc.file_url}
        sellerName={sellerName}
        documentType={doc.document_type}
      />
      {rejecting ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <Label htmlFor={`reason-${doc.id}`} className="text-xs font-medium text-destructive">
            {t("admin.rejectReason")}
          </Label>
          <Textarea
            id={`reason-${doc.id}`}
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            rows={2}
            placeholder={t("admin.rejectPlaceholder")}
            className="mt-2"
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={onCancelReject}>
              {t("report.cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || reason.trim().length < 3}
              onClick={onReject}
            >
              {t("admin.confirmReject")}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function CategoriesTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: categories } = useQuery(categoriesQuery);
  const { data: counts } = useQuery(categoryCountsQuery);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [icon, setIcon] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameIcon, setRenameIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
    children: number;
    listings: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const roots = (categories ?? []).filter((c) => !c.parent_id);
  const children = (categories ?? []).filter((c) => c.parent_id);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["category-counts"] });
  };

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
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
    setBusy(false);
    if (error) {
      toast.error(t("toast.couldNotPublish"));
      return;
    }
    setName("");
    setParentId("");
    setIcon("");
    toast.success(t("toast.listingLive"));
    invalidate();
  };

  const rename = async (id: string) => {
    if (!renameValue.trim()) return;
    const slug = renameValue
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const { error } = await supabase
      .from("categories")
      .update({ name: renameValue.trim(), slug, icon: renameIcon || null })
      .eq("id", id);
    setRenamingId(null);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    invalidate();
  };

  const move = async (id: string, dir: "up" | "down") => {
    const all = [...(categories ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const row = all.find((c) => c.id === id);
    if (!row) return;
    const siblings = all.filter((c) => c.parent_id === row.parent_id);
    const index = siblings.findIndex((c) => c.id === id);
    const swap = dir === "up" ? siblings[index - 1] : siblings[index + 1];
    if (!swap) return;
    await supabase.from("categories").update({ sort_order: swap.sort_order }).eq("id", id);
    await supabase.from("categories").update({ sort_order: row.sort_order }).eq("id", swap.id);
    invalidate();
  };

  const remove = async (id: string) => {
    setDeleting(true);
    const { error } = await supabase.from("categories").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("toast.listingUpdated"));
    invalidate();
  };

  const IconSelect = ({
    value,
    onChange,
    className = "",
  }: {
    value: string;
    onChange: (v: string) => void;
    className?: string;
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 rounded-md border border-input bg-background px-3 text-sm ${className}`}
    >
      <option value="">{t("admin.noIcon")}</option>
      {CATEGORY_ICON_KEYS.map((key) => (
        <option key={key} value={key}>
          {key}
        </option>
      ))}
    </select>
  );

  const Row = ({ cat, depth }: { cat: Category; depth: number }) => {
    const IconComp = categoryIcon(cat.icon);
    const n = counts?.[cat.id] ?? 0;
    const idx = (categories ?? [])
      .filter((c) => c.parent_id === cat.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .findIndex((c) => c.id === cat.id);
    const sibs = (categories ?? []).filter((c) => c.parent_id === cat.parent_id);
    return (
      <li
        className={`flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 ${depth > 0 ? "ml-6" : ""}`}
      >
        {renamingId === cat.id ? (
          <>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-8 min-w-40 flex-1"
            />
            <IconSelect value={renameIcon} onChange={setRenameIcon} className="h-8 min-w-36" />
            <Button size="sm" onClick={() => rename(cat.id)}>
              {t("profile.save")}
            </Button>
          </>
        ) : (
          <>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-secondary">
              <IconComp className="h-4 w-4 text-primary" />
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium">{cat.name}</span>
            {n > 0 ? (
              <span
                title={t("admin.listingsCount", { count: n })}
                className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
              >
                {n}
              </span>
            ) : null}
            <span className="hidden text-xs text-muted-foreground sm:inline">/{cat.slug}</span>
            <div className="flex">
              <button
                type="button"
                aria-label={t("admin.moveUp")}
                disabled={idx <= 0}
                onClick={() => void move(cat.id, "up")}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={t("admin.moveDown")}
                disabled={idx >= sibs.length - 1}
                onClick={() => void move(cat.id, "down")}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              aria-label="Rename"
              onClick={() => {
                setRenamingId(cat.id);
                setRenameValue(cat.name);
                setRenameIcon(cat.icon ?? "");
              }}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => {
                const childIds = (categories ?? [])
                  .filter((c) => c.parent_id === cat.id)
                  .map((c) => c.id);
                const listingCount = [cat.id, ...childIds].reduce(
                  (sum, id) => sum + (counts?.[id] ?? 0),
                  0,
                );
                if (childIds.length > 0 || listingCount > 0) {
                  setPendingDelete({
                    id: cat.id,
                    title: cat.name,
                    children: childIds.length,
                    listings: listingCount,
                  });
                } else {
                  void remove(cat.id);
                }
              }}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </li>
    );
  };

  return (
    <div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">{t("admin.addCategory")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_160px_auto]">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("admin.rootCategory")}</option>
            {roots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <IconSelect value={icon} onChange={setIcon} />
          <Button disabled={!name.trim() || busy} onClick={add}>
            {t("admin.addCategory")}
          </Button>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {roots.map((r) => (
          <li key={r.id} className="space-y-2">
            <Row cat={r} depth={0} />
            {children
              .filter((c) => c.parent_id === r.id)
              .map((c) => (
                <Row key={c.id} cat={c} depth={1} />
              ))}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("admin.deleteCategoryTitle")}
        description={
          pendingDelete
            ? pendingDelete.children > 0
              ? t("admin.deleteCategoryAffects", {
                  children: pendingDelete.children,
                  childrenPlural: pendingDelete.children === 1 ? "y" : "ies",
                  listings: pendingDelete.listings,
                  listingsPlural: pendingDelete.listings === 1 ? "" : "s",
                })
              : t("admin.deleteCategoryAffects", {
                  children: 0,
                  childrenPlural: "ies",
                  listings: pendingDelete.listings,
                  listingsPlural: pendingDelete.listings === 1 ? "" : "s",
                })
            : t("admin.deleteCategoryBody")
        }
        confirmLabel={t("action.confirmDelete")}
        cancelLabel={t("action.cancel")}
        pending={deleting}
        onConfirm={() => {
          if (!pendingDelete) return;
          void remove(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function ListingsTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: listings } = useQuery(adminListingsQuery());
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toggleFeatured = async (id: string, featured: boolean) => {
    const { error } = await supabase.from("listings").update({ featured }).eq("id", id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["admin-listings"] });
    queryClient.invalidateQueries({ queryKey: ["listings"] });
  };

  const remove = async (id: string) => {
    setDeleting(true);
    // Retract the channel post BEFORE the row is deleted — the channel-post
    // record cascades off the listing, so afterwards there's no way to find it.
    syncListingChannel(id, "delete");
    const target = (listings ?? []).find((l) => l.id === id) as
      { listing_images?: { url: string }[] } | undefined;
    const urls = (target?.listing_images ?? []).map((img) => img.url);
    const { error } = await supabase.from("listings").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["admin-listings"] });
    // Cloudinary photos + showcase videos leave with the listing.
    void deleteCloudinaryAssets(urls);
  };

  return (
    <>
      <ul className="space-y-2">
        {(listings ?? []).map((l) => (
          <li
            key={l.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3"
          >
            <Link
              to="/listing/$id"
              params={{ id: l.id }}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              {/* The listing's cover image — the list used to be text-only. */}
              <ListingThumb
                images={
                  (l as { listing_images?: { url: string; position: number }[] }).listing_images
                }
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{l.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBirr(l.price)} · {t("dash.statsViews")}: {l.view_count} ·{" "}
                  {timeAgo(l.created_at)}
                </span>
              </span>
            </Link>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs capitalize">
              {l.status}
            </span>
            <Button
              size="sm"
              variant={l.featured ? "default" : "outline"}
              onClick={() => toggleFeatured(l.id, !l.featured)}
            >
              <Star className={`mr-1.5 h-3.5 w-3.5 ${l.featured ? "fill-current" : ""}`} />
              {l.featured ? "Featured" : "Feature"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPendingDelete({ id: l.id, title: l.title })}
              className="text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("admin.deleteListingTitle")}
        description={
          pendingDelete
            ? `${pendingDelete.title} — ${t("admin.deleteListingBody")}`
            : t("admin.deleteListingBody")
        }
        confirmLabel={t("action.confirmDelete")}
        cancelLabel={t("action.cancel")}
        pending={deleting}
        onConfirm={() => {
          if (!pendingDelete) return;
          void remove(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

/** Small cover thumbnail for the admin listings list. */
function ListingThumb({ images }: { images: { url: string; position: number }[] | undefined }) {
  const cover = [...(images ?? [])].sort((a, b) => a.position - b.position)[0];
  return cover?.url ? (
    <ListingImage
      path={cover.url}
      alt="Listing"
      className="h-11 w-11 shrink-0 rounded-md object-cover"
    />
  ) : (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-muted text-lg">
      🛋️
    </span>
  );
}

type TrendKey = "listings" | "users" | "messages" | "views";

const TREND_KEYS: TrendKey[] = ["listings", "users", "messages", "views"];
const TREND_COLORS: Record<TrendKey, string> = {
  listings: "#AC451B",
  users: "#10b981",
  messages: "#3b82f6",
  views: "#8b5cf6",
};

/** Small up/down/flat change pill for hero cards. */
function DeltaPill({ d }: { d: number }) {
  if (d > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
        <TrendingUp className="h-3 w-3" /> +{d}
      </span>
    );
  }
  if (d < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600">
        <TrendingUp className="h-3 w-3 rotate-180" /> {d}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      0
    </span>
  );
}

/** Hero metric card — clickable for drill-down, with accent dot + delta. */
function HeroCard({
  label,
  value,
  sub,
  delta,
  onClick,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: React.ReactNode;
  onClick?: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {accent ? <span className={`h-2 w-2 shrink-0 rounded-full ${accent}`} /> : null}
      </div>
      <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
      {delta ? <div className="mt-2">{delta}</div> : null}
      {sub}
    </button>
  );
}

/** Compact inline stat for the engagement strip (views/messages/…). */
function EngStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-icon-default">
        {icon}
      </span>
      <b className="font-semibold text-foreground">{new Intl.NumberFormat().format(value)}</b>
      {label}
    </span>
  );
}

/** Dashboard panel header: accent bar + icon + title. */
function PanelTitle({
  icon,
  title,
  accent = "bg-primary",
}: {
  icon: React.ReactNode;
  title: string;
  accent?: string;
}) {
  return (
    <p className="flex items-center gap-2.5 font-display text-lg font-semibold">
      <span className={`h-5 w-1 rounded-full ${accent}`} />
      <span className="flex items-center gap-2">{icon}</span>
      {title}
    </p>
  );
}

/**
 * 14-day activity area chart (SVG). One line per visible metric, native
 * tooltip per day, zero-filled so quiet days keep the line continuous.
 */
function TrendChart({
  data,
  visible,
}: {
  data: {
    date: string;
    label: string;
    listings: number;
    users: number;
    messages: number;
    views: number;
  }[];
  visible: Record<TrendKey, boolean>;
}) {
  const W = 640;
  const H = 190;
  const PAD = 22;
  const active = TREND_KEYS.filter((k) => visible[k]);
  const max = Math.max(1, ...data.map((d) => active.reduce((s, k) => s + d[k], 0)));
  const x = (i: number) => PAD + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = (k: TrendKey) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const area = (k: TrendKey) =>
    `${line(k)} L${x(data.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Activity trend">
      {gridTicks.map((tv, i) => (
        <g key={i}>
          <line
            x1={PAD}
            x2={W - PAD}
            y1={y(tv)}
            y2={y(tv)}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="3 3"
          />
          <text
            x={PAD - 6}
            y={y(tv) + 3}
            textAnchor="end"
            fontSize="9"
            className="fill-muted-foreground"
          >
            {tv}
          </text>
        </g>
      ))}
      {active.map((k) => (
        <g key={k}>
          <path d={area(k)} fill={TREND_COLORS[k]} opacity="0.12" />
          <path
            d={line(k)}
            fill="none"
            stroke={TREND_COLORS[k]}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      ))}
      {data.map((d, i) => (
        <g key={d.date}>
          <rect x={x(i) - 6} y={PAD} width={12} height={H - PAD * 2} fill="transparent">
            <title>{`${d.label}: ${active.map((k) => `${k} ${d[k]}`).join(", ")}`}</title>
          </rect>
          {i % labelEvery === 0 ? (
            <text
              x={x(i)}
              y={H - 5}
              textAnchor="middle"
              fontSize="9"
              className="fill-muted-foreground"
            >
              {d.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

function StatsTab({
  onOpenUsers,
  onOpenListings,
}: {
  onOpenUsers: (f: "all" | "sellers") => void;
  onOpenListings: () => void;
}) {
  const { t } = useLang();
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [visible, setVisible] = useState<Record<TrendKey, boolean>>({
    listings: true,
    users: true,
    messages: false,
    views: true,
  });
  const { data: stats } = useQuery(adminStatsQuery());
  const { data: topCategories } = useQuery(adminTopCategoriesQuery());
  const { data: trend } = useQuery(adminTrendQuery(Math.max(range, 14)));

  if (!stats) {
    return <p className="text-sm text-muted-foreground">{t("browse.loading")}</p>;
  }

  // This-week vs prior-week deltas, from the (at least) 14-day series.
  const series = trend ?? [];
  const half = Math.max(1, Math.floor(series.length / 2));
  const sumOf = (k: TrendKey, arr: typeof series) => arr.reduce((s, d) => s + d[k], 0);
  const deltaOf = (k: TrendKey) => sumOf(k, series.slice(half)) - sumOf(k, series.slice(0, half));
  const chartData = series.slice(-range);

  const verifiedPct =
    stats.sellers > 0 ? Math.round((stats.verifiedSellers / stats.sellers) * 100) : 0;

  const total = stats.listings || 1;
  const segments = [
    { label: t("admin.statusActive"), value: stats.activeListings, color: "bg-primary" },
    { label: t("admin.statusSold"), value: stats.soldListings, color: "bg-emerald-500" },
    { label: t("admin.statusOther"), value: stats.otherListings, color: "bg-muted-foreground/40" },
  ].filter((s) => s.value > 0);

  return (
    <div className="space-y-8">
      {/* Hero row — clickable cards with this-week deltas. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <HeroCard
          label={t("admin.totalListings")}
          value={stats.listings}
          accent="bg-primary"
          onClick={onOpenListings}
          delta={<DeltaPill d={deltaOf("listings")} />}
        />
        <HeroCard
          label={t("admin.totalUsers")}
          value={stats.users}
          accent="bg-emerald-500"
          onClick={() => onOpenUsers("all")}
          delta={<DeltaPill d={deltaOf("users")} />}
        />
        <HeroCard
          label={t("admin.verifiedSellers")}
          value={`${stats.verifiedSellers}/${stats.sellers}`}
          accent="bg-sky-500"
          onClick={() => onOpenUsers("sellers")}
          sub={
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{ width: `${Math.max(verifiedPct, 2)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {verifiedPct}% {t("admin.verifiedRate")}
              </p>
            </div>
          }
        />
        <HeroCard
          label={t("admin.thisWeek")}
          value={`+${stats.newListings7d}`}
          accent="bg-violet-500"
          sub={
            <p className="mt-2 text-xs text-muted-foreground">
              +{stats.newUsers7d} {t("admin.usersLabel")}
            </p>
          }
        />
      </div>

      {/* Engagement strip — minor totals, compact. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border bg-card px-5 py-4">
        <EngStat
          icon={<Eye className="h-4 w-4" />}
          label={t("admin.totalViews")}
          value={stats.totalViews}
        />
        <EngStat
          icon={<MessageSquare className="h-4 w-4" />}
          label={t("admin.conversations")}
          value={stats.conversations}
        />
        <EngStat
          icon={<Mail className="h-4 w-4" />}
          label={t("admin.messages")}
          value={stats.messages}
        />
        <EngStat
          icon={<Star className="h-4 w-4" />}
          label={t("admin.reviews")}
          value={stats.reviews}
        />
      </div>

      {/* 14-day activity trend. */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle
            icon={<Activity className="h-5 w-5 text-primary" />}
            title={t("admin.trendTitle")}
            accent="bg-orange-500"
          />
          <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5 text-xs">
            {([7, 14, 30] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  range === r
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {TREND_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                visible[k] ? "border-transparent" : "border-secondary text-muted-foreground"
              }`}
              style={
                visible[k]
                  ? { backgroundColor: `${TREND_COLORS[k]}1a`, color: TREND_COLORS[k] }
                  : undefined
              }
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TREND_COLORS[k] }} />
              {t(`admin.trend.${k}`)}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {chartData.length > 0 ? (
            <TrendChart data={chartData} visible={visible} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("browse.loading")}</p>
          )}
        </div>
      </div>

      {/* Listing status split, drawn as one bar. */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<BarChart3 className="h-5 w-5 text-primary" />}
          title={t("admin.statusBreakdown")}
          accent="bg-primary"
        />
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-secondary">
          {segments.map((s) => (
            <div
              key={s.label}
              className={s.color}
              style={{ width: `${Math.max(0, (s.value / total) * 100)}%` }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${s.color}`} />
              {s.label}: <b className="font-semibold text-foreground">{s.value}</b> (
              {Math.round((s.value / total) * 100)}%)
            </li>
          ))}
        </ul>
      </div>

      {/* Search trends — horizontal bars, matching the category panel. */}
      {stats.topSearches.length > 0 ? (
        <div className="rounded-xl border bg-card p-5">
          <PanelTitle
            icon={<TrendingUp className="h-5 w-5 text-primary" />}
            title={t("admin.topSearches")}
            accent="bg-orange-500"
          />
          <ul className="mt-4 space-y-2.5">
            {stats.topSearches.map((s) => {
              const maxCount = Math.max(1, ...stats.topSearches.map((x) => x.count));
              const pct = Math.round((s.count / maxCount) * 100);
              return (
                <li key={s.name}>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span>{s.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-orange-500"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Category breakdown. */}
      {(topCategories ?? []).length > 0 ? (
        <div className="rounded-xl border bg-card p-5">
          <PanelTitle
            icon={<FolderTree className="h-5 w-5 text-primary" />}
            title={t("admin.topCategories")}
            accent="bg-blue-500"
          />
          <ul className="mt-4 space-y-2 text-sm">
            {topCategories!.map((c) => {
              const pct = Math.round((c.count / (stats.listings || 1)) * 100);
              return (
                <li key={c.name}>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span>
                      {c.count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Telegram integration health (spec §19 monitoring gap). */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<Send className="h-5 w-5 text-primary" />}
          title={t("admin.telegramHealth")}
          accent="bg-emerald-500"
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-background p-3">
            <p className="font-display text-2xl font-semibold text-primary">
              {stats.telegramSends7d}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("admin.tgSends")}</p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="font-display text-2xl font-semibold text-emerald-600">
              {stats.telegramSends7d > 0
                ? Math.round((stats.telegramOk7d / stats.telegramSends7d) * 100)
                : 100}
              %
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("admin.tgSuccess")}</p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="font-display text-2xl font-semibold text-destructive">
              {stats.telegramFailures7d}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("admin.tgFailures")}</p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="font-display text-2xl font-semibold">{stats.telegramLinkedUsers}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("admin.tgLinked")}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
          <span>
            <Users className="mr-1 inline h-3.5 w-3.5" />
            {t("admin.tgChannelPosts")}:{" "}
            <b className="text-foreground">{stats.telegramChannelPosts}</b>
          </span>
          <span>
            <Activity className="mr-1 inline h-3.5 w-3.5" />
            {t("admin.tgProcessed")}:{" "}
            <b className="text-foreground">{stats.telegramProcessedUpdates}</b>
          </span>
          <span>
            <Ban className="mr-1 inline h-3.5 w-3.5" />
            {t("admin.tgBlocked")}: <b className="text-foreground">{stats.telegramBlockedUsers}</b>
          </span>
          <span>{t("admin.tgFailures7d")}</span>
        </div>
        {stats.telegramFailureReasons.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {stats.telegramFailureReasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
