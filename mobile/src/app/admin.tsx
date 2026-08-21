import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { useAsync } from "../hooks/use-async";
import {
  banUser,
  createCategory,
  decideDocument,
  deleteCategory,
  toggleCategoryActive,
  deleteListingAdmin,
  requestRoleChange,
  confirmRoleChange as confirmRoleChangeApi,
  fetchAdminCategories,
  fetchAdminCategoryCounts,
  fetchAdminListings,
  fetchAdminReports,
  fetchAdminStats,
  fetchAdminTopCategories,
  fetchAdminTopSearches,
  fetchAdminTrend,
  fetchAdminUsers,
  fetchVerificationDecisions,
  fetchVerificationQueue,
  isAdmin,
  moveCategory,
  renameCategory,
  resolveReport,
  revokeSessions,
  toggleFeatured,
  unbanUser,
  type AdminReport,
  type AdminUser,
  type AdminVerificationDoc,
} from "../lib/admin";
import { CATEGORY_ICON_KEYS, categoryIcon } from "../lib/category-icons";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { EmptyState } from "../components/EmptyState";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { signedDocumentUrl, imageSource } from "../lib/storage";
import { formatBirr, timeAgo } from "../lib/format";
import type { DictKey } from "../lib/i18n";

type Tab = "reports" | "verification" | "users" | "categories" | "listings" | "stats";

