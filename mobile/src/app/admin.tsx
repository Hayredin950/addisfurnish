import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { useAsync } from "../hooks/use-async";
import {
  banUser,
  decideDocument,
  fetchAdminReports,
  fetchAdminUsers,
  fetchVerificationDecisions,
  fetchVerificationQueue,
  isAdmin,
  resolveReport,
  revokeSessions,
  unbanUser,
  type AdminReport,
  type AdminVerificationDoc,
} from "../lib/admin";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { EmptyState } from "../components/EmptyState";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { signedDocumentUrl } from "../lib/storage";
import { timeAgo } from "../lib/format";

type Tab = "reports" | "verification" | "users";

const TAB_LABELS: Record<Tab, "adminTabReports" | "adminTabVerification" | "adminTabUsers"> = {
  reports: "adminTabReports",
  verification: "adminTabVerification",
  users: "adminTabUsers",
};

/**
 * Moderation console for admins (mirrors the web /admin screen, scaled to a
 * phone): report resolution, the seller-verification queue with document
 * preview and audit trail, and user suspension. Every action re-verifies the
 * admin role server-side — the UI is only the trigger.
 */
export default function AdminScreen() {
  const { user } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("reports");
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

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(
          [
            ["reports", "flag"],
            ["verification", "shield-checkmark"],
            ["users", "people"],
          ] as [Tab, keyof typeof Ionicons.glyphMap][]
        ).map(([key, icon]) => (
          <Pressable
            key={key}
            style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
            onPress={() => setTab(key)}
          >
            <Ionicons name={icon} size={15} color={tab === key ? colors.onPrimary : colors.textMuted} />
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {t(TAB_LABELS[key])}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === "reports" ? <ReportsTab /> : null}
      {tab === "verification" ? <VerificationTab /> : null}
      {tab === "users" ? <UsersTab /> : null}
    </View>
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
          <Text style={[styles.muted, { color: d.action === "approved" ? colors.success : colors.danger }]}>
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

function UsersTab() {
  const { t } = useLang();
  const toast = useToast();
  const { user } = useAuth();
  const users = useAsync(fetchAdminUsers, []);
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const revoke = async (id: string) => {
    try {
      await revokeSessions(id);
      toast.success(t("adminSessionsRevoked"));
    } catch (err) {
      toast.error(err, t("oops"));
    }
  };

  const confirmBan = async (hours: number) => {
    if (!banTarget) return;
    setBusy(true);
    try {
      await banUser(banTarget.id, hours);
      toast.success(t("adminBanned"));
      setBanTarget(null);
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
  };

  if (users.loading && !users.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
      {(users.data ?? []).map((u) => {
        const suspended = !!u.banned_until && new Date(u.banned_until) > new Date();
        const name = u.shop_name ?? u.full_name;
        return (
          <View key={u.id} style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[styles.cardTitle, { flex: 1, marginBottom: 0 }]} numberOfLines={1}>
                {name}
              </Text>
              {u.verified ? <Ionicons name="checkmark-circle" size={16} color={colors.success} /> : null}
            </View>
            <Text style={styles.muted}>
              {u.phone ?? "—"} · {u.city ?? "—"} · {timeAgo(u.created_at)}
            </Text>
            {suspended ? (
              <Text style={[styles.muted, { color: colors.danger }]}>
                {t("adminSuspendedUntil")}: {new Date(u.banned_until!).toLocaleString()}
                {u.ban_reason ? ` — ${u.ban_reason}` : ""}
              </Text>
            ) : null}
            <View style={styles.rowBtns}>
              <Button
                title={t("adminRevokeSessions")}
                variant="outline"
                size="sm"
                onPress={() => revoke(u.id)}
                style={{ flex: 1 }}
              />
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
                  onPress={() => setBanTarget({ id: u.id, name })}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </View>
        );
      })}

      <ConfirmDialog
        visible={!!banTarget}
        title={t("adminBan")}
        message={`${t("adminBanConfirm")} ${banTarget?.name ?? ""}`}
        confirmLabel={t("adminBan")}
        cancelLabel={t("cancel")}
        destructive
        busy={busy}
        onConfirm={() => confirmBan(24)}
        onCancel={() => setBanTarget(null)}
      />
    </ScrollView>
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
  tabs: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 12.5, color: colors.textMuted, fontWeight: "600" },
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
    minHeight: 56,
    textAlignVertical: "top",
  },
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
});
