import { Fragment, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
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
  Gavel,
  Globe,
  LayoutList,
  LogOut,
  Mail,
  MessageSquare,
  Pencil,
  Radio,
  ScrollText,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  adminAllUsersQuery,
  adminListingsQuery,
  adminReportsQuery,
  adminStatsQuery,
  adminTopCategoriesQuery,
  adminTrendQuery,
  adminVerificationDecisionsQuery,
  adminVerificationQueueQuery,
  adminReviewEmailChange,
  adminSetUserEmail,
  categoriesQuery,
  categoryCountsQuery,
  emailChangeQueueQuery,
  isAdminQuery,
  adminScopesForRoles,
  type AdminScope,
  type AdminUser,
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
import { friendlyError } from "@/lib/friendly-error";
import { RequireAuth } from "@/components/RequireAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { ListingImage } from "@/components/ListingImage";
import { BanDialog } from "@/components/admin/BanDialog";
import { UserDetailDialog } from "@/components/admin/UserDetailDialog";
import { DocumentViewer } from "@/components/admin/DocumentViewer";
import { deleteCloudinaryAssets, useImageUrl } from "@/lib/storage";
import { timeAgo, formatBirr } from "@/lib/format";
import { announceListing, syncListingChannel, telegramConfigured } from "@/lib/telegram";
import { logAdminAction } from "@/lib/admin-audit";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — AddisHome" },
      { name: "description", content: "Moderate reports, verify sellers and view platform stats." },
      { property: "og:title", content: "Admin — AddisHome" },
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
  const { data: isAdmin } = useQuery(isAdminQuery(user?.id));
  const { data: me, isLoading: checkingMe } = useQuery({
    queryKey: ["admin-me", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.rpc("admin_get_profile_details");
      const found = ((data ?? []) as unknown as AdminUser[]).find((u) => u.id === user.id);
      return found ?? null;
    },
  });
  const scopes = adminScopesForRoles(me?.role_names, me?.is_super_admin ?? false);
  const [tab, setTab] = useState("dashboard");
  const [drill, setDrill] = useState<"all" | "sellers" | null>(null);

  const allow = (scope: AdminScope) => scopes.has(scope);

  if (checkingMe) {
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

  // If the active tab is no longer allowed (e.g. role changed), fall back to
  // the dashboard, which every admin-role holder can see.
  const activeTabAllowed =
    tab === "dashboard" ||
    (tab === "users" && allow("users")) ||
    (tab === "listings" && allow("listings")) ||
    (tab === "verification" && allow("verification")) ||
    (tab === "moderation" && allow("moderation")) ||
    (tab === "categories" && allow("categories")) ||
    (tab === "analytics" && allow("analytics"));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{t("admin.title")}</h1>

      <Tabs value={activeTabAllowed ? tab : "dashboard"} onValueChange={setTab} className="mt-8">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard">{t("admin.dashboard")}</TabsTrigger>
          {allow("listings") && (
            <TabsTrigger value="listings">
              <LayoutList className="mr-1.5 h-3.5 w-3.5" /> Listings
            </TabsTrigger>
          )}
          {allow("users") && <TabsTrigger value="users">{t("admin.users")}</TabsTrigger>}
          {allow("verification") && (
            <TabsTrigger value="verification">
              <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> {t("admin.verification")}
            </TabsTrigger>
          )}
          {allow("moderation") && (
            <TabsTrigger value="moderation">
              <Gavel className="mr-1.5 h-3.5 w-3.5" /> {t("admin.moderation")}
            </TabsTrigger>
          )}
          {allow("categories") && (
            <TabsTrigger value="categories">
              <FolderTree className="mr-1.5 h-3.5 w-3.5" /> {t("nav.categories")}
            </TabsTrigger>
          )}
          {allow("analytics") && (
            <TabsTrigger value="analytics">
              <Globe className="mr-1.5 h-3.5 w-3.5" /> {t("admin.analytics")}
            </TabsTrigger>
          )}
          {allow("users") && (
            <TabsTrigger value="telegram">
              <Radio className="mr-1.5 h-3.5 w-3.5" /> {t("admin.telegramTab")}
            </TabsTrigger>
          )}
          {allow("users") && (
            <TabsTrigger value="featured">
              <Star className="mr-1.5 h-3.5 w-3.5" /> {t("admin.featuredListings")}
            </TabsTrigger>
          )}
          {allow("users") && (
            <TabsTrigger value="audit">
              <ScrollText className="mr-1.5 h-3.5 w-3.5" /> {t("admin.auditLog")}
            </TabsTrigger>
          )}
          {allow("users") && (
            <TabsTrigger value="settings">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> {t("admin.settings")}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <DashboardTab
            onOpenUsers={(f) => {
              setDrill(f);
              setTab("users");
            }}
            onOpenListings={() => setTab("listings")}
            onOpenQueue={(q) => setTab(q)}
          />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UsersTab drillFilter={drill} />
        </TabsContent>
        <TabsContent value="verification" className="mt-6">
          <VerificationTab />
        </TabsContent>
        <TabsContent value="moderation" className="mt-6">
          <ModerationTab />
        </TabsContent>
        <TabsContent value="categories" className="mt-6">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="listings" className="mt-6">
          <ListingsTab />
        </TabsContent>
        <TabsContent value="analytics" className="mt-6">
          <AnalyticsTab />
        </TabsContent>
        <TabsContent value="telegram" className="mt-6">
          <TelegramTab />
        </TabsContent>
        <TabsContent value="featured" className="mt-6">
          <FeaturedTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-6">
          <AuditLogTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type HealthStats = {
  sell_through: { d7: number; d30: number; d60: number };
  median_days_to_sale: number | null;
  seller_response: {
    rate_pct: number | null;
    avg_minutes: number | null;
    median_minutes: number | null;
  };
  funnel: {
    published: number;
    viewed: number;
    inquiries: number;
    responded: number;
    deals: number;
    sales: number;
  };
};

/**
 * Dashboard (spec §6-§9): four tiers — Action Required, Marketplace Health,
 * Category Intelligence, then the volume/trend view from the old stats tab.
 */
function DashboardTab({
  onOpenUsers,
  onOpenListings,
  onOpenQueue,
}: {
  onOpenUsers: (f: "all" | "sellers") => void;
  onOpenListings: () => void;
  onOpenQueue: (q: "moderation" | "verification") => void;
}) {
  const { t } = useLang();

  const { data: actions } = useQuery({
    queryKey: ["admin-action-required"],
    queryFn: async () => {
      const [reports, flagged, disputes, verifications] = await Promise.all([
        supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .not("listing_id", "is", null),
        supabase
          .from("disputes")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "investigating", "escalated"]),
        supabase
          .from("seller_verification_documents")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      return {
        reports: reports.count ?? 0,
        flagged: flagged.count ?? 0,
        disputes: disputes.count ?? 0,
        verifications: verifications.count ?? 0,
      };
    },
  });

  const {
    data: health,
    isError: healthFailed,
    refetch: retryHealth,
  } = useQuery({
    queryKey: ["admin-health-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_health_stats");
      if (error) throw error;
      return (data ?? null) as unknown as HealthStats | null;
    },
    retry: 1,
  });

  // Tier 3 — category performance: root-category rollup of supply vs demand.
  const { data: catPerf } = useQuery({
    queryKey: ["admin-category-performance"],
    queryFn: async () => {
      const [cats, listings, convs] = await Promise.all([
        supabase.from("categories").select("id,name,parent_id"),
        supabase
          .from("listings")
          .select("id,category_id,status,view_count")
          .not("category_id", "is", null),
        supabase.from("conversations").select("listing_id"),
      ]);
      const roots = (cats.data ?? []).filter((c) => !c.parent_id);
      const childOf = new Map<string, string>();
      for (const c of cats.data ?? []) {
        if (c.parent_id) childOf.set(c.id, c.parent_id);
      }
      const inquiryByListing = new Set((convs.data ?? []).map((c) => c.listing_id as string));
      type Perf = {
        name: string;
        listings: number;
        views: number;
        inquiries: number;
        sold: number;
      };
      const perf = new Map<string, Perf>(
        roots.map((r) => [r.id, { name: r.name, listings: 0, views: 0, inquiries: 0, sold: 0 }]),
      );
      for (const l of listings.data ?? []) {
        const rootId = childOf.get(l.category_id as string) ?? (l.category_id as string);
        const row = perf.get(rootId);
        if (!row) continue;
        row.listings += 1;
        row.views += l.view_count ?? 0;
        if (inquiryByListing.has(l.id)) row.inquiries += 1;
        if (l.status === "sold") row.sold += 1;
      }
      return [...perf.values()].sort((a, b) => b.listings - a.listings).slice(0, 8);
    },
  });

  const funnelStages: {
    key: "published" | "viewed" | "inquiries" | "responded" | "deals" | "sales";
    value: number;
  }[] = health?.funnel
    ? [
        { key: "published", value: health.funnel.published },
        { key: "viewed", value: health.funnel.viewed },
        { key: "inquiries", value: health.funnel.inquiries },
        { key: "responded", value: health.funnel.responded },
        { key: "deals", value: health.funnel.deals },
        { key: "sales", value: health.funnel.sales },
      ]
    : [];
  const funnelMax = Math.max(1, ...funnelStages.map((s) => s.value));

  return (
    <div className="space-y-8">
      {/* ── Tier 1 · Action required ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ActionCard
          label={t("admin.pendingDisputes")}
          value={actions?.disputes}
          tone="bg-destructive"
          icon={<Gavel className="h-4 w-4" />}
          onClick={() => onOpenQueue("moderation")}
        />
        <ActionCard
          label={t("admin.pendingVerification")}
          value={actions?.verifications}
          tone="bg-amber-500"
          icon={<ClipboardCheck className="h-4 w-4" />}
          onClick={() => onOpenQueue("verification")}
        />
        <ActionCard
          label={t("admin.pendingReports")}
          value={actions?.reports}
          tone="bg-orange-500"
          icon={<Flag className="h-4 w-4" />}
          onClick={() => onOpenQueue("moderation")}
        />
        <ActionCard
          label={t("admin.flaggedListings")}
          value={actions?.flagged}
          tone="bg-violet-500"
          icon={<AlertTriangle className="h-4 w-4" />}
          onClick={() => onOpenListings()}
        />
      </div>

      {/* ── Tier 2 · Marketplace health ──────────────────────────────── */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<Activity className="h-5 w-5 text-primary" />}
          title={t("admin.marketplaceHealth")}
          accent="bg-emerald-500"
        />
        {healthFailed ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">{t("admin.healthUnavailable")}</p>
            <Button size="sm" variant="outline" onClick={() => void retryHealth()}>
              {t("admin.retry")}
            </Button>
          </div>
        ) : !health ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("browse.loading")}</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(
                [
                  ["d7", 7],
                  ["d30", 30],
                  ["d60", 60],
                ] as const
              ).map(([key, d]) => (
                <div key={key} className="rounded-lg bg-secondary/50 p-4">
                  <p className="text-xs text-muted-foreground">
                    {t("admin.sellThrough", { days: d })}
                  </p>
                  <p className="mt-1 font-display text-2xl font-semibold text-primary">
                    {health.sell_through[key]}%
                  </p>
                </div>
              ))}
              <div className="rounded-lg bg-secondary/50 p-4">
                <p className="text-xs text-muted-foreground">{t("admin.medianDaysToSale")}</p>
                <p className="mt-1 font-display text-2xl font-semibold">
                  {health.median_days_to_sale ?? "—"}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {health.median_days_to_sale != null ? t("admin.daysUnit") : ""}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("admin.responseRate")}</p>
                <p className="mt-0.5 text-xl font-semibold">
                  {health.seller_response.rate_pct ?? 0}%
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("admin.avgResponse")}</p>
                <p className="mt-0.5 text-xl font-semibold">
                  {health.seller_response.avg_minutes != null
                    ? `${health.seller_response.avg_minutes} ${t("admin.minutesShort")}`
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("admin.medianResponse")}</p>
                <p className="mt-0.5 text-xl font-semibold">
                  {health.seller_response.median_minutes != null
                    ? `${health.seller_response.median_minutes} ${t("admin.minutesShort")}`
                    : "—"}
                </p>
              </div>
            </div>

            {/* Funnel — conversion through the marketplace pipeline. */}
            <p className="mt-6 flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" /> {t("admin.funnelTitle")}
            </p>
            <ul className="mt-3 space-y-2">
              {funnelStages.map((s, i) => (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate text-muted-foreground">
                    {t(`admin.funnel.${s.key}`)}
                  </span>
                  <span className="relative h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-secondary">
                    <span
                      className="absolute inset-y-0 left-0 rounded-md bg-primary/80"
                      style={{
                        width: `${Math.max((s.value / funnelMax) * 100, s.value > 0 ? 2 : 0)}%`,
                      }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {s.value.toLocaleString()}
                    {i > 0 && (funnelStages[i - 1]?.value ?? 0) > 0 ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({Math.round((s.value / funnelStages[i - 1]!.value) * 100)}%)
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* ── Tier 3 · Category performance ────────────────────────────── */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<BarChart3 className="h-5 w-5 text-primary" />}
          title={t("admin.categoryPerformance")}
          accent="bg-sky-500"
        />
        {!catPerf || catPerf.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("browse.loading")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">—</th>
                  <th className="px-2 py-2">{t("admin.cat.listings")}</th>
                  <th className="px-2 py-2">{t("admin.cat.views")}</th>
                  <th className="px-2 py-2">{t("admin.cat.inquiries")}</th>
                  <th className="px-2 py-2">{t("admin.cat.sold")}</th>
                  <th className="px-2 py-2">{t("admin.cat.sellThrough")}</th>
                </tr>
              </thead>
              <tbody>
                {catPerf.map((row) => (
                  <tr key={row.name} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.name}</td>
                    <td className="px-2 py-2 tabular-nums">{row.listings}</td>
                    <td className="px-2 py-2 tabular-nums">{row.views.toLocaleString()}</td>
                    <td className="px-2 py-2 tabular-nums">{row.inquiries}</td>
                    <td className="px-2 py-2 tabular-nums">{row.sold}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.listings > 0 ? `${Math.round((row.sold / row.listings) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tier 4 · Volume & trends (the old stats view) ─────────────── */}
      <StatsTab onOpenUsers={onOpenUsers} onOpenListings={onOpenListings} />
    </div>
  );
}

/** Clickable Tier-1 card that routes to its queue. */
function ActionCard({
  label,
  value,
  tone,
  icon,
  onClick,
}: {
  label: string;
  value: number | undefined;
  tone: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-lift rounded-xl border bg-card p-4 text-left shadow-soft transition-colors hover:border-primary"
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-white ${tone}`}
        >
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold">{value ?? "…"}</p>
    </button>
  );
}

/**
 * Moderation center (spec §10): reports, disputes and flagged listings in one
 * place, each a dedicated queue so time-sensitive items are not buried.
 */
function ModerationTab() {
  const { t } = useLang();
  const [queue, setQueue] = useState<"reports" | "disputes" | "flagged">("reports");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={queue === "reports" ? "default" : "outline"}
          onClick={() => setQueue("reports")}
        >
          <Flag className="mr-1.5 h-3.5 w-3.5" /> {t("admin.reports")}
        </Button>
        <Button
          size="sm"
          variant={queue === "disputes" ? "default" : "outline"}
          onClick={() => setQueue("disputes")}
        >
          <Gavel className="mr-1.5 h-3.5 w-3.5" /> {t("admin.disputes")}
        </Button>
        <Button
          size="sm"
          variant={queue === "flagged" ? "default" : "outline"}
          onClick={() => setQueue("flagged")}
        >
          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> {t("admin.flaggedListings")}
        </Button>
      </div>
      {queue === "reports" ? (
        <ReportsTab />
      ) : queue === "disputes" ? (
        <DisputesTab />
      ) : (
        <FlaggedListingsTab />
      )}
    </div>
  );
}

/** Listings grouped by their open reports — triage at the listing level. */
function FlaggedListingsTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: flagged } = useQuery({
    queryKey: ["admin-flagged-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(
          "id,reason,details,status,created_at,listing_id," + "listings(id,title,status,featured)",
        )
        .eq("status", "pending")
        .not("listing_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      type Row = {
        id: string;
        reason: string;
        details: string | null;
        status: string;
        created_at: string;
        listing_id: string | null;
        listings: { id: string; title: string; status: string; featured: boolean } | null;
      };
      const rows = (data ?? []) as unknown as Row[];
      const groups = new Map<string, { listing: Row["listings"]; reports: Row[] }>();
      for (const r of rows) {
        const key = r.listing_id!;
        const g = groups.get(key) ?? { listing: r.listings, reports: [] };
        g.reports.push(r);
        groups.set(key, g);
      }
      return [...groups.entries()];
    },
  });

  if (!flagged || flagged.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("admin.noFlagged")}</p>;
  }

  const dismissAll = async (reportIds: string[]) => {
    const { error } = await supabase
      .from("reports")
      .update({ status: "dismissed" })
      .in("id", reportIds);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["admin-flagged-listings"] });
    queryClient.invalidateQueries({ queryKey: ["admin-action-required"] });
  };

  return (
    <ul className="space-y-3">
      {flagged.map(([listingId, g]) => (
        <li key={listingId} className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                {g.listing?.title ?? listingId}
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  {g.reports.length}{" "}
                  {g.reports.length === 1
                    ? t("admin.reports").toLowerCase().replace(/s$/, "")
                    : t("admin.reports").toLowerCase()}
                </span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {g.reports.slice(0, 4).map((r) => (
                  <li key={r.id} className="text-xs text-muted-foreground">
                    • {r.reason}
                    {r.details ? ` — ${r.details}` : ""} · {timeAgo(r.created_at)}
                  </li>
                ))}
              </ul>
              {g.listing ? (
                <Link
                  to="/listing/$id"
                  params={{ id: g.listing.id }}
                  className="mt-1 inline-block text-xs text-primary"
                >
                  {t("listing.back")}
                </Link>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => dismissAll(g.reports.map((r) => r.id))}
              >
                {t("admin.dismiss")}
              </Button>
              {g.listing && !g.listing.featured ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await supabase.from("listings").update({ featured: true }).eq("id", listingId);
                    void logAdminAction({
                      action: "listing_featured",
                      entityType: "listing",
                      entityId: listingId,
                    });
                    toast.success(t("toast.listingUpdated"));
                  }}
                >
                  <Star className="mr-1.5 h-3.5 w-3.5" /> Feature
                </Button>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

type DisputeRow = {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  deadline_at: string;
  resolution: string | null;
  created_at: string;
  conversation_id: string | null;
  listing_id: string | null;
  listings: { id: string; title: string } | null;
  buyer: {
    full_name: string | null;
    shop_name: string | null;
    phone: string | null;
    telegram: string | null;
    whatsapp: string | null;
  } | null;
  seller: {
    full_name: string | null;
    shop_name: string | null;
    phone: string | null;
    telegram: string | null;
    whatsapp: string | null;
  } | null;
};

/** Dedicated dispute queue with deadline visibility (spec §12). */
function DisputesTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState<{ id: string; status: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: disputes } = useQuery({
    queryKey: ["admin-disputes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disputes")
        .select(
          "id,reason,description,status,deadline_at,resolution,created_at,conversation_id,listing_id," +
            "listings(id,title)," +
            "buyer:profiles!disputes_buyer_id_fkey(full_name,shop_name,phone,telegram,whatsapp)," +
            "seller:profiles!disputes_seller_id_fkey(full_name,shop_name,phone,telegram,whatsapp)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as unknown as DisputeRow[];
      // Evidence counts (spec §12): messages in the linked conversation.
      const convIds = rows.map((r) => r.conversation_id).filter(Boolean) as string[];
      const msgCounts = new Map<string, number>();
      if (convIds.length > 0) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", convIds)
          .limit(2000);
        for (const m of msgs ?? []) {
          msgCounts.set(m.conversation_id, (msgCounts.get(m.conversation_id) ?? 0) + 1);
        }
      }
      return rows
        .map((r) => ({
          row: r,
          messages: r.conversation_id ? (msgCounts.get(r.conversation_id) ?? 0) : 0,
        }))
        .sort((a, b) => {
          const open = (s: string) =>
            s === "pending" || s === "investigating" || s === "escalated" ? 0 : 1;
          return open(a.row.status) - open(b.row.status);
        })
        .map((x) => ({ ...x.row, messageCount: x.messages }));
    },
  });

  const setStatus = async (id: string, status: string, resolution?: string) => {
    setBusy(true);
    const me = await supabase.auth.getUser();
    const { error } = await supabase
      .from("disputes")
      .update({
        status,
        resolution: resolution ?? null,
        resolved_by: me.data.user?.id ?? null,
      })
      .eq("id", id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void logAdminAction({
      action:
        status === "resolved"
          ? "dispute_resolved"
          : status === "dismissed"
            ? "report_dismissed"
            : `dispute_${status}`,
      entityType: "dispute",
      entityId: id,
      newValue: { status, resolution: resolution ?? null },
    });
    setResolving(null);
    setNote("");
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["admin-disputes"] });
    queryClient.invalidateQueries({ queryKey: ["admin-action-required"] });
  };

  if (!disputes || disputes.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("admin.noDisputes")}</p>;
  }

  return (
    <ul className="space-y-3">
      {disputes.map((d) => {
        const open =
          d.status === "pending" || d.status === "investigating" || d.status === "escalated";
        const remainingMs = new Date(d.deadline_at).getTime() - Date.now();
        const overdue = open && remainingMs <= 0;
        const remaining =
          remainingMs > 0
            ? `${Math.floor(remainingMs / 3600000)}h ${Math.floor((remainingMs % 3600000) / 60000)}m`
            : null;
        const partyName = (p: DisputeRow["buyer"]) => p?.shop_name ?? p?.full_name ?? "—";
        return (
          <li key={d.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  <Gavel className="h-3.5 w-3.5 text-destructive" />
                  {d.listings?.title ?? d.reason}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                      open
                        ? overdue
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/15 text-amber-700"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {open && overdue
                      ? t("admin.deadlinePassed")
                      : d.status === "pending"
                        ? (t("admin.pendingReports").split(" ")[1]?.toLowerCase() ?? d.status)
                        : d.status === "investigating"
                          ? t("admin.statusInvestigating")
                          : d.status === "escalated"
                            ? t("admin.statusEscalated")
                            : d.status}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("admin.disputeBuyer")}: {partyName(d.buyer)} · {t("admin.disputeSeller")}:{" "}
                  {partyName(d.seller)} · {t("report.reason")}: {d.reason} · {timeAgo(d.created_at)}
                </p>
                {open && remaining ? (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {t("admin.deadlineRemaining", { time: remaining })}
                  </p>
                ) : null}
                {d.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
                ) : null}
                {d.resolution ? (
                  <p className="mt-1 text-sm italic text-muted-foreground">“{d.resolution}”</p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-3">
                  {d.listings ? (
                    <Link
                      to="/listing/$id"
                      params={{ id: d.listings.id }}
                      className="text-xs text-primary"
                    >
                      {t("listing.back")}
                    </Link>
                  ) : null}
                  {d.conversation_id ? (
                    <>
                      <Link
                        to="/messages"
                        search={{ conv: d.conversation_id }}
                        className="text-xs text-primary"
                      >
                        {t("admin.viewConversation")}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {d.messageCount} {t("admin.messages").toLowerCase()}
                      </span>
                    </>
                  ) : null}
                  {/* Direct contact actions (spec §12). */}
                  {(["buyer", "seller"] as const).map((side) => {
                    const p = d[side];
                    if (!p) return null;
                    return (
                      <span key={side} className="flex gap-2 text-xs text-primary">
                        {p.phone ? (
                          <a href={`tel:${p.phone}`}>
                            {t("admin.contact")}{" "}
                            {t(`admin.dispute${side === "buyer" ? "Buyer" : "Seller"}`)}
                          </a>
                        ) : p.telegram ? (
                          <a
                            href={`https://t.me/${p.telegram.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("admin.contact")}{" "}
                            {t(`admin.dispute${side === "buyer" ? "Buyer" : "Seller"}`)}
                          </a>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </div>

              {open && resolving?.id !== d.id ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {d.status === "pending" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setStatus(d.id, "investigating")}
                    >
                      {t("admin.investigate")}
                    </Button>
                  ) : null}
                  {d.status !== "escalated" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setStatus(d.id, "escalated")}
                    >
                      {t("admin.escalate")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setStatus(d.id, "dismissed")}
                  >
                    {t("admin.dismissDispute")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setResolving({ id: d.id, status: "resolved" });
                      setNote("");
                    }}
                  >
                    {t("admin.resolveDispute")}
                  </Button>
                </div>
              ) : null}
            </div>

            {resolving?.id === d.id ? (
              <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                <Label htmlFor={`resolution-${d.id}`} className="text-xs font-medium">
                  {t("admin.resolutionNote")}
                </Label>
                <Textarea
                  id={`resolution-${d.id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={t("admin.resolutionPlaceholder")}
                  className="mt-2"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setResolving(null)}
                  >
                    {t("report.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || note.trim().length < 3}
                    onClick={() =>
                      resolving && setStatus(resolving.id, resolving.status, note.trim())
                    }
                  >
                    {t("admin.resolveDispute")}
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ReportsTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [resolving, setResolving] = useState<{ id: string; status: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Full lifecycle (spec SS11): open queue by default, history on demand.
  const { data: reports } = useQuery({
    queryKey: ["admin-reports-v2"],
    queryFn: async () => {
      let q = supabase
        .from("reports")
        .select(
          "id,reason,details,status,resolution,created_at,listing_id,reported_user_id,reporter_id," +
            "listings(id,title)," +
            "profiles!reports_reporter_id_fkey(full_name,shop_name)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter === "open") q = q.eq("status", "pending");
      else if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        reason: string;
        details: string | null;
        status: string;
        resolution: string | null;
        created_at: string;
        listing_id: string | null;
        reported_user_id: string | null;
        reporter_id: string;
        listings: { id: string; title: string } | null;
        profiles: { full_name: string | null; shop_name: string | null } | null;
      }[];
    },
  });

  const setStatus = async (id: string, status: string, resolution?: string) => {
    setBusy(true);
    const me = await supabase.auth.getUser();
    const report = (reports ?? []).find((r) => r.id === id);
    const { error } = await supabase
      .from("reports")
      .update({
        status,
        resolution: resolution ?? null,
        assigned_admin: me.data.user?.id ?? null,
      })
      .eq("id", id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if ((status === "resolved" || status === "dismissed") && report?.reporter_id) {
      await supabase.rpc("admin_notify_user", {
        _user_id: report.reporter_id,
        _type: status === "resolved" ? "report_resolved" : "report_dismissed",
        _payload: {
          title: report.listings?.title ?? report.reason,
          ...(report.listings ? { listingId: report.listings.id } : {}),
        },
      });
    }
    void logAdminAction({
      action: "report_" + status,
      entityType: "report",
      entityId: id,
      oldValue: { status: report?.status },
      newValue: { status, resolution: resolution ?? null },
    });
    setResolving(null);
    setNote("");
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["admin-reports-v2"] });
    queryClient.invalidateQueries({ queryKey: ["admin-flagged-listings"] });
    queryClient.invalidateQueries({ queryKey: ["admin-action-required"] });
  };

  const STATUS_CHIPS = [
    ["open", t("admin.pendingReports")],
    ["investigating", t("admin.statusInvestigating")],
    ["escalated", t("admin.statusEscalated")],
    ["resolved", t("admin.resolved")],
    ["dismissed", t("admin.dismiss")],
    ["all", t("admin.allStatuses")],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={statusFilter === value ? "default" : "outline"}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {!reports || reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.noReports")}</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <Flag className="h-3.5 w-3.5 text-destructive" />
                    <span className="font-mono text-xs text-muted-foreground">
                      #{r.id.slice(0, 8)}
                    </span>
                    {r.listings?.title ??
                      r.profiles?.shop_name ??
                      r.profiles?.full_name ??
                      r.reason}
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs capitalize " +
                        (r.status === "pending"
                          ? "bg-amber-500/15 text-amber-700"
                          : r.status === "resolved" || r.status === "reviewed"
                            ? "bg-success/10 text-success"
                            : r.status === "dismissed"
                              ? "bg-secondary text-muted-foreground"
                              : "bg-destructive/10 text-destructive")
                      }
                    >
                      {r.status}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("report.reason")}: {r.reason} · {t("admin.reportedBy")}:{" "}
                    {r.profiles?.shop_name ?? r.profiles?.full_name ?? "—"} ·{" "}
                    {timeAgo(r.created_at)}
                  </p>
                  {r.details ? (
                    <p className="mt-1 text-sm text-muted-foreground">{r.details}</p>
                  ) : null}
                  {r.resolution ? (
                    <p className="mt-1 text-sm italic text-muted-foreground">
                      &ldquo;{r.resolution}&rdquo;
                    </p>
                  ) : null}
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
                <div className="flex shrink-0 flex-wrap gap-2">
                  {r.status === "pending" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setStatus(r.id, "investigating")}
                    >
                      {t("admin.investigate")}
                    </Button>
                  ) : null}
                  {["pending", "investigating"].includes(r.status) && r.status !== "escalated" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setStatus(r.id, "escalated")}
                    >
                      {t("admin.escalate")}
                    </Button>
                  ) : null}
                  {!["resolved", "reviewed", "dismissed"].includes(r.status) ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setStatus(r.id, "dismissed")}
                      >
                        {t("admin.dismissDispute")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setResolving({ id: r.id, status: "resolved" });
                          setNote("");
                        }}
                      >
                        {t("admin.resolveDispute")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {resolving?.id === r.id ? (
                <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                  <Label htmlFor={"report-resolution-" + r.id} className="text-xs font-medium">
                    {t("admin.resolutionNote")}
                  </Label>
                  <Textarea
                    id={"report-resolution-" + r.id}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder={t("admin.resolutionPlaceholder")}
                    className="mt-2"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setResolving(null)}
                    >
                      {t("report.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || note.trim().length < 3}
                      onClick={() =>
                        resolving && setStatus(resolving.id, resolving.status, note.trim())
                      }
                    >
                      {t("admin.resolveDispute")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
/** Every account, with suspension controls. */
function UsersTab({ drillFilter }: { drillFilter: "all" | "sellers" | null }) {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "sellers" | "buyers" | "suspended" | "business">(
    "all",
  );
  // Stats-tab drill-down: "Verified sellers" opens this tab pre-filtered.
  useEffect(() => {
    if (drillFilter) setFilter(drillFilter);
  }, [drillFilter]);
  const [search, setSearch] = useState("");
  // Suspended / Business are client-side views over the full list — the RPC
  // only narrows by seller flag.
  const { data: users } = useQuery(
    adminAllUsersQuery(filter === "suspended" || filter === "business" ? "all" : filter),
  );
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);
  const [roleTarget, setRoleTarget] = useState<{
    id: string;
    name: string;
    action: "grant" | "revoke";
    role: "admin" | "moderator" | "verification" | "category_manager" | "analytics";
  } | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Email changes (item 43) ──────────────────────────────────────────
  // Two ways in: approve what a user asked for, or set an address directly.
  // Both are audited by the same `email_change_requests` table.
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

  /** Turns the RPC's error code into something a human can act on. */
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
  };

  const term = search.trim().toLowerCase();
  const visible = (users ?? [])
    .filter((u) =>
      filter === "suspended" ? !!u.banned_until && new Date(u.banned_until) > new Date() : true,
    )
    .filter((u) =>
      !term
        ? true
        : [u.full_name, u.shop_name, u.phone, u.city, u.email]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(term)),
    );

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
  };

  const revoke = async (id: string) => {
    const res = await adminRevokeSessions({ data: { userId: id } });
    if (!res.ok) {
      toast.error(friendlyError(res.error, t, "toast.updateFailed"));
      return;
    }
    toast.success(t("admin.sessionsRevoked"));
    void logAdminAction({ action: "sessions_revoked", entityType: "user", entityId: id });
  };

  const [roleCodeSent, setRoleCodeSent] = useState(false);
  const [roleCode, setRoleCode] = useState("");

  // Step 1: send the 6-digit code to the acting admin's email.
  const requestRoleChange = async () => {
    if (!roleTarget) return;
    // Belt and braces: the button is hidden on your own row and the RPC
    // rejects a self-target, but never let the request leave the client.
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
              : err === "self" || err === "self_demote"
                ? t("admin.roleChangeSelf")
                : t("admin.roleChangeFailed"),
      );
      return;
    }
    toast.success(
      roleTarget.action === "grant" ? t("admin.roleChangeSuccess") : t("admin.roleChangeRemoved"),
    );
    setRoleTarget(null);
    setRoleCodeSent(false);
    setRoleCode("");
    void logAdminAction({
      action: roleTarget.action === "grant" ? "role_granted" : "role_revoked",
      entityType: "user",
      entityId: roleTarget.id,
      newValue: { role: roleTarget.role, confirmedViaEmailCode: true },
    });
    queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
  };

  return (
    <>
      {/* Pending email-change requests. Shown above the user list because it
          is a queue: it needs clearing, the list below is just a directory.
          Hidden entirely when empty so it does not add permanent chrome. */}
      {emailQueue && emailQueue.length > 0 ? (
        <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
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
                    {t("admin.emailQueueFrom", {
                      old: r.old_email ?? "—",
                      new: r.new_email,
                    })}
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

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "sellers", "buyers", "suspended"] as const).map((f) => (
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
                : f === "buyers"
                  ? t("admin.roleBuyer")
                  : t("admin.suspendedSegment")}
          </Button>
        ))}
        {/* Spec §2: business sellers stay a placeholder this phase. */}
        <Button
          size="sm"
          variant={filter === "business" ? "default" : "outline"}
          className="text-muted-foreground"
          onClick={() => setFilter("business")}
        >
          {t("admin.businessSellers")} · {t("admin.comingSoon")}
        </Button>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.searchUsers")}
          className="h-9 max-w-xs"
        />
      </div>

      {filter === "business" ? (
        <p className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("admin.businessSellers")}
          <span className="mx-2 rounded-full bg-secondary px-2 py-0.5 text-xs">
            {t("admin.comingSoon")}
          </span>
          <br />
          {t("admin.businessSellersSoon")}
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("admin.noUsers")}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visible.map((u) => {
            const suspended = !!u.banned_until && new Date(u.banned_until) > new Date();
            const name = u.shop_name ?? u.full_name;
            return (
              <li
                key={u.id}
                className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  type="button"
                  onClick={() => setDetailUser(u)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <UserAvatar name={name} avatarUrl={u.shop_logo_url ?? u.avatar_url} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {name}
                      {u.verified ? <BadgeCheck className="h-3.5 w-3.5 text-primary" /> : null}
                      {(u.role_names ?? []).some((r) =>
                        [
                          "admin",
                          "moderator",
                          "verification",
                          "category_manager",
                          "analytics",
                        ].includes(r),
                      ) ? (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {u.is_super_admin
                            ? t("admin.roleSuperAdmin")
                            : (u.role_names ?? []).find((r) => r !== "user") === "admin"
                              ? t("admin.roleAdmin")
                              : (u.role_names ?? []).find((r) => r !== "user") === "moderator"
                                ? t("admin.roleModerator")
                                : (u.role_names ?? []).find((r) => r !== "user") === "verification"
                                  ? t("admin.roleVerification")
                                  : (u.role_names ?? []).find((r) => r !== "user") ===
                                      "category_manager"
                                    ? t("admin.roleCategoryManager")
                                    : t("admin.roleAnalytics")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          {u.is_seller ? t("admin.roleSeller") : t("admin.roleBuyer")}
                        </span>
                      )}
                    </p>
                    {u.email ? (
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{u.email}</span>
                        {u.email_confirmed_at ? (
                          <BadgeCheck className="h-3 w-3 shrink-0 text-emerald-600" />
                        ) : null}
                      </p>
                    ) : null}
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
                </button>

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
                  {/* Direct email change. The address lives in auth.users, so
                      only the checked RPC can move it — and it audits itself. */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEmailTarget({ id: u.id, name, current: u.email ?? null });
                      setEmailValue("");
                      setEmailReason("");
                    }}
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5" /> {t("admin.emailChangeUser")}
                  </Button>
                  {/* Grant / revoke an admin role — requires email
                      confirmation. Never offered on your own row or on the
                      super admin: revoking would drop them out of the panel
                      or nothing could undo it. The RPC rejects a self-target
                      too ({ok:false, error:"self"}); this only keeps the
                      button from lying about being available. */}
                  {(() => {
                    const owned = (u.role_names ?? []).find((r) =>
                      [
                        "admin",
                        "moderator",
                        "verification",
                        "category_manager",
                        "analytics",
                      ].includes(r),
                    );
                    if (u.is_super_admin || u.id === user?.id) return null;
                    return owned ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setRoleTarget({
                            id: u.id,
                            name,
                            action: "revoke",
                            role: owned as
                              | "admin"
                              | "moderator"
                              | "verification"
                              | "category_manager"
                              | "analytics",
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
                            id: u.id,
                            name,
                            action: "grant",
                            role: "moderator",
                          })
                        }
                      >
                        <Mail className="mr-1.5 h-3.5 w-3.5" /> {t("admin.grantRole")}
                      </Button>
                    );
                  })()}
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
                  setRoleTarget((prev) =>
                    prev
                      ? {
                          ...prev,
                          role: v as
                            | "admin"
                            | "moderator"
                            | "verification"
                            | "category_manager"
                            | "analytics",
                        }
                      : prev,
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("admin.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="moderator">{t("admin.roleModerator")}</SelectItem>
                  <SelectItem value="verification">{t("admin.roleVerification")}</SelectItem>
                  <SelectItem value="category_manager">{t("admin.roleCategoryManager")}</SelectItem>
                  <SelectItem value="analytics">{t("admin.roleAnalytics")}</SelectItem>
                  <SelectItem value="admin">{t("admin.roleAdmin")}</SelectItem>
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

      {/* Reject a queued request — a reason is optional but it reaches the
          user verbatim in their notification, so it is worth writing. */}
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

      {/* Change an address directly, without waiting for a request. */}
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

      {/* User detail view — opens when clicking a user row. */}
      <UserDetailDialog
        user={detailUser}
        open={!!detailUser}
        onOpenChange={(open) => {
          if (!open) setDetailUser(null);
        }}
      />
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
    void logAdminAction({
      action: action === "approved" ? "seller_verified" : "seller_rejected",
      entityType: "verification_document",
      entityId: documentId,
      newValue: { action, reason: reason ?? null },
    });
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
    void logAdminAction({
      action: "category_created",
      entityType: "category",
      newValue: { name: name.trim(), slug, parent_id: parentId || null },
    });
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
    void logAdminAction({
      action: "category_changed",
      entityType: "category",
      entityId: id,
      newValue: { name: renameValue.trim(), slug },
    });
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
    void logAdminAction({ action: "category_deleted", entityType: "category", entityId: id });
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

  /** "Furniture → Living Room" for a level-2 row; empty for a root. */
  const ancestorPath = (cat: Category): string => {
    const names: string[] = [];
    let cursor = cat.parent_id ? (categories ?? []).find((c) => c.id === cat.parent_id) : undefined;
    // Bounded by the 3-level taxonomy, but guard anyway: a cycle introduced by
    // a bad parent_id would otherwise hang the render.
    let hops = 0;
    while (cursor && hops < 5) {
      names.unshift(cursor.name);
      cursor = cursor.parent_id
        ? (categories ?? []).find((c) => c.id === cursor!.parent_id)
        : undefined;
      hops += 1;
    }
    return names.join(" → ");
  };

  const Row = ({ cat, depth }: { cat: Category; depth: number }) => {
    const IconComp = categoryIcon(cat.icon);
    const n = counts?.[cat.id] ?? 0;
    const path = ancestorPath(cat);
    const idx = (categories ?? [])
      .filter((c) => c.parent_id === cat.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .findIndex((c) => c.id === cat.id);
    const sibs = (categories ?? []).filter((c) => c.parent_id === cat.parent_id);
    return (
      <li
        className={`flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 ${
          depth === 1 ? "ml-6 border-l-2 border-l-primary/40" : ""
        } ${depth >= 2 ? "ml-12 border-l-2 border-l-primary/20" : ""}`}
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
            {/* Tree guide (spec §16): an "L2" badge told you the depth but not
                where the row sits, so a "Sofas" under the wrong parent looked
                identical to a correct one. The glyph shows the nesting and the
                breadcrumb names the parents. */}
            {depth > 0 ? (
              <span
                aria-hidden
                className="shrink-0 select-none font-mono text-xs text-muted-foreground"
              >
                └─
              </span>
            ) : null}
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-secondary">
              <IconComp className="h-4 w-4 text-primary" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{cat.name}</span>
                {cat.level != null ? (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    L{cat.level}
                  </span>
                ) : null}
              </span>
              {path ? (
                <span className="block truncate text-[11px] text-muted-foreground">{path}</span>
              ) : null}
            </span>
            {cat.is_active === false ? (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                inactive
              </span>
            ) : null}
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
              aria-label="Toggle active"
              onClick={async () => {
                await supabase
                  .from("categories")
                  .update({ is_active: cat.is_active !== false ? false : true })
                  .eq("id", cat.id);
                invalidate();
              }}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {cat.is_active !== false ? (
                <span className="text-xs">✅</span>
              ) : (
                <span className="text-xs">⏸️</span>
              )}
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
            {children
              .filter((c) => {
                // Level-1 categories can be parents for level-2
                const parent = roots.find((r) => r.id === c.parent_id);
                return !!parent;
              })
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {roots.find((r) => r.id === c.parent_id)?.name} → {c.name}
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
                <Fragment key={c.id}>
                  <Row cat={c} depth={1} />
                  {/* Level 2: grandchildren */}
                  {children
                    .filter((gc) => gc.parent_id === c.id)
                    .map((gc) => (
                      <Row key={gc.id} cat={gc} depth={2} />
                    ))}
                </Fragment>
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
  const { data: listings, isLoading } = useQuery(adminListingsQuery());
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Listing IDs that have at least one inquiry (spec §14 dead-listing rule).
  const { data: inquiredIds } = useQuery({
    queryKey: ["admin-inquired-listing-ids"],
    queryFn: async () => {
      const { data } = await supabase.from("conversations").select("listing_id").limit(5000);
      return new Set((data ?? []).map((c) => c.listing_id as string));
    },
    staleTime: 60_000,
  });

  const filtered = (listings ?? []).filter((l) => {
    if (statusFilter === "dead") {
      // Active > 30 days AND views < 10 AND zero inquiries.
      const ageDays = (Date.now() - new Date(l.created_at).getTime()) / 86400000;
      return l.status === "active" && ageDays > 30 && l.view_count < 10 && !inquiredIds?.has(l.id);
    }
    if (statusFilter === "all") return true;
    if (statusFilter === "other") return !["active", "reserved", "sold"].includes(l.status);
    return l.status === statusFilter;
  });

  const notifySeller = async (listingId: string) => {
    const target = (listings ?? []).find((l) => l.id === listingId);
    if (!target) return;
    const { error } = await supabase.rpc("admin_notify_user", {
      _user_id: target.seller_id,
      _type: "listing_stale",
      _payload: { title: target.title, listingId },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    void logAdminAction({
      action: "listing_stale_notified",
      entityType: "listing",
      entityId: listingId,
    });
    toast.success(t("toast.listingUpdated"));
  };

  const archiveListing = async (listingId: string) => {
    const { error } = await supabase
      .from("listings")
      .update({ status: "archived" })
      .eq("id", listingId);
    if (error) {
      toast.error(error.message);
      return;
    }
    void logAdminAction({ action: "listing_archived", entityType: "listing", entityId: listingId });
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["admin-listings"] });
  };

  const toggleFeatured = async (id: string, featured: boolean) => {
    const { error } = await supabase.from("listings").update({ featured }).eq("id", id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("toast.listingUpdated"));
    void logAdminAction({
      action: featured ? "listing_featured" : "listing_unfeatured",
      entityType: "listing",
      entityId: id,
      newValue: { featured },
    });
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
    void logAdminAction({ action: "listing_removed", entityType: "listing", entityId: id });
    queryClient.invalidateQueries({ queryKey: ["admin-listings"] });
    // Cloudinary photos + showcase videos leave with the listing.
    void deleteCloudinaryAssets(urls);
  };

  return (
    <>
      {/* Status sub-tabs (spec §5) — client-side over the fetched page. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "active", "reserved", "sold", "other", "dead"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all"
              ? t("admin.allStatuses")
              : s === "active"
                ? t("admin.statusActive")
                : s === "sold"
                  ? t("admin.statusSold")
                  : s === "reserved"
                    ? t("listing.statusReserved")
                    : s === "dead"
                      ? t("admin.deadListings")
                      : t("admin.statusOther")}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <span className="h-11 w-11 shrink-0 animate-pulse rounded-md bg-muted" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="block h-4 w-48 animate-pulse rounded bg-muted" />
                <span className="block h-3 w-32 animate-pulse rounded bg-muted" />
              </span>
            </li>
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("admin.noListings")}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((l) => {
            // Listing health dot (spec §13): green = fresh/active interest,
            // yellow = low views, orange = stale with no traction.
            const ageDays = (Date.now() - new Date(l.created_at).getTime()) / 86400000;
            const health =
              ageDays < 14 || l.view_count >= 20
                ? "#22c55e"
                : l.view_count > 0
                  ? "#eab308"
                  : "#f97316";
            return (
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
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: health }}
                      />
                      <span className="truncate text-sm font-medium">{l.title}</span>
                    </span>
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
                {/* Dead-listing nudges (spec §14) — shown when the dead filter is on. */}
                {statusFilter === "dead" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void notifySeller(l.id)}>
                      <Send className="mr-1.5 h-3.5 w-3.5" /> {t("admin.notifySeller")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deleting}
                      onClick={() => void archiveListing(l.id)}
                    >
                      {t("admin.archive")}
                    </Button>
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPendingDelete({ id: l.id, title: l.title })}
                  className="text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

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

/** Acquisition analytics (spec §8.2, §26): activity per source. */
function AnalyticsTab() {
  const { t } = useLang();
  const [rangeDays, setRangeDays] = useState<30 | 90>(90);
  const { data: sources } = useQuery({
    queryKey: ["admin-acquisition", rangeDays],
    queryFn: async () => {
      // Signups are recorded as analytics events by the auth flow; listings
      // carry their creation event too. Group client-side — volumes are small.
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name,source")
        .gte("created_at", new Date(Date.now() - rangeDays * 86400000).toISOString())
        .limit(5000);
      if (error) throw error;
      type Row = { signups: number; listings: number };
      const map = new Map<string, Row>();
      for (const e of data ?? []) {
        const src = e.source || "direct";
        const row = map.get(src) ?? { signups: 0, listings: 0 };
        if (e.event_name === "signup" || e.event_name === "user_signed_up") row.signups += 1;
        if (e.event_name === "listing_created" || e.event_name === "listing_published")
          row.listings += 1;
        map.set(src, row);
      }
      return [...map.entries()]
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.signups + b.listings - (a.signups + a.listings));
    },
  });

  // Seller performance (spec SS8.4 / SS16) — operational metrics per seller.
  const { data: sellers } = useQuery({
    queryKey: ["admin-seller-performance"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_seller_performance", { _limit: 15 });
      if (error) throw error;
      return (data ?? []) as unknown as {
        seller_id: string;
        name: string;
        verified: boolean;
        suspended: boolean;
        listings: number;
        views: number;
        inquiries: number;
        responded: number;
        avg_response_minutes: number | null;
        sales: number;
        rating: number | null;
        reports: number;
      }[];
    },
  });

  return (
    <div className="space-y-8">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle
            icon={<Globe className="h-5 w-5 text-primary" />}
            title={t("admin.acquisitionSources")}
            accent="bg-violet-500"
          />
          <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5 text-xs">
            {([30, 90] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRangeDays(r)}
                className={
                  "rounded-md px-2.5 py-1 font-medium transition " +
                  (rangeDays === r
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("admin.acquisitionHint")}</p>
        {!sources ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("browse.loading")}</p>
        ) : sources.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.noSourceData")}</p>
        ) : (
          <table className="mt-3 w-full max-w-lg text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">{t("admin.sourceCol")}</th>
                <th className="px-2 py-2">{t("admin.signupsCol")}</th>
                <th className="px-2 py-2">{t("admin.listingsCol")}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium capitalize">{s.source}</td>
                  <td className="px-2 py-2 tabular-nums">{s.signups}</td>
                  <td className="px-2 py-2 tabular-nums">{s.listings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<Users className="h-5 w-5 text-primary" />}
          title={t("admin.sellerPerformance")}
          accent="bg-emerald-500"
        />
        {!sellers ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("browse.loading")}</p>
        ) : sellers.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.noUsers")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">—</th>
                  <th className="px-2 py-2">{t("admin.cat.listings")}</th>
                  <th className="px-2 py-2">{t("admin.cat.views")}</th>
                  <th className="px-2 py-2">{t("admin.cat.inquiries")}</th>
                  <th className="px-2 py-2">{t("admin.responseRate")}</th>
                  <th className="px-2 py-2">{t("admin.avgResponse")}</th>
                  <th className="px-2 py-2">{t("admin.cat.sold")}</th>
                  <th className="px-2 py-2">★</th>
                  <th className="px-2 py-2">{t("admin.reports")}</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.seller_id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {s.name}
                      {s.verified ? (
                        <BadgeCheck className="ml-1 inline h-3.5 w-3.5 text-primary" />
                      ) : null}
                      {s.suspended ? (
                        <span className="ml-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                          {t("admin.suspendedSegment")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{s.listings}</td>
                    <td className="px-2 py-2 tabular-nums">{s.views.toLocaleString()}</td>
                    <td className="px-2 py-2 tabular-nums">{s.inquiries}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {s.inquiries > 0 ? `${Math.round((s.responded / s.inquiries) * 100)}%` : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {s.avg_response_minutes != null
                        ? `${s.avg_response_minutes} ${t("admin.minutesShort")}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{s.sales}</td>
                    <td className="px-2 py-2 tabular-nums">{s.rating ?? "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{s.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Read-only accountability trail (spec §21). */
function AuditLogTab() {
  const { t } = useLang();
  const { data: entries } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id,action,entity_type,entity_id,reason,created_at,profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        action: string;
        entity_type: string;
        entity_id: string | null;
        reason: string | null;
        created_at: string;
        profiles: { full_name: string | null } | null;
      }[];
    },
  });

  if (!entries || entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("admin.auditLogEmpty")}</p>;
  }

  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium capitalize">
              {e.action.replaceAll("_", " ")}
              <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {e.entity_type}
              </span>
            </p>
            {e.reason ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">“{e.reason}”</p>
            ) : null}
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">
            {t("admin.by")} {e.profiles?.full_name ?? "—"} · {timeAgo(e.created_at)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Telegram management (spec SS19): bot health, post history, attribution. */
function TelegramTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["admin-telegram-tab"],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [linked, blocked, delivery, posts, tgEvents, unposted] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .not("telegram_chat_id", "is", null),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("telegram_blocked", true),
        supabase.from("telegram_delivery_log").select("ok,error").gte("created_at", weekAgo),
        supabase
          .from("telegram_channel_posts")
          .select("listing_id,message_id,posted_at,listings(title,status)")
          .order("posted_at", { ascending: false })
          .limit(20),
        supabase
          .from("analytics_events")
          .select("event_name")
          .eq("source", "telegram")
          .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
          .limit(5000),
        supabase
          .from("listings")
          .select("id,title,telegram_posted_at")
          .eq("status", "active")
          .is("telegram_posted_at", null)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      const okCount = (delivery.data ?? []).filter((d) => d.ok).length;
      return {
        linked: linked.count ?? 0,
        blocked: blocked.count ?? 0,
        sends7d: (delivery.data ?? []).length,
        successPct:
          (delivery.data ?? []).length > 0
            ? Math.round((okCount / (delivery.data ?? []).length) * 100)
            : 100,
        errors: (delivery.data ?? []).filter((d) => !d.ok).slice(0, 5),
        posts: (posts.data ?? []) as unknown as {
          listing_id: string;
          message_id: number;
          posted_at: string;
          listings: { title: string; status: string } | null;
        }[],
        tgSignups: (tgEvents.data ?? []).filter((e) => e.event_name.includes("signup")).length,
        tgClicks: (tgEvents.data ?? []).filter((e) => e.event_name.includes("click")).length,
        unposted: (unposted.data ?? []) as { id: string; title: string }[],
      };
    },
  });

  if (!stats) {
    return <p className="text-sm text-muted-foreground">{t("browse.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Bot health */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat label={t("admin.tgLinked")} value={stats.linked} />
        <MiniStat label={t("admin.tgBlocked")} value={stats.blocked} />
        <MiniStat label={t("admin.tgSends")} value={stats.sends7d} />
        <MiniStat label={t("admin.tgSuccess")} value={`${stats.successPct}%`} />
      </div>

      {/* Attribution funnel (spec SS25): telegram-sourced events, 30d. */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<Radio className="h-5 w-5 text-primary" />}
          title={t("admin.tgAttribution")}
          accent="bg-sky-500"
        />
        <p className="mt-3 text-sm text-muted-foreground">{t("admin.acquisitionHint")}</p>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
          <EngStat
            icon={<Users className="h-4 w-4" />}
            label={t("admin.tgSignups")}
            value={stats.tgSignups}
          />
          <EngStat
            icon={<Eye className="h-4 w-4" />}
            label={t("admin.tgClicks")}
            value={stats.tgClicks}
          />
        </div>
      </div>

      {/* Manual post trigger for fresh listings */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<Send className="h-5 w-5 text-primary" />}
          title={t("admin.tgManualPost")}
          accent="bg-primary"
        />
        {stats.unposted.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.tgAllPosted")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {stats.unposted.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-md border p-2.5"
              >
                <span className="min-w-0 truncate text-sm font-medium">{l.title}</span>
                <Button size="sm" variant="outline" onClick={() => announceListing(l.id)}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> {t("admin.tgPostNow")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Post history */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<FileText className="h-5 w-5 text-primary" />}
          title={t("admin.tgPostHistory")}
          accent="bg-violet-500"
        />
        {stats.posts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.noSourceData")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {stats.posts.map((p) => (
              <li
                key={p.listing_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <Link
                  to="/listing/$id"
                  params={{ id: p.listing_id }}
                  className="min-w-0 truncate font-medium hover:text-primary"
                >
                  {p.listings?.title ?? p.listing_id}
                </Link>
                <span className="text-xs text-muted-foreground">
                  msg #{p.message_id} · {timeAgo(p.posted_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delivery errors */}
      {stats.errors.length > 0 ? (
        <div className="rounded-xl border bg-card p-5">
          <PanelTitle
            icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
            title={t("admin.tgFailures7d")}
            accent="bg-destructive"
          />
          <ul className="mt-3 space-y-1.5">
            {stats.errors.map((e, i) => (
              <li
                key={i}
                className="truncate rounded bg-destructive/5 px-3 py-1.5 text-xs text-destructive"
              >
                {e.error ?? t("toast.requestFailed")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Featured listing management with scheduling (spec SS20). */
function FeaturedTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();

  const { data: rows } = useQuery({
    queryKey: ["admin-featured"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id,title,price,status,featured,featured_until,seller_id,profiles(full_name,shop_name)",
        )
        .eq("featured", true)
        .order("featured_until", { ascending: true, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        title: string;
        price: number;
        status: string;
        featured_until: string | null;
        profiles: { full_name: string | null; shop_name: string | null } | null;
      }[];
    },
  });

  const setUntil = async (id: string, days: number | null) => {
    const until = days == null ? null : new Date(Date.now() + days * 86400000).toISOString();
    const { error } = await supabase
      .from("listings")
      .update({ featured_until: until, ...(until == null ? {} : {}) })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void logAdminAction({
      action: "listing_featured_scheduled",
      entityType: "listing",
      entityId: id,
      newValue: { featured_until: until },
    });
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["admin-featured"] });
  };

  const expireNow = async (id: string) => {
    const { error } = await supabase
      .from("listings")
      .update({ featured: false, featured_until: null })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void logAdminAction({ action: "listing_unfeatured", entityType: "listing", entityId: id });
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["admin-featured"] });
  };

  if (!rows) {
    return <p className="text-sm text-muted-foreground">{t("browse.loading")}</p>;
  }

  const active = rows.filter((r) => !r.featured_until || new Date(r.featured_until) > new Date());
  const expired = rows.filter((r) => r.featured_until && new Date(r.featured_until) <= new Date());

  return (
    <div className="space-y-6">
      {(
        [
          ["admin.featuredActive", active],
          ["admin.featuredExpired", expired],
        ] as const
      ).map(([key, list]) =>
        list.length === 0 ? null : (
          <div key={key}>
            <p className="font-display text-lg font-semibold">{t(key)}</p>
            <ul className="mt-3 space-y-2">
              {list.map((r) => {
                const expiredRow = !!r.featured_until && new Date(r.featured_until) <= new Date();
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <Link
                        to="/listing/$id"
                        params={{ id: r.id }}
                        className="block truncate text-sm font-medium hover:text-primary"
                      >
                        {r.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatBirr(r.price)} ·{" "}
                        {r.profiles?.shop_name ?? r.profiles?.full_name ?? "—"} ·{" "}
                        {expiredRow
                          ? `${t("admin.featuredExpired")} ${timeAgo(r.featured_until!)}`
                          : r.featured_until
                            ? t("admin.featuredUntil", {
                                date: new Date(r.featured_until).toLocaleDateString(),
                              })
                            : t("admin.featuredPermanent")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!expiredRow ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setUntil(r.id, 7)}>
                            +7d
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setUntil(r.id, 30)}>
                            +30d
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setUntil(r.id, null)}>
                            ∞
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => expireNow(r.id)}>
                            {t("admin.featureExpire")}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setUntil(r.id, 7)}>
                          {t("admin.featureRenew")}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ),
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.noFeatured")}</p>
      ) : null}
    </div>
  );
}

/** Settings (spec SS22-23): roles matrix, system health, marketplace rules. */
function SettingsTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: isAdminUser } = useQuery(isAdminQuery(user?.id));
  const { data: isSuper } = useQuery({
    queryKey: ["admin-is-super", user?.id],
    enabled: !!isAdminUser,
    queryFn: async () => {
      if (!user) return false;
      // admin_get_profile_details returns role metadata for every account.
      const { data } = await supabase.rpc("admin_get_profile_details", {});
      const me = ((data ?? []) as unknown as AdminUser[]).find((u) => u.id === user.id);
      return !!me?.is_super_admin;
    },
  });

  // System health (spec SS23) — lightweight probes.
  const { data: health } = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: async () => {
      const todayIso = new Date().setHours(0, 0, 0, 0);
      const [db, storage] = await Promise.all([
        supabase.from("listings").select("id", { count: "exact", head: true }).limit(1),
        supabase.storage.from("listing-images").list("", { limit: 1 }),
      ]);
      const { count: tgErrors } = await supabase
        .from("telegram_delivery_log")
        .select("ok", { count: "exact", head: true })
        .eq("ok", false)
        .gte("created_at", new Date(todayIso).toISOString());
      return {
        db: !db.error,
        storage: !storage.error,
        telegram: telegramConfigured(),
        email: true,
        tgErrorsToday: tgErrors ?? 0,
      };
    },
    refetchInterval: 5 * 60_000,
  });

  const { data: settings } = useQuery({
    queryKey: ["admin-app-settings"],
    enabled: !!isAdminUser,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key,value");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<
        string,
        unknown
      >;
    },
  });

  const setSetting = async (key: string, value: Json) => {
    const me = await supabase.auth.getUser();
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_by: me.data.user?.id ?? null });
    if (error) {
      toast.error(error.message);
      return;
    }
    void logAdminAction({
      action: "setting_changed",
      entityType: "app_settings",
      entityId: key,
      newValue: { value },
    });
    queryClient.invalidateQueries({ queryKey: ["admin-app-settings"] });
  };

  const boolSetting = (key: string) => settings?.[key] === true;

  return (
    <div className="space-y-8">
      {/* System health */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<Activity className="h-5 w-5 text-primary" />}
          title={t("admin.systemHealth")}
          accent="bg-emerald-500"
        />
        <ul className="mt-3 space-y-1.5 text-sm">
          {[
            ["API / Database", health?.db],
            ["Storage", health?.storage],
            ["Telegram Bot", health ? health.telegram : null],
            ["Email", health ? health.email : null],
          ].map(([label, ok]) => (
            <li key={label as string} className="flex items-center gap-2">
              <span aria-hidden>{ok == null ? "⚪" : ok ? "🟢" : "🔴"}</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("admin.tgFailures")}: {health?.tgErrorsToday ?? 0}
        </p>
      </div>

      {/* Roles & permissions — matrix per spec SS22. */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<ShieldCheck className="h-5 w-5 text-primary" />}
          title={t("admin.rolesPermissions")}
          accent="bg-sky-500"
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">{t("admin.role")}</th>
                <th className="px-2 py-2">{t("admin.permScope")}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Super Admin", t("admin.permAll")],
                ["Moderator", `${t("admin.moderation")} · Listings · ${t("admin.disputes")}`],
                ["Verification Admin", t("admin.verification")],
                ["Category Manager", t("nav.categories")],
                ["Analytics Viewer", t("admin.analytics")],
              ].map(([role, scope]) => (
                <tr key={role} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{role}</td>
                  <td className="px-2 py-2 text-muted-foreground">{scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isSuper ? t("admin.superAdminYou") : t("admin.rolesNote")}
        </p>
      </div>

      {/* Marketplace & moderation rules */}
      <div className="rounded-xl border bg-card p-5">
        <PanelTitle
          icon={<FolderTree className="h-5 w-5 text-primary" />}
          title={t("admin.marketplaceSettings")}
          accent="bg-primary"
        />
        {!settings ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("browse.loading")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(
              [
                ["moderation.auto_flag_views", t("admin.setAutoFlag")],
                ["notifications.email_enabled", t("admin.setEmailNotifs")],
                ["notifications.telegram_enabled", t("admin.setTgNotifs")],
              ] as const
            ).map(([key, label]) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5"
              >
                <span className="text-sm">{label}</span>
                <button
                  type="button"
                  onClick={() => setSetting(key, !boolSetting(key))}
                  className={
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                    (boolSetting(key) ? "bg-primary" : "bg-secondary")
                  }
                  aria-label={label}
                >
                  <span
                    className={
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " +
                      (boolSetting(key) ? "left-[22px]" : "left-0.5")
                    }
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t("admin.settingsNote")}</p>
      </div>
    </div>
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
                  {/* Item 40: a chart you cannot follow is just decoration. Each
                      bar runs the search it is reporting on. */}
                  <Link
                    to="/browse"
                    search={{ q: s.name }}
                    className="group block rounded-md p-1 -m-1 transition-colors hover:bg-secondary"
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground group-hover:underline">
                        {s.name}
                      </span>
                      <span>{s.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </Link>
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
              const bar = (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground group-hover:underline">
                      {c.name}
                    </span>
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
                </>
              );
              return (
                <li key={c.name}>
                  {/* Uncategorised listings have no slug to filter by, so that
                      row stays plain text rather than linking nowhere. */}
                  {c.slug ? (
                    <Link
                      to="/browse"
                      search={{ category: c.slug }}
                      className="group block rounded-md p-1 -m-1 transition-colors hover:bg-secondary"
                    >
                      {bar}
                    </Link>
                  ) : (
                    <div className="p-1 -m-1">{bar}</div>
                  )}
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
          <span>
            {t("admin.tgDegraded")}: <b className="text-foreground">{stats.telegramDegraded7d}</b>
          </span>
        </div>
        {stats.telegramFailureBreakdown.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium text-foreground">{t("admin.tgFailureBreakdown")}</p>
            <ul className="mt-1.5 space-y-1">
              {stats.telegramFailureBreakdown.map((r) => (
                <li
                  key={`${r.kind} ${r.error}`}
                  className="flex items-start gap-2 text-xs text-muted-foreground"
                >
                  <span className="mt-px shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 font-mono font-semibold text-destructive">
                    {r.count}×
                  </span>
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono">
                    {r.kind}
                  </span>
                  <span className="min-w-0 break-words">{r.error}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