/** A labeled value row used inside the user-detail modal. */
function DetailRow({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={{ marginTop: 2 }}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={[styles.detailRowValue, danger && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.detailSectionLabel}>{title}</Text>
      {children}
    </View>
  );
}

const TAB_LABELS: Record<Tab, DictKey> = {
  reports: "adminTabReports",
  verification: "adminTabVerification",
  users: "adminTabUsers",
  categories: "adminTabCategories",
  listings: "adminTabListings",
  stats: "adminTabStats",
};

const TAB_ICONS: Record<Tab, keyof typeof Ionicons.glyphMap> = {
  reports: "flag",
  verification: "shield-checkmark",
  users: "people",
  categories: "grid",
  listings: "list",
  stats: "bar-chart",
};

/**
 * Moderation console for admins (mirrors the web /admin screen, scaled to a
 * phone): report resolution, the seller-verification queue with document
 * preview and audit trail, user suspension, plus categories / listings /
 * platform stats. Every action re-verifies the admin role server-side — the
 * UI is only the trigger.
 */
export default function AdminScreen() {
  const { user } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("reports");
  const [drill, setDrill] = useState<"all" | "sellers" | null>(null);
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    void isAdmin(user?.id).then(setAdmin);
  }, [user?.id]);

  if (admin === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!admin) {
    return (
      <View style={styles.center}>
        <EmptyState icon="🔒" title={t("adminDenied")} hint={t("adminDeniedHint")} />
      </View>
    );
  }

  const tabs = Object.keys(TAB_LABELS) as Tab[];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroller}
        contentContainerStyle={styles.tabs}
      >
        {tabs.map((key) => (
          <Pressable
            key={key}
            style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
            onPress={() => setTab(key)}
          >
            <Ionicons
              name={TAB_ICONS[key]}
              size={14}
              color={tab === key ? colors.onPrimary : colors.textMuted}
            />
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {t(TAB_LABELS[key])}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {tab === "reports" ? <ReportsTab /> : null}
      {tab === "verification" ? <VerificationTab /> : null}
      {tab === "users" ? <UsersTab drillFilter={drill} /> : null}
      {tab === "categories" ? <CategoriesTab /> : null}
      {tab === "listings" ? <ListingsTab /> : null}
      {tab === "stats" ? (
        <StatsTab
          onOpenUsers={(f) => {
            setDrill(f);
            setTab("users");
          }}
          onOpenListings={() => setTab("listings")}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

function ReportsTab() {
  const { t } = useLang();
  const toast = useToast();
  const reports = useAsync(fetchAdminReports, []);

  const act = async (r: AdminReport, status: "reviewed" | "dismissed") => {
    try {
      await resolveReport(r, status);
      toast.success(t("adminReporterNotified"));
      reports.refetch();
    } catch (err) {
      toast.error(err, t("oops"));
    }
  };

  if (reports.loading && !reports.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!reports.data || reports.data.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState icon="✅" title={t("adminNoReports")} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
      {reports.data.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {r.listings?.title ?? r.profiles?.shop_name ?? r.profiles?.full_name ?? r.reason}
          </Text>
          <Text style={styles.muted}>
            {t("reportReason")}: {r.reason} · {timeAgo(r.created_at)}
          </Text>
          {r.details ? <Text style={styles.muted}>{r.details}</Text> : null}
          <View style={styles.rowBtns}>
            <Button
              title={t("adminDismiss")}
              variant="outline"
              size="sm"
              onPress={() => act(r, "dismissed")}
              style={{ flex: 1 }}
            />
            <Button
              title={t("adminResolved")}
              size="sm"
              onPress={() => act(r, "reviewed")}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function VerificationTab() {
  const { t } = useLang();
  const toast = useToast();
  const queue = useAsync(fetchVerificationQueue, []);
  const decisions = useAsync(fetchVerificationDecisions, []);
  const [rejecting, setRejecting] = useState<AdminVerificationDoc | null>(null);
  const [reason, setReason] = useState("");
  const [viewing, setViewing] = useState<AdminVerificationDoc | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    queue.refetch();
    decisions.refetch();
  };

  const decide = async (doc: AdminVerificationDoc, action: "approved" | "rejected") => {
    setBusy(true);
    try {
      await decideDocument(doc.id, action, action === "rejected" ? reason : undefined);
      toast.success(action === "approved" ? t("adminVerifiedOk") : t("adminRejectedOk"));
      setRejecting(null);
      setReason("");
      invalidate();
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setBusy(false);
    }
  };

  const openDoc = (doc: AdminVerificationDoc) => {
    setViewing(doc);
    setDocUrl(null);
    if (!doc.file_url || doc.file_url.startsWith("demo/")) return;
    void signedDocumentUrl(doc.file_url).then(setDocUrl);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 16 }}>
      <Text style={styles.sectionTitle}>{t("adminQueue")}</Text>
      {queue.data && queue.data.length === 0 ? (
        <Text style={styles.muted}>{t("adminQueueEmpty")}</Text>
      ) : null}
      {(queue.data ?? []).map((doc) => {
        const seller = doc.profiles?.shop_name ?? doc.profiles?.full_name ?? doc.seller_id;
        return (
          <View key={doc.id} style={styles.card}>
            <Text style={styles.cardTitle}>{seller}</Text>
            <Text style={styles.muted}>
              {t("adminDocType")}: {doc.document_type} · {timeAgo(doc.created_at)}
            </Text>
            {doc.file_url && !doc.file_url.startsWith("demo/") ? (
              <Pressable onPress={() => openDoc(doc)}>
                <View style={styles.docPreview}>
                  <Ionicons name="document-text" size={18} color={colors.primary} />
                  <Text style={styles.docPreviewText}>{t("adminViewDocument")}</Text>
                </View>
              </Pressable>
            ) : (
              <Text style={styles.muted}>{t("adminDocumentMissing")}</Text>
            )}
            {rejecting?.id === doc.id ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder={t("adminRejectPlaceholder")}
                  placeholderTextColor={colors.textSoft}
                  style={styles.input}
                  multiline
                />
                <View style={styles.rowBtns}>
                  <Button
                    title={t("cancel")}
                    variant="outline"
                    size="sm"
                    onPress={() => setRejecting(null)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={t("adminConfirmReject")}
                    variant="danger"
                    size="sm"
                    disabled={busy || reason.trim().length < 3}
                    onPress={() => decide(doc, "rejected")}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : (
              <View style={[styles.rowBtns, { marginTop: 10 }]}>
                <Button
                  title={t("adminReject")}
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onPress={() => {
                    setRejecting(doc);
                    setReason("");
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  title={t("adminApprove")}
                  size="sm"
                  disabled={busy}
                  onPress={() => decide(doc, "approved")}
                  style={{ flex: 1 }}
                />
              </View>
            )}
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>{t("adminAuditTrail")}</Text>
      {decisions.data && decisions.data.length === 0 ? (
        <Text style={styles.muted}>{t("adminAuditEmpty")}</Text>
      ) : null}
      {(decisions.data ?? []).map((d) => (
        <View key={d.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {d.seller?.shop_name ?? d.seller?.full_name ?? d.seller_id}
          </Text>
          <Text
            style={[styles.muted, { color: d.action === "approved" ? colors.success : colors.danger }]}
          >
            {d.action}
          </Text>
          {d.reason ? <Text style={styles.muted}>{d.reason}</Text> : null}
          <Text style={styles.muted}>
            {t("adminBy")} {d.profiles?.full_name ?? d.reviewer_id} · {timeAgo(d.created_at)}
          </Text>
        </View>
      ))}

      {/* Document viewer */}
      <Modal visible={!!viewing} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.docModal}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {viewing ? viewing.profiles?.shop_name ?? viewing.seller_id : ""}
            </Text>
            {docUrl ? (
              <Image source={{ uri: docUrl }} style={styles.docImage} resizeMode="contain" />
            ) : viewing && viewing.file_url.startsWith("demo/") ? (
              <View style={[styles.docImage, styles.docImageEmpty]}>
                <Text style={styles.muted}>{t("adminDocumentMissing")}</Text>
              </View>
            ) : (
              <View style={[styles.docImage, styles.docImageEmpty]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            <Button title={t("cancel")} variant="outline" onPress={() => setViewing(null)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const BAN_OPTIONS = [
  { key: "24h", hours: 24, label: "24h" },
  { key: "7d", hours: 24 * 7, label: "7d" },
  { key: "30d", hours: 24 * 30, label: "30d" },
  { key: "permanent", hours: 24 * 365 * 10, label: "permanent" },
];

function UsersTab({ drillFilter }: { drillFilter: "all" | "sellers" | null }) {
  const { t } = useLang();
  const toast = useToast();
  const { user } = useAuth();
  const users = useAsync(fetchAdminUsers, []);
  const [filter, setFilter] = useState<"all" | "sellers" | "buyers">("all");
  // Stats-tab drill-down: "Verified sellers" opens this tab pre-filtered.
  useEffect(() => {
    if (drillFilter) setFilter(drillFilter);
  }, [drillFilter]);
  const [search, setSearch] = useState("");
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);
  const [banDuration, setBanDuration] = useState(BAN_OPTIONS[0]!);
  const [banReason, setBanReason] = useState("");
  const [roleTarget, setRoleTarget] = useState<{
    id: string;
    name: string;
    action: "promote" | "demote";
  } | null>(null);
  const [roleCodeSent, setRoleCodeSent] = useState(false);
  const [roleCode, setRoleCode] = useState("");
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users.data ?? []).filter((u) => {
      if (filter === "sellers" && !u.is_seller) return false;
      if (filter === "buyers" && u.is_seller) return false;
      if (!q) return true;
      const name = (u.shop_name ?? u.full_name ?? "").toLowerCase();
      return (
        name.includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q) ||
        (u.city ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [users.data, filter, search]);

  const revoke = async (id: string) => {
    try {
      await revokeSessions(id);
      toast.success(t("adminSessionsRevoked"));
    } catch (err) {
      toast.error(err, t("oops"));
    }
  };

  const confirmBan = async () => {
    if (!banTarget) return;
    setBusy(true);
    try {
      await banUser(banTarget.id, banDuration.hours, banReason.trim() || undefined);
      toast.success(t("adminBanned"));
      setBanTarget(null);
      setBanReason("");
      users.refetch();
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setBusy(false);
    }
  };

  const lift = async (id: string) => {
    try {
      await unbanUser(id);
      toast.success(t("adminUnbanned"));
      users.refetch();
    } catch (err) {
      toast.error(err, t("oops"));
    }
  };  const handleRoleChange = async () => {
    if (!roleTarget) return;
    setBusy(true);
    try {
      const res = await requestRoleChange(roleTarget.id, roleTarget.action);
      setBusy(false);
      if (!res.ok) {
        toast.error(
          null,
          res.error === "super_admin"
            ? t("adminSuperAdminProtected")
            : res.error === "already_admin"
              ? t("adminRoleChangeAlreadyAdmin")
              : res.error === "not_admin"
                ? t("adminRoleChangeNotAdmin")
                : t("adminRoleChangeFailed"),
        );
        return;
      }
      toast.success(t("adminRoleChangeEmailSent"));
      setRoleCodeSent(true);
    } catch {
      setBusy(false);
      toast.error(null, t("adminRoleChangeFailed"));
    }
  };

  const handleRoleConfirmCode = async () => {
    if (!roleTarget || roleCode.length !== 6) return;
    setBusy(true);
    try {
      const res = await confirmRoleChangeApi(roleCode);
      setBusy(false);
      if (!res.ok) {
        toast.error(
          null,
          res.error === "expired"
            ? t("adminRoleChangeExpired")
            : res.error === "invalid"
              ? t("adminRoleChangeInvalidCode")
              : res.error === "super_admin"
                ? t("adminSuperAdminProtected")
                : t("adminRoleChangeFailed"),
        );
        return;
      }
      toast.success(
        roleTarget.action === "promote"
          ? t("adminRoleChangeSuccess")
          : t("adminRoleChangeRemoved"),
      );
      setRoleTarget(null);
      setRoleCodeSent(false);
      setRoleCode("");
      users.refetch();
    } catch {
      setBusy(false);
      toast.error(null, t("adminRoleChangeFailed"));
    }
  };

  if (users.loading && !users.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("adminSearchUsers")}
            placeholderTextColor={colors.textSoft}
            style={styles.searchInput}
          />
        </View>
      </View>
      <View style={styles.chipWrap}>
        {(["all", "sellers", "buyers"] as const).map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === "all" ? t("adminFilterAll") : f === "sellers" ? t("adminFilterSellers") : t("adminFilterBuyers")}
            </Text>
          </Pressable>
        ))}
      </View>

      {filtered.length === 0 ? <Text style={styles.muted}>{t("adminNoUsers")}</Text> : null}

      {filtered.map((u) => {
        const suspended = !!u.banned_until && new Date(u.banned_until) > new Date();
        const name = u.shop_name ?? u.full_name;
        return (
          <View key={u.id} style={styles.card}>
            <Pressable onPress={() => setDetailUser(u)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[styles.cardTitle, { flex: 1, marginBottom: 0 }]} numberOfLines={1}>
                  {name}
                </Text>
                {u.verified ? <Ionicons name="checkmark-circle" size={16} color={colors.success} /> : null}
                {(u.role_names ?? []).includes("admin") ? (
                  <View style={[styles.chip, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={[styles.chipText, { color: colors.primary, fontSize: 10, fontWeight: "600" }]}>
                      {u.is_super_admin ? t("adminRoleSuperAdmin") : t("adminRoleAdmin")}
                    </Text>
                  </View>
                ) : null}
              </View>
              {u.email ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
                  <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>
                    {u.email}
                  </Text>
                  {u.email_confirmed_at ? <Ionicons name="checkmark-circle" size={13} color={colors.success} /> : null}
                </View>
              ) : null}
              <Text style={styles.muted}>
                {u.phone ?? "—"} · {u.city ?? "—"} · {timeAgo(u.created_at)}
              </Text>
            </Pressable>
            {u.is_seller ? <Text style={styles.muted}>{t("adminFilterSellers")}</Text> : null}
            {suspended ? (
              <Text style={[styles.muted, { color: colors.danger }]}>
                {t("adminSuspendedUntil")}: {new Date(u.banned_until!).toLocaleString()}
                {u.ban_reason ? ` — ${u.ban_reason}` : ""}
              </Text>
            ) : null}
            {u.shop_slug ? (
              <Pressable
                style={styles.shopLink}
                onPress={() => router.push(`/shop/${u.shop_slug}`)}
              >
                <Ionicons name="storefront-outline" size={13} color={colors.primary} />
                <Text style={styles.shopLinkText}>{t("adminVisitShop")}</Text>
              </Pressable>
            ) : null}

            {banTarget?.id === u.id ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                <Text style={styles.fieldLabel}>{t("adminBanDuration")}</Text>
                <View style={styles.chipWrap}>
                  {BAN_OPTIONS.map((o) => (
                    <Pressable
                      key={o.key}
                      style={[styles.chip, banDuration.key === o.key && styles.chipActive]}
                      onPress={() => setBanDuration(o)}
                    >
                      <Text style={[styles.chipText, banDuration.key === o.key && styles.chipTextActive]}>
                        {o.key === "permanent" ? t("adminBanPermanent") : o.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={banReason}
                  onChangeText={setBanReason}
                  placeholder={t("adminBanReasonPlaceholder")}
                  placeholderTextColor={colors.textSoft}
                  style={styles.input}
                />
                <View style={styles.rowBtns}>
                  <Button
                    title={t("cancel")}
                    variant="outline"
                    size="sm"
                    onPress={() => setBanTarget(null)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={t("adminBan")}
                    variant="danger"
                    size="sm"
                    loading={busy}
                    disabled={busy}
                    onPress={confirmBan}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.rowBtns}>
                <Button
                  title={t("adminRevokeSessions")}
                  variant="outline"
                  size="sm"
                  onPress={() => revoke(u.id)}
                  style={{ flex: 1 }}
                />
                {!u.is_super_admin && (u.role_names ?? []).includes("admin") ? (
                  <Button
                    title={t("adminRemoveAdmin")}
                    variant="outline"
                    size="sm"
                    onPress={() => setRoleTarget({ id: u.id, name, action: "demote" })}
                    style={{ flex: 1 }}
                  />
                ) : null}
                {!u.is_super_admin && !(u.role_names ?? []).includes("admin") ? (
                  <Button
                    title={t("adminMakeAdmin")}
                    variant="outline"
                    size="sm"
                    onPress={() => setRoleTarget({ id: u.id, name, action: "promote" })}
                    style={{ flex: 1 }}
                  />
                ) : null}
                {suspended ? (
                  <Button
                    title={t("adminUnban")}
                    size="sm"
                    onPress={() => lift(u.id)}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <Button
                    title={t("adminBan")}
                    variant="outline"
                    size="sm"
                    disabled={u.id === user?.id}
                    onPress={() => {
                      setBanTarget({ id: u.id, name });
                      setBanDuration(BAN_OPTIONS[0]!);
                      setBanReason("");
                    }}
                    style={{ flex: 1 }}
                  />
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
    <Modal visible={!!roleTarget} transparent animationType="fade" onRequestClose={() => { setRoleTarget(null); setRoleCodeSent(false); setRoleCode(""); }}>
      <Pressable style={styles.backdrop} onPress={() => { setRoleTarget(null); setRoleCodeSent(false); setRoleCode(""); }}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.title}>
            {roleCodeSent
              ? t("adminRoleChangeEnterCode")
              : roleTarget?.action === "promote"
                ? t("adminPromoteTitle")
                : t("adminDemoteTitle")}
          </Text>
          <Text style={styles.message}>
            {roleCodeSent
              ? t("adminRoleChangeCodeHint")
              : roleTarget?.action === "promote"
                ? t("adminPromoteBody")
                : t("adminDemoteBody")}
          </Text>
          {roleCodeSent && (
            <TextInput
              style={styles.codeInput}
              value={roleCode}
              onChangeText={setRoleCode}
              keyboardType="numeric"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.textSoft}
              autoFocus
            />
          )}
          <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.lg }}>
            <Pressable
              style={{ flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", backgroundColor: colors.secondary }}
              onPress={() => { setRoleTarget(null); setRoleCodeSent(false); setRoleCode(""); }}
              disabled={busy}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{t("cancel")}</Text>
            </Pressable>
            <Pressable
              style={{ flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", backgroundColor: colors.primary, opacity: busy || (roleCodeSent && roleCode.length !== 6) ? 0.5 : 1 }}
              onPress={roleCodeSent ? handleRoleConfirmCode : handleRoleChange}
              disabled={busy || (roleCodeSent && roleCode.length !== 6)}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onPrimary }}>
                {busy ? "…" : roleCodeSent ? t("adminRoleChangeConfirmCode") : t("adminRoleChangeSendCode")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    {/* User detail view — opens when tapping a user card. */}
    <Modal visible={!!detailUser} transparent animationType="fade" onRequestClose={() => setDetailUser(null)}>
      <Pressable style={styles.backdrop} onPress={() => setDetailUser(null)}>
        {/* maxHeight lives on the card (a child of the flex:1 backdrop) so the
            percentage resolves; the ScrollView then shrinks inside it. */}
        <Pressable style={[styles.modalCard, { maxHeight: "85%" }]} onPress={() => {}}>
          {detailUser ? (() => {
            const du = detailUser;
            const roles = Array.isArray(du.role_names) ? du.role_names : [];
            const isAdminUser = roles.includes("admin");
            const who = du.shop_name ?? du.full_name;
            const suspendedUser = !!du.banned_until && new Date(du.banned_until) > new Date();
            const lang = du.preferred_language === "am" ? "አማርኛ" : du.preferred_language === "en" ? "English" : du.preferred_language || "—";
            return (
              <ScrollView contentContainerStyle={{ gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{(who || "?").slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.cardTitle, { flex: 1, marginBottom: 0 }]} numberOfLines={1}>
                        {who}
                      </Text>
                      {du.verified ? <Ionicons name="checkmark-circle" size={15} color={colors.success} /> : null}
                      {isAdminUser ? (
                        <View style={[styles.chip, { backgroundColor: colors.primary + "20" }]}>
                          <Text style={[styles.chipText, { color: colors.primary, fontSize: 10, fontWeight: "600" }]}>
                            {du.is_super_admin ? t("adminRoleSuperAdmin") : t("adminRoleAdmin")}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {du.email ? <Text style={styles.muted}>{du.email}</Text> : null}
                  </View>
                </View>

                <DetailSection title={t("adminContact")}>
                  <DetailRow label={t("adminEmail")} value={du.email ?? "—"} />
                  <DetailRow label={t("adminPhone")} value={du.phone ?? "—"} />
                  <DetailRow label={t("adminWhatsapp")} value={du.whatsapp ?? "—"} />
                  <DetailRow
                    label={t("adminTelegram")}
                    value={
                      du.telegram
                        ? `@${du.telegram}${du.telegram_blocked ? ` (${t("adminBlocked")})` : ""}`
                        : "—"
                    }
                  />
                  <DetailRow label={t("adminLocation")} value={du.city ?? "—"} />
                </DetailSection>

                <DetailSection title={t("adminAccount")}>
                  <DetailRow label={t("adminMemberSince")} value={timeAgo(du.created_at)} />
                  <DetailRow label={t("adminLastSeen")} value={du.last_seen ? timeAgo(du.last_seen) : "—"} />
                  <DetailRow label={t("adminLastSignIn")} value={du.last_sign_in_at ? timeAgo(du.last_sign_in_at) : "—"} />
                  <DetailRow label={t("adminLanguage")} value={lang} />
                  <DetailRow
                    label={t("adminStatus")}
                    value={
                      suspendedUser
                        ? `${t("adminSuspendedUntil")}: ${new Date(du.banned_until!).toLocaleString()}${
                            du.ban_reason ? ` — ${du.ban_reason}` : ""
                          }`
                        : t("adminActiveAccount")
                    }
                    danger={suspendedUser}
                  />
                </DetailSection>

                {du.is_seller || du.shop_name ? (
                  <DetailSection title={t("adminShop")}>
                    {du.shop_name ? <DetailRow label={t("adminShopName")} value={du.shop_name} /> : null}
                    {du.shop_address ? <DetailRow label={t("adminShopAddress")} value={du.shop_address} /> : null}
                    {du.registration_number ? <DetailRow label={t("adminRegNumber")} value={du.registration_number} /> : null}
                    {du.shop_description ? <DetailRow label={t("adminShopDescription")} value={du.shop_description} /> : null}
                    {du.shop_slug ? (
                      <Pressable
                        style={styles.shopLink}
                        onPress={() => {
                          setDetailUser(null);
                          router.push(`/shop/${du.shop_slug}`);
                        }}
                      >
                        <Ionicons name="storefront-outline" size={13} color={colors.primary} />
                        <Text style={styles.shopLinkText}>{t("adminVisitShop")}</Text>
                      </Pressable>
                    ) : null}
                  </DetailSection>
                ) : null}

                {du.bio ? (
                  <DetailSection title={t("adminBio")}>
                    <Text style={styles.muted}>{du.bio}</Text>
                  </DetailSection>
                ) : null}
              </ScrollView>
            );
          })() : null}
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

function CategoriesTab() {
  const { t } = useLang();
  const toast = useToast();
  const cats = useAsync(fetchAdminCategories, []);
  const counts = useAsync(fetchAdminCategoryCounts, []);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [icon, setIcon] = useState<string>("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameIcon, setRenameIcon] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    children: number;
    listings: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const roots = (cats.data ?? []).filter((c) => !c.parent_id);
  const children = (cats.data ?? []).filter((c) => c.parent_id);

  const invalidate = () => {
    cats.refetch();
    counts.refetch();
  };

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createCategory(name, parentId || null, icon || undefined);
      setName("");
      setParentId("");
      setIcon("");
      invalidate();
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      await renameCategory(id, renameValue, renameIcon || undefined);
      setRenamingId(null);
      invalidate();
    } catch (err) {
      toast.error(err, t("oops"));
    }
  };

  const move = async (id: string, dir: "up" | "down") => {
    try {
      await moveCategory(id, dir);
      invalidate();
    } catch (err) {
      toast.error(err, t("oops"));
    }
  };

  const remove = async (id: string) => {
    setDeleting(true);
    try {
      await deleteCategory(id);
      invalidate();
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setDeleting(false);
    }
  };

  const Row = ({
    cat,
    depth,
  }: {
    cat: { id: string; name: string; slug: string; icon: string | null; parent_id: string | null; level: number | null; is_active: boolean | null };
    depth: number;
  }) => {
    const n = counts.data?.[cat.id] ?? 0;
    const siblings = (cats.data ?? []).filter((c) => c.parent_id === cat.parent_id);
    const idx = siblings.findIndex((c) => c.id === cat.id);
    return (
      <View style={[styles.catRow, depth > 0 && { marginLeft: 18 }]}>
        {renamingId === cat.id ? (
          <>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              style={[styles.input, { flex: 1, minHeight: 36 }]}
            />
            <Button title={t("save")} size="sm" onPress={() => rename(cat.id)} />
          </>
        ) : (
          <>
            <View style={styles.catIconWrap}>
              <Ionicons name={categoryIcon(cat.icon)} size={15} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.catName}>{cat.name}</Text>
                {cat.level != null ? (
                  <View style={[styles.countBadge, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={[styles.countBadgeText, { color: colors.primary }]}>L{cat.level}</Text>
                  </View>
                ) : null}
                {cat.is_active === false ? (
                  <View style={[styles.countBadge, { backgroundColor: colors.danger + "20" }]}>
                    <Text style={[styles.countBadgeText, { color: colors.danger }]}>off</Text>
                  </View>
                ) : null}
                {n > 0 ? (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{n}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.catSlug}>/{cat.slug}</Text>
            </View>
            <Pressable
              style={styles.iconBtn}
              hitSlop={6}
              disabled={idx <= 0}
              onPress={() => void move(cat.id, "up")}
            >
              <Ionicons name="chevron-up" size={15} color={idx <= 0 ? colors.textSoft : colors.textMuted} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              hitSlop={6}
              disabled={idx >= siblings.length - 1}
              onPress={() => void move(cat.id, "down")}
            >
              <Ionicons name="chevron-down" size={15} color={idx >= siblings.length - 1 ? colors.textSoft : colors.textMuted} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              hitSlop={6}
              onPress={() => {
                setRenamingId(cat.id);
                setRenameValue(cat.name);
                setRenameIcon(cat.icon ?? "");
              }}
            >
              <Ionicons name="pencil" size={15} color={colors.textMuted} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              hitSlop={6}
              onPress={async () => {
                try {
                  await toggleCategoryActive(cat.id, cat.is_active === false);
                  invalidate();
                } catch { /* ignore */ }
              }}
            >
              <Ionicons name={cat.is_active !== false ? "checkmark-circle" : "pause-circle"} size={15} color={cat.is_active !== false ? colors.success : colors.textMuted} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              hitSlop={6}
              onPress={() => {
                const childIds = (cats.data ?? [])
                  .filter((c) => c.parent_id === cat.id)
                  .map((c) => c.id);
                const listingCount = [cat.id, ...childIds].reduce(
                  (sum, id) => sum + (counts.data?.[id] ?? 0),
                  0,
                );
                if (childIds.length > 0 || listingCount > 0) {
                  setPendingDelete({ id: cat.id, children: childIds.length, listings: listingCount });
                } else {
                  void remove(cat.id);
                }
              }}
            >
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
            </Pressable>
          </>
        )}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("adminAddCategory")}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("adminCategoryName")}
          placeholderTextColor={colors.textSoft}
          style={styles.input}
        />
        <Text style={styles.fieldLabel}>{t("adminCategoryParent")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable style={[styles.chip, !parentId && styles.chipActive]} onPress={() => setParentId("")}>
            <Text style={[styles.chipText, !parentId && styles.chipTextActive]}>{t("adminCategoryRoot")}</Text>
          </Pressable>
          {roots.map((r) => (
            <Pressable
              key={r.id}
              style={[styles.chip, parentId === r.id && styles.chipActive]}
              onPress={() => setParentId(parentId === r.id ? "" : r.id)}
            >
              <Text style={[styles.chipText, parentId === r.id && styles.chipTextActive]}>{r.name}</Text>
            </Pressable>
          ))}
          {children
            .filter((c) => roots.some((r) => r.id === c.parent_id))
            .map((c) => {
              const rootName = roots.find((r) => r.id === c.parent_id)?.name ?? "";
              return (
                <Pressable
                  key={c.id}
                  style={[styles.chip, parentId === c.id && styles.chipActive]}
                  onPress={() => setParentId(parentId === c.id ? "" : c.id)}
                >
                  <Text style={[styles.chipText, parentId === c.id && styles.chipTextActive]}>{rootName} → {c.name}</Text>
                </Pressable>
              );
            })}
        </ScrollView>
        <Text style={styles.fieldLabel}>{t("adminCategoryIcon")}</Text>
        <IconPicker value={icon} onChange={setIcon} />
        <Button title={t("adminAddCategory")} onPress={add} loading={busy} disabled={busy || !name.trim()} />
      </View>

      {renamingId ? (
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t("adminCategoryIcon")}</Text>
          <IconPicker value={renameIcon} onChange={setRenameIcon} />
        </View>
      ) : null}

      {roots.length === 0 ? (
        <Text style={styles.muted}>{t("adminNoCategories")}</Text>
      ) : (
        roots.map((r) => (
          <View key={r.id} style={{ gap: 8 }}>
            <Row cat={r} depth={0} />
            {children
              .filter((c) => c.parent_id === r.id)
              .map((c) => (
                <View key={c.id}>
                  <Row cat={c} depth={1} />
                  {/* Level 2: grandchildren */}
                  {children
                    .filter((gc) => gc.parent_id === c.id)
                    .map((gc) => (
                      <Row key={gc.id} cat={gc} depth={2} />
                    ))}
                </View>
              ))}
          </View>
        ))
      )}

      <ConfirmDialog
        visible={!!pendingDelete}
        title={t("adminDeleteCategoryTitle")}
        message={
          pendingDelete
            ? t("adminDeleteCategoryAffects")
                .replaceAll("{children}", String(pendingDelete.children))
                .replaceAll("{listings}", String(pendingDelete.listings))
            : t("adminDeleteCategoryBody")
        }
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        busy={deleting}
        onConfirm={() => {
          if (!pendingDelete) return;
          void remove(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </ScrollView>
  );
}

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useLang();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      <Pressable style={[styles.chip, !value && styles.chipActive]} onPress={() => onChange("")}>
        <Text style={[styles.chipText, !value && styles.chipTextActive]}>{t("adminCategoryIconNone")}</Text>
      </Pressable>
      {CATEGORY_ICON_KEYS.map((key) => (
        <Pressable
          key={key}
          style={[styles.chip, value === key && styles.chipActive]}
          onPress={() => onChange(value === key ? "" : key)}
        >
          <Ionicons name={categoryIcon(key)} size={14} color={value === key ? colors.onPrimary : colors.textMuted} />
          <Text style={[styles.chipText, value === key && styles.chipTextActive]}>{key}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ListingsTab() {
  const { t } = useLang();
  const toast = useToast();
  const listings = useAsync(fetchAdminListings, []);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const flipFeatured = async (id: string, featured: boolean) => {
    try {
      await toggleFeatured(id, featured);
      listings.refetch();
    } catch (err) {
      toast.error(err, t("oops"));
    }
  };

  const remove = async (id: string) => {
    setDeleting(true);
    try {
      await deleteListingAdmin(id);
      listings.refetch();
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setDeleting(false);
    }
  };

  if (listings.loading && !listings.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
      {(listings.data ?? []).length === 0 ? (
        <Text style={styles.muted}>{t("adminNoListings")}</Text>
      ) : null}
      {(listings.data ?? []).map((l) => (
        <View key={l.id} style={styles.card}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            {l.listing_images?.[0]?.url ? (
              <Image source={imageSource(l.listing_images[0].url, undefined, 300)} style={styles.listingImg} />
            ) : (
              <View style={[styles.listingImg, styles.listingImgEmpty]}>
                <Ionicons name="image-outline" size={18} color={colors.textSoft} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {l.title}
              </Text>
              <Text style={styles.muted}>
                {formatBirr(l.price)} · {l.status} · {l.city ?? "—"}
              </Text>
              <Text style={styles.muted}>
                {l.profiles?.shop_name ?? l.profiles?.full_name ?? l.seller_id} · {timeAgo(l.created_at)}
              </Text>
            </View>
          </View>
          <View style={styles.rowBtns}>
            <Button
              title={l.featured ? t("adminUnfeature") : t("adminFeature")}
              variant="outline"
              size="sm"
              onPress={() => flipFeatured(l.id, !l.featured)}
              style={{ flex: 1 }}
            />
            <Button
              title={t("delete")}
              variant="danger"
              size="sm"
              onPress={() => setPendingDelete({ id: l.id, title: l.title })}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ))}

      <ConfirmDialog
        visible={!!pendingDelete}
        title={t("delete")}
        message={`${t("adminDeleteListingBody")} "${pendingDelete?.title ?? ""}"`}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        busy={deleting}
        onConfirm={() => {
          if (!pendingDelete) return;
          void remove(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </ScrollView>
  );
}

function StatsTab({ onOpenUsers, onOpenListings }: { onOpenUsers?: (f: "all" | "sellers") => void; onOpenListings?: () => void }) {
  const { t } = useLang();
  const stats = useAsync(fetchAdminStats, []);
  const topCats = useAsync(fetchAdminTopCategories, []);
  const topSearches = useAsync(fetchAdminTopSearches, []);
  const [range, setRange] = useState(14);
  const [metric, setMetric] = useState<"views" | "listings" | "users" | "messages">("views");
  const trend = useAsync(() => fetchAdminTrend(range), [range]);

  if (stats.loading && !stats.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const s = stats.data;
  const maxCat = Math.max(1, ...(topCats.data ?? []).map((c) => c.count));
  const maxSearch = Math.max(1, ...(topSearches.data ?? []).map((x) => x.count));
  const total = s?.listings || 1;
  const verifiedPct =
    s && s.sellers > 0 ? Math.round((s.verifiedSellers / s.sellers) * 100) : 0;
  const segments = [
    { label: t("adminStatusActive"), value: s?.activeListings ?? 0, color: colors.primary },
    { label: t("adminStatusSold"), value: s?.soldListings ?? 0, color: colors.success },
    { label: t("adminStatusOther"), value: s?.otherListings ?? 0, color: colors.textSoft },
  ].filter((x) => x.value > 0);
  const trendMax = Math.max(1, ...(trend.data ?? []).map((d) => d[metric]));

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
      {/* Hero row — big numbers + verified ratio; cards open the Users tab. */}
      <View style={styles.statGrid}>
        <Pressable onPress={() => onOpenListings?.()} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
          <StatBox label={t("adminStatListings")} value={s?.listings ?? 0} icon="pricetags" />
        </Pressable>
        <Pressable onPress={() => onOpenUsers?.("all")} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
          <StatBox label={t("adminStatUsers")} value={s?.users ?? 0} icon="people" />
        </Pressable>
        <Pressable onPress={() => onOpenUsers?.("sellers")} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
          <View style={styles.statBox}>
          <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
          <Text style={styles.statValue}>
            {s?.verifiedSellers ?? 0}/{s?.sellers ?? 0}
          </Text>
          <Text style={styles.statLabel}>{t("adminStatVerifiedSellers")}</Text>
          <View style={[styles.barTrack, { width: "100%", marginTop: 6 }]}>
            <View
              style={[styles.barFill, { width: `${Math.max(verifiedPct, 2)}%`, backgroundColor: colors.success }]}
            />
          </View>
          <Text style={{ fontSize: 10, color: colors.textMuted }}>
            {verifiedPct}% {t("adminVerifiedRate")}
          </Text>
          </View>
        </Pressable>
        <StatBox
          label={t("adminThisWeek")}
          value={`+${s?.newListings7d ?? 0}`}
          icon="trending-up"
        />
      </View>

      {/* Engagement strip — minor totals, compact. */}
      <View style={[styles.card, { flexDirection: "row", flexWrap: "wrap", gap: 10 }]}>
        <EngItem icon="eye" label={t("adminStatViews")} value={s?.totalViews ?? 0} />
        <EngItem icon="chatbubbles" label={t("adminStatConversations")} value={s?.conversations ?? 0} />
        <EngItem icon="chatbox" label={t("adminStatMessages")} value={s?.messages ?? 0} />
        <EngItem icon="star" label={t("adminStatReviews")} value={s?.reviews ?? 0} />
      </View>

      {/* Activity trend — daily bars for one metric, 7/14/30d. */}
      <View style={styles.card}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <Text style={styles.cardTitle}>{t("adminTrendTitle")}</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[7, 14, 30].map((r) => (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                style={[styles.chip, range === r && styles.chipActive]}
              >
                <Text style={[styles.chipText, range === r && styles.chipTextActive]}>{r}d</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {(["views", "listings", "users", "messages"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMetric(m)}
              style={[styles.chip, metric === m && styles.chipActive]}
            >
              <Text style={[styles.chipText, metric === m && styles.chipTextActive]}>
                {t(`adminTrend.${m}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        {(trend.data ?? []).length === 0 ? (
          <Text style={styles.muted}>{t("adminNoListings")}</Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 118 }}>
            {(trend.data ?? []).map((d) => (
              <View key={d.date} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <View style={{ width: "100%", height: 96, justifyContent: "flex-end", alignItems: "center" }}>
                  <View
                    style={{
                      width: "70%",
                      minHeight: 2,
                      borderRadius: 3,
                      backgroundColor: colors.primary,
                      height: Math.max((d[metric] / trendMax) * 96, 2),
                    }}
                  />
                </View>
                <Text style={{ fontSize: 8, color: colors.textSoft }} numberOfLines={1}>
                  {d.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("adminStatusBreakdown")}</Text>
        {segments.length === 0 ? (
          <Text style={styles.muted}>{t("adminNoListings")}</Text>
        ) : (
          <>
            <View style={[styles.barTrack, { height: 10, flexDirection: "row", borderRadius: 999 }]}>
              {segments.map((x) => (
                <View
                  key={x.label}
                  style={[styles.barFill, { width: `${(x.value / total) * 100}%`, backgroundColor: x.color, borderRadius: 999 }]}
                />
              ))}
            </View>
            <View style={{ marginTop: 10, gap: 6 }}>
              {segments.map((x) => (
                <View key={x.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: x.color }} />
                  <Text style={[styles.muted, { flex: 1 }]}>{x.label}</Text>
                  <Text style={styles.catName}>
                    {x.value} · {Math.round((x.value / total) * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("adminTopCategories")}</Text>
        {(topCats.data ?? []).length === 0 ? (
          <Text style={styles.muted}>{t("adminNoListings")}</Text>
        ) : (
          (topCats.data ?? []).map((c) => (
            <View key={c.name} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.catName}>{c.name}</Text>
                <Text style={styles.catSlug}>{c.count}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(c.count / maxCat) * 100}%` }]} />
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("adminTopSearches")}</Text>
        {(topSearches.data ?? []).length === 0 ? (
          <Text style={styles.muted}>{t("adminNoListings")}</Text>
        ) : (
          (topSearches.data ?? []).map((x) => (
            <View key={x.name} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.catName}>{x.name}</Text>
                <Text style={styles.catSlug}>{x.count}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(x.count / maxSearch) * 100}%` }]} />
              </View>
            </View>
          ))
        )}
      </View>

      {/* Telegram integration health (spec §19 monitoring gap). */}
      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="paper-plane" size={15} color={colors.success} />
          <Text style={styles.cardTitle}>{t("adminTelegramHealth")}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
          <EngItem icon="paper-plane" label={t("adminTgSends")} value={s?.telegramSends7d ?? 0} />
          <EngItem
            icon="checkmark-circle"
            label={t("adminTgSuccess")}
            value={
              (s?.telegramSends7d ?? 0) > 0
                ? `${Math.round(((s?.telegramOk7d ?? 0) / (s?.telegramSends7d ?? 1)) * 100)}%`
                : "100%"
            }
          />
          <EngItem icon="close-circle" label={t("adminTgFailures")} value={s?.telegramFailures7d ?? 0} />
          <EngItem icon="people" label={t("adminTgLinked")} value={s?.telegramLinkedUsers ?? 0} />
        </View>
        <View style={{ marginTop: 10, gap: 4 }}>
          <Text style={styles.muted}>
            {t("adminTgChannelPosts")}: <Text style={styles.catName}>{s?.telegramChannelPosts ?? 0}</Text>
          </Text>
          <Text style={styles.muted}>
            {t("adminTgProcessed")}: <Text style={styles.catName}>{s?.telegramProcessedUpdates ?? 0}</Text>
          </Text>
          <Text style={styles.muted}>
            {t("adminTgBlocked")}: <Text style={styles.catName}>{s?.telegramBlockedUsers ?? 0}</Text>
          </Text>
          {(s?.telegramFailureReasons ?? []).length > 0 ? (
            <Text style={[styles.muted, { marginTop: 4 }]}>· {(s?.telegramFailureReasons ?? []).join(" · ")}</Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Compact inline stat for the engagement strip. */
function EngItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: "46%", flex: 1 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          backgroundColor: colors.secondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={14} color={colors.primary} />
      </View>
      <View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>{value}</Text>
        <Text style={{ fontSize: 10, color: colors.textMuted }}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 32,
  },
  tabsScroller: { flexGrow: 0 },
  tabs: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  tabTextActive: { color: colors.onPrimary },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 4 },
  muted: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 4 },
  rowBtns: { flexDirection: "row", gap: 8, marginTop: 10 },
  input: {
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    minHeight: 44,
  },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: colors.onPrimary },
  shopLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  shopLinkText: { fontSize: 12.5, color: colors.primary, fontWeight: "700" },
  fieldLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 5, fontWeight: "600", marginTop: 8 },
  docPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 8,
  },
  docPreviewText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: spacing.lg,
  },
  docModal: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 12,
  },
  docImage: {
    width: "100%",
    height: 360,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  docImageEmpty: { alignItems: "center", justifyContent: "center" },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catName: { fontSize: 14, fontWeight: "600", color: colors.text },
  catSlug: { fontSize: 11, color: colors.textSoft, marginTop: 1 },
  catIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadge: {
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight ?? colors.secondary,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countBadgeText: { fontSize: 11, fontWeight: "600", color: colors.primary },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  listingImg: { width: 52, height: 52, borderRadius: radius.md },
  listingImgEmpty: {
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statBox: {
    width: "48%",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: 4,
    ...shadows.card,
  },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.primary },
  statLabel: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
  barTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.secondary,
    marginTop: 4,
    overflow: "hidden",
  },
  barFill: { height: 7, borderRadius: 4, backgroundColor: colors.primary },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  message: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: 8 },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 12,
    textAlign: "center",
    color: colors.text,
    marginTop: 16,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "700", color: colors.text },
  detailSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailRowLabel: { fontSize: 11, color: colors.textSoft, marginTop: 8 },
  detailRowValue: { fontSize: 14, color: colors.text, marginTop: 1 },
});
