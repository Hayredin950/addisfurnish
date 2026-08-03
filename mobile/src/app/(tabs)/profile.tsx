import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import {
  fetchBuyerPreferences,
  fetchCategories,
  fetchMyVerificationDocs,
  fetchMyListings,
  saveBuyerPreferences,
  updateProfile,
  uploadListingImage,
} from "../../lib/api";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ListingCard } from "../../components/ListingCard";
import { colors, radius, spacing, shadows } from "../../lib/theme";
import { formatBirr, timeAgo } from "../../lib/format";
import type { BuyerPreferences, Listing } from "../../lib/api";

const DOC_TYPES = ["National ID", "Business License", "TIN Certificate", "Other"];

export default function ProfileScreen() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const { t, lang, setLang } = useLang();

  // Shop form state
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [shopName, setShopName] = useState(profile?.shop_name ?? "");
  const [shopSlug, setShopSlug] = useState(profile?.shop_slug ?? "");
  const [shopDesc, setShopDesc] = useState(profile?.shop_description ?? "");
  const [shopAddress, setShopAddress] = useState(profile?.shop_address ?? "");
  const [regNumber, setRegNumber] = useState(profile?.registration_number ?? "");
  const [saving, setSaving] = useState(false);

  // Verification
  const [docType, setDocType] = useState(DOC_TYPES[0]!);
  const [docBusy, setDocBusy] = useState(false);

  // Preferences
  const [prefs, setPrefs] = useState<BuyerPreferences>({
    category_ids: [],
    price_min: null,
    price_max: null,
    preferred_cities: [],
    telegram_alerts_enabled: false,
  });
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const docs = useAsync(() => fetchMyVerificationDocs(user?.id ?? ""), [user?.id], !!user);
  const myListings = useAsync(() => fetchMyListings(user?.id ?? ""), [user?.id], !!user);
  const cats = useAsync(fetchCategories, []);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setShopName(profile.shop_name ?? "");
      setShopSlug(profile.shop_slug ?? "");
      setShopDesc(profile.shop_description ?? "");
      setShopAddress(profile.shop_address ?? "");
      setRegNumber(profile.registration_number ?? "");
    }
  }, [profile]);

  useEffect(() => {
    if (user && !prefsLoaded) {
      void fetchBuyerPreferences(user.id).then((p) => {
        if (p) setPrefs(p);
        setPrefsLoaded(true);
      });
    }
  }, [user, prefsLoaded]);

  const saveShop = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile(user.id, {
        full_name: fullName.trim() || undefined,
        shop_name: shopName.trim() || null,
        shop_slug: shopSlug.trim() || null,
        shop_description: shopDesc.trim() || null,
        shop_address: shopAddress.trim() || null,
        registration_number: regNumber.trim() || null,
        is_seller: true,
      });
      await refreshProfile();
    } catch {
      Alert.alert(t("oops"));
    } finally {
      setSaving(false);
    }
  };

  const pickLogo = async () => {
    if (!user) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      const path = await uploadListingImage(user.id, res.assets[0]);
      await updateProfile(user.id, { shop_logo_url: path });
      await refreshProfile();
    } catch {
      Alert.alert(t("oops"));
    }
  };

  const submitDoc = async () => {
    if (!user) return;
    setDocBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.[0]) return;
      // Upload to the private verification-docs bucket (owner+admin only).
      const asset = res.assets[0];
      const ext = asset.fileName?.split(".").pop() ?? "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? `doc.${ext}`,
        type: asset.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`,
      } as unknown as Blob);
      const { error: upErr } = await supabase.storage
        .from("verification-docs")
        .upload(path, form, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from("seller_verification_documents").insert({
        seller_id: user.id,
        document_type: docType,
        file_url: path,
        status: "pending",
      });
      if (error) throw error;
      docs.refetch();
    } catch {
      Alert.alert(t("oops"));
    } finally {
      setDocBusy(false);
    }
  };

  const savePrefs = async () => {
    if (!user) return;
    try {
      await saveBuyerPreferences(user.id, prefs);
      Alert.alert(t("saved"));
    } catch {
      Alert.alert(t("oops"));
    }
  };

  const confirmSignOut = () => {
    Alert.alert(t("signOut"), t("logoutConfirm"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("signOut"), style: "destructive", onPress: () => void signOut() },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <EmptyState title={t("notSignedIn")} hint={t("signInPrompt")} />
        <Button
          title={t("signIn")}
          onPress={() => router.push("/auth")}
          style={{ marginTop: 16 }}
        />
      </View>
    );
  }

  const latestDoc = docs.data?.[0] ?? null;
  const docStatus = latestDoc?.status ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            {profile?.shop_logo_url || profile?.avatar_url ? (
              <Image
                source={{ uri: profile?.shop_logo_url ?? profile?.avatar_url ?? "" }}
                style={styles.avatarImg}
              />
            ) : (
              <Ionicons name="person" size={30} color={colors.primary} />
            )}
          </View>
          <Text style={styles.name}>
            {profile?.shop_name ?? profile?.full_name ?? t("yourProfile")}
          </Text>
          {profile?.phone ? <Text style={styles.phone}>{profile.phone}</Text> : null}
          {profile?.is_seller ? (
            <View style={styles.sellerPill}>
              <Ionicons name="storefront" size={14} color={colors.primary} />
              <Text style={styles.sellerPillText}>
                {profile.verified ? t("shopVerified") : t("becomeSeller")}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Become a seller */}
        {!profile?.is_seller ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("becomeSeller")}</Text>
            <Text style={styles.cardHint}>{t("becomeSellerHint")}</Text>
            <Pressable style={styles.inlineBtn} onPress={() => router.push("/sell")}>
              <Ionicons name="storefront" size={16} color={colors.onPrimary} />
              <Text style={styles.inlineBtnText}>{t("createShop")}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Shop setup */}
        {profile?.is_seller ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t("profile")}</Text>
              <Pressable onPress={pickLogo}>
                <Text style={styles.link}>{t("changeLogo")}</Text>
              </Pressable>
            </View>
            <Field label={t("fullName")} value={fullName} onChange={setFullName} />
            <Field label={t("shopName")} value={shopName} onChange={setShopName} />
            <Field
              label={t("shopSlug")}
              value={shopSlug}
              onChange={setShopSlug}
              autoCapitalize="none"
            />
            <Field label={t("shopDescription")} value={shopDesc} onChange={setShopDesc} multiline />
            <Field label={t("shopAddress")} value={shopAddress} onChange={setShopAddress} />
            <Field label={t("registrationNumber")} value={regNumber} onChange={setRegNumber} />
            <Button
              title={t("saveProfile")}
              onPress={saveShop}
              loading={saving}
              disabled={saving}
            />
          </View>
        ) : null}

        {/* Verification */}
        {profile?.is_seller ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("verifyBadge")}</Text>
            <View style={styles.docStatusRow}>
              <Text style={styles.cardHint}>
                {docStatus === "pending"
                  ? t("docStatusPending")
                  : docStatus === "approved"
                    ? t("docStatusApproved")
                    : docStatus === "rejected"
                      ? t("docStatusRejected")
                      : t("submitDoc")}
              </Text>
              {docStatus === "approved" ? (
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              ) : docStatus === "pending" ? (
                <Ionicons name="time" size={18} color={colors.warning} />
              ) : docStatus === "rejected" ? (
                <Ionicons name="close-circle" size={18} color={colors.danger} />
              ) : null}
            </View>
            {docStatus === "rejected" && latestDoc?.rejection_reason ? (
              <Text style={styles.rejection}>
                {t("docRejection")}: {latestDoc.rejection_reason}
              </Text>
            ) : null}
            {docStatus !== "approved" ? (
              <>
                <View style={styles.chipWrap}>
                  {DOC_TYPES.map((dt) => (
                    <Pressable
                      key={dt}
                      style={[styles.chip, docType === dt && styles.chipActive]}
                      onPress={() => setDocType(dt)}
                    >
                      <Text style={[styles.chipText, docType === dt && styles.chipTextActive]}>
                        {dt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Button
                  title={t("submitDoc")}
                  variant="outline"
                  onPress={submitDoc}
                  loading={docBusy}
                  disabled={docBusy}
                />
              </>
            ) : null}
          </View>
        ) : null}

        {/* Preferences */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("alertPrefs")}</Text>
          <View style={styles.prefRow}>
            <Text style={styles.prefLabel}>{t("telegramAlerts")}</Text>
            <Switch
              value={prefs.telegram_alerts_enabled}
              onValueChange={(v) => setPrefs({ ...prefs, telegram_alerts_enabled: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>
          <Text style={styles.prefLabel}>{t("language")}</Text>
          <View style={styles.langRow}>
            <Pressable
              style={[styles.langBtn, lang === "en" && styles.langActive]}
              onPress={() => setLang("en")}
            >
              <Text style={[styles.langText, lang === "en" && styles.langTextActive]}>English</Text>
            </Pressable>
            <Pressable
              style={[styles.langBtn, lang === "am" && styles.langActive]}
              onPress={() => setLang("am")}
            >
              <Text style={[styles.langText, lang === "am" && styles.langTextActive]}>አማርኛ</Text>
            </Pressable>
          </View>
          <Button
            title={t("save")}
            variant="outline"
            onPress={savePrefs}
            style={{ marginTop: 12 }}
          />
        </View>

        {/* My listings */}
        {profile?.is_seller ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("myListings")}</Text>
            {(myListings.data ?? []).length === 0 ? (
              <Text style={styles.muted}>{t("emptyListings")}</Text>
            ) : (
              <View style={styles.grid}>
                {(myListings.data ?? []).slice(0, 4).map((l) => (
                  <ListingCard key={l.id} listing={l as Listing} lang={lang} compact />
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* Sign out */}
        <View style={styles.footer}>
          <Pressable onPress={confirmSignOut} hitSlop={8}>
            <Text style={styles.signOut}>{t("signOut")}</Text>
          </Pressable>
          <Text style={styles.about}>{t("madeInEthiopia")}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  autoCapitalize?: "none";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={colors.textSoft}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={[styles.fieldInput, multiline && { minHeight: 70, textAlignVertical: "top" }]}
      />
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
  header: {
    alignItems: "center",
    backgroundColor: colors.card,
    paddingVertical: spacing.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadows.card,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: 72, height: 72, borderRadius: radius.full },
  name: { fontSize: 19, fontWeight: "800", color: colors.text, marginTop: 10 },
  phone: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  sellerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginTop: 10,
  },
  sellerPillText: { fontSize: 12.5, color: colors.primary, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
    marginBottom: 0,
    ...shadows.card,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 8 },
  cardHint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  link: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  inlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    marginTop: 14,
  },
  inlineBtnText: { color: colors.onPrimary, fontWeight: "700", fontSize: 14 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 5, fontWeight: "600" },
  fieldInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  docStatusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rejection: {
    fontSize: 12.5,
    color: colors.danger,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 8,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 12 },
  chip: {
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12.5, color: colors.text },
  chipTextActive: { color: colors.onPrimary, fontWeight: "600" },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  prefLabel: { fontSize: 13.5, color: colors.text, fontWeight: "600" },
  langRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  langBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  langActive: { backgroundColor: colors.primary },
  langText: { fontSize: 14, color: colors.text, fontWeight: "600" },
  langTextActive: { color: colors.onPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  muted: { fontSize: 13, color: colors.textMuted },
  footer: { alignItems: "center", gap: 8, paddingTop: spacing.xl },
  signOut: { fontSize: 15, color: colors.danger, fontWeight: "700" },
  about: { fontSize: 12, color: colors.textSoft, textAlign: "center" },
});
