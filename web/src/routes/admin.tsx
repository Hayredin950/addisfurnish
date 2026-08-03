import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Ban,
  ClipboardCheck,
  FileCheck2,
  Flag,
  FolderTree,
  LayoutList,
  LogOut,
  Pencil,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListingsQuery,
  adminReportsQuery,
  adminStatsQuery,
  adminTopCategoriesQuery,
  adminVerificationDecisionsQuery,
  adminVerificationQueueQuery,
  categoriesQuery,
  isAdminQuery,
  pendingSellersQuery,
  type Category,
} from "@/lib/marketplace";
import {
  adminBanUser,
  adminRevokeSessions,
  adminVerifyDocument,
  adminVerifySellerDirect,
} from "@/lib/admin";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { RequireAuth } from "@/components/RequireAuth";
import { useImageUrl } from "@/lib/storage";
import { timeAgo, formatBirr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — SuqBet" },
      { name: "description", content: "Moderate reports, verify sellers and view platform stats." },
      { property: "og:title", content: "Admin — SuqBet" },
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

      <Tabs defaultValue="reports" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="reports">{t("admin.reports")}</TabsTrigger>
          <TabsTrigger value="sellers">{t("admin.sellers")}</TabsTrigger>
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
        <TabsContent value="sellers" className="mt-6">
          <SellersTab />
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
          <StatsTab />
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
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("toast.listingUpdated"));
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

function SellersTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: sellers } = useQuery(pendingSellersQuery());

  const verify = async (id: string) => {
    // Routed through the server so the decision is audited and the seller is
    // notified — the badge can never be granted without a log entry.
    const res = await adminVerifySellerDirect({ data: { userId: id } });
    if (!res.ok) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("admin.verifiedOk"));
    queryClient.invalidateQueries({ queryKey: ["admin-sellers"] });
    queryClient.invalidateQueries({ queryKey: ["admin-verification-decisions"] });
  };

  const revokeSessions = async (id: string) => {
    const res = await adminRevokeSessions({ data: { userId: id } });
    if (!res.ok) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("admin.sessionsRevoked"));
  };

  const ban = async (id: string) => {
    const res = await adminBanUser({ data: { userId: id, hours: 24 } });
    if (!res.ok) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("admin.banned"));
  };

  if (!sellers || sellers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("admin.noSellers")}</p>;
  }

  return (
    <ul className="space-y-3">
      {sellers.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4"
        >
          <div>
            <p className="text-sm font-medium">{s.shop_name ?? s.full_name}</p>
            <p className="text-xs text-muted-foreground">
              {s.city ?? "—"} · {timeAgo(s.created_at)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => revokeSessions(s.id)}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> {t("admin.revokeSessions")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => ban(s.id)}
              className="text-destructive"
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" /> {t("admin.ban")}
            </Button>
            <Button size="sm" onClick={() => verify(s.id)}>
              <BadgeCheck className="mr-1.5 h-4 w-4" /> {t("admin.approve")}
            </Button>
          </div>
        </li>
      ))}
    </ul>
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
    profiles?: { full_name: string; shop_name: string | null; shop_slug: string | null } | null;
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
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {doc.profiles?.shop_name ?? doc.profiles?.full_name ?? doc.id}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(ADMIN_DOC_TYPE_KEY[doc.document_type] ?? "verif.docTypeother")} ·{" "}
            {timeAgo(doc.created_at)}
          </p>
        </div>
        {rejecting ? null : (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="destructive" disabled={busy} onClick={onStartReject}>
              {t("admin.reject")}
            </Button>
            <Button size="sm" disabled={busy} onClick={onApprove}>
              <BadgeCheck className="mr-1.5 h-3.5 w-3.5" /> {t("admin.approve")}
            </Button>
          </div>
        )}
      </div>
      {doc.file_url && !doc.file_url.startsWith("demo/") ? (
        <div className="mt-3 max-h-64 overflow-hidden rounded-md border bg-muted">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt="Verification document"
              className="mx-auto max-h-64 w-auto object-contain"
            />
          ) : null}
        </div>
      ) : null}
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
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const roots = (categories ?? []).filter((c) => !c.parent_id);
  const children = (categories ?? []).filter((c) => c.parent_id);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["categories"] });

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
      sort_order: 1,
    });
    setBusy(false);
    if (error) {
      toast.error(t("toast.couldNotPublish"));
      return;
    }
    setName("");
    setParentId("");
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
      .update({ name: renameValue.trim(), slug })
      .eq("id", id);
    setRenamingId(null);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    invalidate();
  };

  const remove = async (id: string, hasChildren: boolean) => {
    if (
      hasChildren &&
      !window.confirm("This category has sub-categories — they will be removed too.")
    ) {
      return;
    }
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("toast.listingUpdated"));
    invalidate();
  };

  const Row = ({ cat, depth }: { cat: Category; depth: number }) => (
    <li
      className={`flex items-center gap-2 rounded-lg border bg-card p-3 ${depth > 0 ? "ml-6" : ""}`}
    >
      {renamingId === cat.id ? (
        <>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="h-8 flex-1"
          />
          <Button size="sm" onClick={() => rename(cat.id)}>
            {t("profile.save")}
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm font-medium">{cat.name}</span>
          <span className="text-xs text-muted-foreground">/{cat.slug}</span>
          <button
            type="button"
            aria-label="Rename"
            onClick={() => {
              setRenamingId(cat.id);
              setRenameValue(cat.name);
            }}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Delete"
            onClick={() => remove(cat.id, !!categories?.some((c) => c.parent_id === cat.id))}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </li>
  );

  return (
    <div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Add category</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Root category</option>
            {roots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button disabled={!name.trim() || busy} onClick={add}>
            Add
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
    </div>
  );
}

function ListingsTab() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: listings } = useQuery(adminListingsQuery());

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
    if (!window.confirm("Delete this listing permanently?")) return;
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["admin-listings"] });
  };

  return (
    <ul className="space-y-2">
      {(listings ?? []).map((l) => (
        <li key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
          <Link to="/listing/$id" params={{ id: l.id }} className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{l.title}</span>
            <span className="text-xs text-muted-foreground">
              {formatBirr(l.price)} · {t("dash.statsViews")}: {l.view_count} ·{" "}
              {timeAgo(l.created_at)}
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
            onClick={() => remove(l.id)}
            className="text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function StatsTab() {
  const { t } = useLang();
  const { data: stats } = useQuery(adminStatsQuery());
  const { data: topCategories } = useQuery(adminTopCategoriesQuery());

  if (!stats) {
    return <p className="text-sm text-muted-foreground">{t("browse.loading")}</p>;
  }

  const cards = [
    { label: t("admin.totalListings"), value: stats.listings },
    { label: t("admin.totalUsers"), value: stats.users },
    { label: t("admin.totalSellers"), value: stats.sellers },
    { label: t("admin.totalViews"), value: stats.totalViews },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-soft">
            <p className="font-display text-3xl font-semibold text-primary">{c.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
      {stats.topSearches.length > 0 ? (
        <div className="mt-8 rounded-lg border bg-card p-5">
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <TrendingUp className="h-5 w-5 text-primary" /> {t("admin.topSearches")}
          </p>
          <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {stats.topSearches.map((q, i) => (
              <li key={q}>
                <span className="mr-2 inline-block w-5 text-right font-semibold text-primary">
                  {i + 1}
                </span>
                {q}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {(topCategories ?? []).length > 0 ? (
        <div className="mt-8 rounded-lg border bg-card p-5">
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <FolderTree className="h-5 w-5 text-primary" /> {t("admin.topCategories")}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
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
    </div>
  );
}
