import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import * as Updates from "expo-updates";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import {
  deleteCloudinaryAssets,
  disconnectTelegram,
  fetchBuyerPreferences,
  fetchCategories,
  fetchMyVerificationDocs,
  getTelegramConnectUrl,
  saveBuyerPreferences,
  telegramConfigured,
  updateProfile,
  uploadShopLogo,
  uploadVerificationDocument,
} from "../../lib/api";
import { startPhoneVerification, verifyPhoneOtp } from "../../lib/otp";
import { DraggablePinMap } from "../../components/DraggablePinMap";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { EmptyState } from "../../components/EmptyState";
import { colors, radius, spacing, shadows } from "../../lib/theme";
import { imageSource } from "../../lib/storage";
import { isAdmin } from "../../lib/admin";
import { uniqueShopSlug } from "../../lib/slug";
import type { BuyerPreferences } from "../../lib/api";

const DOC_TYPES = ["National ID", "Business License", "TIN Certificate", "Other"];
const CITIES = ["Addis Ababa", "Dire Dawa", "Hawassa", "Bahir Dar", "Mekelle", "Adama", "Gondar"];
const WEB_APP_URL = "https://addisfurnish.vercel.app";

export default function ProfileScreen() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const { t, lang, setLang } = useLang();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    label: string;
    onConfirm: () => void;
  } | null>(null);

  // Account fields (everyone)
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [savingAccount, setSavingAccount] = useState(false);

  // Shop fields (sellers) — the slug is derived from the shop name, never
  // shown to the user (it only exists so shop URLs stay stable).
  const [shopName, setShopName] = useState(profile?.shop_name ?? "");
  const [shopDesc, setShopDesc] = useState(profile?.shop_description ?? "");
  const [shopAddress, setShopAddress] = useState(profile?.shop_address ?? "");
  const [regNumber, setRegNumber] = useState(profile?.registration_number ?? "");
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? "");
  const [telegram, setTelegram] = useState(profile?.telegram ?? "");
  const [latitude, setLatitude] = useState<number | null>(profile?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(profile?.longitude ?? null);
  const [saving, setSaving] = useState(false);

  // Phone verification (everyone)
  const [otpPhone, setOtpPhone] = useState(profile?.phone ?? "");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);

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
  const [prefMin, setPrefMin] = useState("");
  const [prefMax, setPrefMax] = useState("");
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [admin, setAdmin] = useState(false);

  const docs = useAsync(() => fetchMyVerificationDocs(user?.id ?? ""), [user?.id], !!user);
  const cats = useAsync(fetchCategories, []);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setCity(profile.city ?? "");
      setBio(profile.bio ?? "");
      setShopName(profile.shop_name ?? "");
      setShopDesc(profile.shop_description ?? "");
      setShopAddress(profile.shop_address ?? "");
      setRegNumber(profile.registration_number ?? "");
      setWhatsapp(profile.whatsapp ?? "");
      setTelegram(profile.telegram ?? "");
      setLatitude(profile.latitude ?? null);
      setLongitude(profile.longitude ?? null);
    }
  }, [profile]);

  useEffect(() => {
    void isAdmin(user?.id).then(setAdmin);
  }, [user?.id]);

  useEffect(() => {
    if (user && !prefsLoaded) {
      void fetchBuyerPreferences(user.id).then((p) => {
        if (p) {
          setPrefs(p);
          setPrefMin(p.price_min != null ? String(p.price_min) : "");
          setPrefMax(p.price_max != null ? String(p.price_max) : "");
        }
        setPrefsLoaded(true);
      });
    }
  }, [user, prefsLoaded]);

  const saveAccount = async () => {
    if (!user) return;
    setSavingAccount(true);
    try {
      await updateProfile(user.id, {
        full_name: fullName.trim() || undefined,
        phone: phone.trim() || null,
        city: city || null,
        bio: bio.trim() || null,
      });
      await refreshProfile();
      toast.success(t("profileSaved"));
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setSavingAccount(false);
    }
  };

  const saveShop = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const name = shopName.trim();
      // Keep the existing slug when the name didn't change; otherwise derive a
      // fresh unique one so shop URLs keep working.
      const slug =
        name && profile?.shop_name?.trim() === name && profile?.shop_slug
          ? profile.shop_slug
          : name
            ? await uniqueShopSlug(name)
            : null;
      await updateProfile(user.id, {
        full_name: fullName.trim() || undefined,
        shop_name: name || null,
        shop_slug: slug,
        shop_description: shopDesc.trim() || null,
        shop_address: shopAddress.trim() || null,
        registration_number: regNumber.trim() || null,
        whatsapp: whatsapp.trim() || null,
        telegram: telegram.trim().replace(/^@/, "") || null,
        latitude,
        longitude,
        is_seller: true,
      });
      await refreshProfile();
      toast.success(t("profileSaved"));
    } catch (err) {
      toast.error(err, t("oops"));
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
      const oldLogo = profile?.shop_logo_url ?? null;
      const path = await uploadShopLogo(user.id, res.assets[0]);
      await updateProfile(user.id, { shop_logo_url: path });
      // The old logo leaves with the swap — it would otherwise stay on
      // Cloudinary forever.
      if (oldLogo && oldLogo !== path) void deleteCloudinaryAssets([oldLogo]);
      await refreshProfile();
    } catch (err) {
      toast.error(err, t("oops"));
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
      // Private bucket — owner and admins only.
      const path = await uploadVerificationDocument(user.id, res.assets[0]);
      const { error } = await supabase.from("seller_verification_documents").insert({
        seller_id: user.id,
        document_type: docType,
        file_url: path,
        status: "pending",
      });
      if (error) throw error;
      docs.refetch();
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setDocBusy(false);
    }
  };

  const startVerify = async () => {
    setOtpBusy(true);
    const res = await startPhoneVerification(otpPhone);
    setOtpBusy(false);
    if (res.ok) {
      setOtpSent(true);
      Linking.openURL(res.url).catch(() => {});
    } else if (res.error === "taken") {
      toast.error(null, t("otpPhoneTaken"));
    } else if (res.error === "invalid_phone") {
      toast.error(null, t("otpInvalidPhone"));
    } else {
      toast.error(null, t("oops"));
    }
  };

  const confirmVerify = async () => {
    setOtpBusy(true);
    const res = await verifyPhoneOtp(otpPhone, otpCode);
    setOtpBusy(false);
    if (res.ok) {
      toast.success(t("otpVerified"));
      setOtpSent(false);
      setOtpCode("");
      setPhone(otpPhone);
      await refreshProfile();
    } else if (res.error === "wrong_code") {
      toast.error(null, t("otpWrongCode"));
    } else if (res.error === "expired") {
      toast.error(null, t("otpExpired"));
    } else if (res.error === "too_many") {
      toast.error(null, t("otpTooMany"));
    } else if (res.error === "no_code") {
      toast.error(null, t("otpNoCodeYet"));
    } else if (res.error === "taken") {
      toast.error(null, t("otpPhoneTaken"));
    } else if (res.error === "invalid_phone") {
      toast.error(null, t("otpInvalidPhone"));
    } else {
      toast.error(null, t("oops"));
    }
  };

  const savePrefs = async () => {
    if (!user) return;
    try {
      await saveBuyerPreferences(user.id, {
        ...prefs,
        price_min: prefMin ? Number(prefMin) : null,
        price_max: prefMax ? Number(prefMax) : null,
      });
      toast.success(t("saved"));
    } catch (err) {
      toast.error(err, t("oops"));
    }
  };

  const togglePrefCategory = (id: string) =>
    setPrefs((p) => ({
      ...p,
      category_ids: p.category_ids.includes(id)
        ? p.category_ids.filter((c) => c !== id)
        : [...p.category_ids, id],
    }));

  const togglePrefCity = (city: string) =>
    setPrefs((p) => ({
      ...p,
      preferred_cities: p.preferred_cities.includes(city)
        ? p.preferred_cities.filter((c) => c !== city)
        : [...p.preferred_cities, city],
    }));

  const connectTelegram = async () => {
    setTelegramBusy(true);
    const url = await getTelegramConnectUrl();
    setTelegramBusy(false);
    if (!url) {
      toast.error(null, t("oops"));
      return;
    }
    Linking.openURL(url).catch((err) => toast.error(err, t("oops")));
  };

  const unlinkTelegram = () => {
    setConfirm({
      title: t("telegramDisconnect"),
      message: t("telegramDisconnectConfirm"),
      label: t("telegramDisconnect"),
      onConfirm: async () => {
        setConfirm(null);
        setTelegramBusy(true);
        const ok = await disconnectTelegram();
        setTelegramBusy(false);
        if (!ok) {
          toast.error(null, t("oops"));
          return;
        }
        await refreshProfile();
      },
    });
  };

  /**
   * Manual update check. The app also auto-checks (on launch + foreground,
   * native ALWAYS) and auto-applies via the useAutoUpdate hook in the root
   * layout, so this is just an explicit "check now" for the profile footer.
   */
  const checkForUpdates = async () => {
    if (!Updates.isEnabled) {
      toast.error(null, t("updateDevOnly"));
      return;
    }
    setUpdateBusy(true);
    try {
      toast.success(t("updateChecking"));
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        toast.success(t("updateUpToDate"));
        return;
      }
      toast.success(t("updateDownloading"));
      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew) {
        toast.success(t("updateReady"));
        // Give the toast a moment to render before the app reloads.
        setTimeout(() => void Updates.reloadAsync(), 700);
      } else {
        toast.success(t("updateUpToDate"));
      }
    } catch (err) {
      toast.error(err, t("updateFailed"));
    } finally {
      setUpdateBusy(false);
    }
  };

  const confirmSignOut = () => {
    setConfirm({
      title: t("signOut"),
      message: t("logoutConfirm"),
      label: t("signOut"),
      onConfirm: () => {
        setConfirm(null);
        void signOut();
      },
    });
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
        <Button title={t("signIn")} onPress={() => router.push("/auth")} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const latestDoc = docs.data?.[0] ?? null;
  const docStatus = latestDoc?.status ?? null;
  const phoneVerified = !!profile?.phone_verified_at;

  // What the setup wizard still needs — shown as the card's hint so users
  // always see exactly what's left instead of hunting through the page.
  const missingSetup: string[] = [];
  if (!profile?.full_name) missingSetup.push(t("setupCompleteName"));
  if (!profile?.city) missingSetup.push(t("setupCompleteCity"));
  if (!profile?.phone) missingSetup.push(t("setupCompletePhone"));
  if (profile?.is_seller && !profile?.shop_name) missingSetup.push(t("setupCompleteShop"));
  if (profile?.is_seller && !profile?.latitude && !profile?.longitude) {
    missingSetup.push(t("setupCompleteLocation"));
  }
  if (
    prefsLoaded &&
    prefs.category_ids.length === 0 &&
    prefs.preferred_cities.length === 0 &&
    !prefs.telegram_alerts_enabled
  ) {
    missingSetup.push(t("setupCompletePrefs"));
  }
  const setupHint =
    missingSetup.length > 0
      ? `${t("setupMissingPrefix")} ${missingSetup.join(" · ")}`
      : t("setupAllSet");

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            {profile?.shop_logo_url || profile?.avatar_url ? (
              <Image
                source={imageSource(profile?.shop_logo_url ?? profile?.avatar_url, undefined, 300)}
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

        {/* Quick actions — kept at the very top so nothing important hides below
            the fold: the seller dashboard, safety, and favorites. */}
        <View style={styles.quickRow}>
          {profile?.is_seller ? (
            <QuickAction
              icon="speedometer-outline"
              label={t("dashTitle")}
              onPress={() => router.push("/dashboard")}
            />
          ) : null}
          <QuickAction
            icon="shield-checkmark-outline"
            label={t("safetyTitle")}
            onPress={() => router.push("/safety")}
          />
          <QuickAction
            icon="heart-outline"
            label={t("favorites")}
            onPress={() => router.push("/favorites")}
          />
          <QuickAction
            icon="language-outline"
            label={lang === "am" ? "English" : "አማርኛ"}
            onPress={() => setLang(lang === "en" ? "am" : "en")}
          />
        </View>

        {/* Set up your profile — one clear entry to the guided wizard. */}
        <Pressable style={styles.card} onPress={() => router.push("/setup-profile")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.setupIcon}>
              <Ionicons name="rocket-outline" size={20} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { marginBottom: 2 }]}>{t("setupTitle")}</Text>
              <Text style={styles.cardHint}>{setupHint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSoft} />
          </View>
        </Pressable>

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

        {/* Account */}
        <CollapsibleSection
          icon="person-outline"
          title={t("account")}
          summary={[fullName, city].filter(Boolean).join(" · ") || t("sectionSummaryNone")}
          defaultOpen
        >
          {user.email ? (
            <Field label={t("email")} value={user.email ?? ""} editable={false} />
          ) : null}
          <Field label={t("fullName")} value={fullName} onChange={setFullName} />
          <Field
            label={t("phone")}
            value={phone}
            onChange={setPhone}
            keyboardType="phone-pad"
          />
          <Text style={styles.fieldLabel}>{t("city")}</Text>
          <View style={styles.chipWrap}>
            {CITIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, city === c && styles.chipActive]}
                onPress={() => setCity(city === c ? "" : c)}
              >
                <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Field label={t("bio")} value={bio} onChange={setBio} multiline />
          <Button
            title={t("saveProfile")}
            onPress={saveAccount}
            loading={savingAccount}
            disabled={savingAccount}
          />
        </CollapsibleSection>

        {/* Shop setup */}
        {profile?.is_seller ? (
          <CollapsibleSection
            icon="storefront-outline"
            title={t("sellerShop")}
            summary={shopName || t("noShopYet")}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t("shopName")}</Text>
              <Pressable onPress={pickLogo}>
                <Text style={styles.link}>{t("changeLogo")}</Text>
              </Pressable>
            </View>
            <Field label={t("shopName")} value={shopName} onChange={setShopName} />
            <Field label={t("shopDescription")} value={shopDesc} onChange={setShopDesc} multiline />
            <Field label={t("shopAddress")} value={shopAddress} onChange={setShopAddress} />
            <Field label={t("registrationNumber")} value={regNumber} onChange={setRegNumber} />
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Field label={t("whatsapp")} value={whatsapp} onChange={setWhatsapp} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t("telegram")} value={telegram} onChange={setTelegram} />
              </View>
            </View>
            {/* Shop location — draggable pin map, stored as lat/lng (the web
                app's Leaflet picker writes the same columns). */}
            <Text style={styles.fieldLabel}>{t("setLocation")}</Text>
            {latitude != null && longitude != null ? (
              <Text style={styles.locationSummary} numberOfLines={1}>
                <Ionicons name="location" size={13} color={colors.primary} />{" "}
                {latitude.toFixed(5)}, {longitude.toFixed(5)}
              </Text>
            ) : null}
            <DraggablePinMap
              value={
                latitude != null && longitude != null ? { latitude, longitude } : null
              }
              onChange={(c) => {
                setLatitude(c?.latitude ?? null);
                setLongitude(c?.longitude ?? null);
              }}
            />
            <Button
              title={t("saveProfile")}
              onPress={saveShop}
              loading={saving}
              disabled={saving}
              style={{ marginTop: 12 }}
            />
          </CollapsibleSection>
        ) : null}

        {/* Phone verification */}
        <CollapsibleSection
          icon="call-outline"
          title={t("verifyPhone")}
          summary={phoneVerified ? t("otpVerified") : t("notVerified")}
        >
          {phoneVerified ? (
            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>{t("otpVerified")}</Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            </View>
          ) : (
            <>
              <Text style={styles.cardHint}>{t("otpHint")}</Text>
              <Field
                label={t("phone")}
                value={otpPhone}
                onChange={setOtpPhone}
                keyboardType="phone-pad"
                editable={!otpSent}
              />
              {otpSent ? (
                <View style={{ gap: 8, marginBottom: 10 }}>
                  <Text style={styles.cardHint}>{t("otpCodeSent")}</Text>
                  <Field
                    label={t("otpPlaceholder")}
                    value={otpCode}
                    onChange={setOtpCode}
                    keyboardType="number-pad"
                  />
                  <Button
                    title={t("otpVerify")}
                    onPress={confirmVerify}
                    loading={otpBusy}
                    disabled={otpBusy || otpCode.trim().length < 4}
                  />
                </View>
              ) : (
                <Button
                  title={t("otpVerifyViaTelegram")}
                  variant="outline"
                  onPress={startVerify}
                  loading={otpBusy}
                  disabled={otpBusy || otpPhone.trim().length < 9}
                />
              )}
            </>
          )}
        </CollapsibleSection>

        {/* Verification */}
        {profile?.is_seller ? (
          <CollapsibleSection
            icon="shield-checkmark-outline"
            title={t("verifyBadge")}
            summary={
              docStatus === "approved"
                ? t("docStatusApproved")
                : docStatus === "pending"
                  ? t("docStatusPending")
                  : docStatus === "rejected"
                    ? t("docStatusRejected")
                    : t("sectionSummaryNone")
            }
          >
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
          </CollapsibleSection>
        ) : null}

        {/* Preferences */}
        <CollapsibleSection
          icon="notifications-outline"
          title={t("alertPrefs")}
          summary={`${prefs.category_ids.length} ${t("categories")} · ${
            profile?.telegram_chat_id ? t("telegramConnected") : t("alertsOff")
          }`}
        >
          {telegramConfigured() ? (
            <View style={styles.telegramBlock}>
              {profile?.telegram_chat_id ? (
                <>
                  <View style={styles.prefRow}>
                    <Text style={styles.prefLabel}>{t("telegramConnected")}</Text>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  </View>
                  <Button
                    title={t("telegramDisconnect")}
                    variant="outline"
                    size="sm"
                    onPress={unlinkTelegram}
                    loading={telegramBusy}
                    disabled={telegramBusy}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.cardHint}>{t("telegramAlertsHint")}</Text>
                  <Button
                    title={t("telegramConnect")}
                    variant="outline"
                    size="sm"
                    onPress={connectTelegram}
                    loading={telegramBusy}
                    disabled={telegramBusy}
                    style={{ marginTop: 8 }}
                  />
                </>
              )}
            </View>
          ) : null}
          {/* Category preference — pick which furniture categories interest you. */}
          <Text style={styles.prefLabel}>{t("prefCategories")}</Text>
          <View style={styles.chipWrap}>
            {(cats.data ?? [])
              .filter((c) => !c.parent_id)
              .map((c) => {
                const active = prefs.category_ids.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => togglePrefCategory(c.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {lang === "am" ? (c.name_am ?? c.name) : c.name}
                    </Text>
                  </Pressable>
                );
              })}
          </View>

          {/* City preference */}
          <Text style={[styles.prefLabel, { marginTop: 12 }]}>{t("preferredCities")}</Text>
          <View style={styles.chipWrap}>
            {CITIES.map((c) => {
              const active = prefs.preferred_cities.includes(c);
              return (
                <Pressable
                  key={c}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => togglePrefCity(c)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Price range preference */}
          <Text style={[styles.prefLabel, { marginTop: 12 }]}>{t("priceRange")}</Text>
          <View style={styles.priceRow}>
            <TextInput
              value={prefMin}
              onChangeText={setPrefMin}
              placeholder={t("minPrice")}
              keyboardType="number-pad"
              placeholderTextColor={colors.textSoft}
              style={styles.priceInput}
            />
            <Text style={styles.priceSep}>{t("to")}</Text>
            <TextInput
              value={prefMax}
              onChangeText={setPrefMax}
              placeholder={t("maxPrice")}
              keyboardType="number-pad"
              placeholderTextColor={colors.textSoft}
              style={styles.priceInput}
            />
          </View>

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
        </CollapsibleSection>

        {/* Admin console */}
        {admin ? (
          <Pressable style={styles.card} onPress={() => router.push("/admin")}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.info} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { marginBottom: 2 }]}>{t("adminTitle")}</Text>
                <Text style={styles.cardHint}>{t("adminSubtitle")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSoft} />
            </View>
          </Pressable>
        ) : null}

        {/* Web app — same account, same marketplace, in the browser. */}
        <Pressable
          style={styles.card}
          onPress={() => Linking.openURL(WEB_APP_URL).catch(() => {})}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="globe-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { marginBottom: 2 }]}>{t("openWebApp")}</Text>
              <Text style={styles.cardHint}>{t("openWebAppHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSoft} />
          </View>
        </Pressable>

        {/* App update — manual check. Automatic checks happen on launch. */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("appUpdate")}</Text>
          <Text style={styles.cardHint}>{t("appUpdateHint")}</Text>
          <Button
            title={t("checkForUpdates")}
            variant="outline"
            onPress={checkForUpdates}
            loading={updateBusy}
            disabled={updateBusy}
            style={{ marginTop: 12 }}
          />
        </View>

        {/* Sign out */}
        <View style={styles.footer}>
          <Pressable onPress={confirmSignOut} hitSlop={8}>
            <Text style={styles.signOut}>{t("signOut")}</Text>
          </Pressable>
          <Text style={styles.about}>{t("madeInEthiopia")}</Text>
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title ?? ""}
        message={confirm?.message}
        confirmLabel={confirm?.label ?? ""}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </KeyboardAvoidingView>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.quick, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function CollapsibleSection({
  icon,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <Pressable style={styles.collapseHeader} onPress={() => setOpen((o) => !o)}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {summary ? (
            <Text style={styles.cardHint} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textSoft} />
      </Pressable>
      {open ? <View style={styles.collapseBody}>{children}</View> : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  autoCapitalize,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
  autoCapitalize?: "none";
  keyboardType?: "phone-pad" | "number-pad" | "email-address";
  editable?: boolean;
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
        keyboardType={keyboardType}
        editable={editable}
        style={[
          styles.fieldInput,
          multiline && { minHeight: 70, textAlignVertical: "top" },
          !editable && { opacity: 0.65 },
        ]}
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
  quickRow: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  quick: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 6,
    ...shadows.card,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontSize: 11.5, color: colors.text, fontWeight: "600", textAlign: "center" },
  setupIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
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
  telegramBlock: {
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
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
  twoCol: { flexDirection: "row", gap: 10 },
  locationSummary: {
    fontSize: 12.5,
    color: colors.textMuted,
    marginBottom: 10,
    fontFamily: "monospace",
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
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
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
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  priceInput: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  priceSep: { color: colors.textMuted },
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
  footer: { alignItems: "center", gap: 8, paddingTop: spacing.xl },
  signOut: { fontSize: 15, color: colors.danger, fontWeight: "700" },
  about: { fontSize: 12, color: colors.textSoft, textAlign: "center" },
  collapseHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  collapseBody: { marginTop: 14 },
});
