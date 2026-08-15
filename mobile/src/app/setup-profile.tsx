import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { useAsync } from "../hooks/use-async";
import {
  fetchBuyerPreferences,
  fetchCategories,
  saveBuyerPreferences,
  updateProfile,
  uploadVerificationDocument,
} from "../lib/api";
import { startPhoneVerification, verifyPhoneOtp } from "../lib/otp";
import { DraggablePinMap } from "../components/DraggablePinMap";
import { Button } from "../components/Button";
import { useToast } from "../components/Toast";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { uniqueShopSlug } from "../lib/slug";
import type { BuyerPreferences } from "../lib/api";

const DOC_TYPES = ["National ID", "Business License", "TIN Certificate", "Other"];
const CITIES = ["Addis Ababa", "Dire Dawa", "Hawassa", "Bahir Dar", "Mekelle", "Adama", "Gondar"];
const STEPS = 4;

export default function SetupProfileScreen() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const { t, lang } = useLang();
  const toast = useToast();

  // Step 1 — basics
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");

  // Step 2 — shop (optional)
  const [selling, setSelling] = useState(false);
  const [shopName, setShopName] = useState("");
  const [shopDesc, setShopDesc] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telegram, setTelegram] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Step 3 — alert preferences
  const [prefs, setPrefs] = useState<BuyerPreferences>({
    category_ids: [],
    price_min: null,
    price_max: null,
    preferred_cities: [],
    telegram_alerts_enabled: false,
  });
  const [prefMin, setPrefMin] = useState("");
  const [prefMax, setPrefMax] = useState("");

  // Step 4 — phone verification + verified badge
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [docType, setDocType] = useState(DOC_TYPES[0]!);
  const [docBusy, setDocBusy] = useState(false);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const cats = useAsync(fetchCategories, []);

  // Hydrate from the profile once loaded.
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setCity(profile.city ?? "");
    setPhone(profile.phone ?? "");
    setSelling(!!profile.is_seller);
    setShopName(profile.shop_name ?? "");
    setShopDesc(profile.shop_description ?? "");
    setShopAddress(profile.shop_address ?? "");
    setWhatsapp(profile.whatsapp ?? "");
    setTelegram(profile.telegram ?? "");
    setLatitude(profile.latitude ?? null);
    setLongitude(profile.longitude ?? null);
    setOtpPhone(profile.phone ?? "");
  }, [profile]);

  useEffect(() => {
    if (user && prefs.category_ids.length === 0 && prefs.preferred_cities.length === 0) {
      void fetchBuyerPreferences(user.id).then((p) => {
        if (p) {
          setPrefs(p);
          setPrefMin(p.price_min != null ? String(p.price_min) : "");
          setPrefMax(p.price_max != null ? String(p.price_max) : "");
        }
      });
    }
    // Only run once — the guards above keep it from looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Deep links to this screen while signed out go to the auth screen.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [loading, user]);

  if (loading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  /** Step 1 — save basics, then advance. */
  const saveBasics = async () => {
    if (!fullName.trim()) {
      toast.error(null, t("setupNameRequired"));
      return;
    }
    if (!city) {
      toast.error(null, t("setupCityRequired"));
      return;
    }
    setSaving(true);
    try {
      await updateProfile(user.id, {
        full_name: fullName.trim(),
        city: city || null,
        phone: phone.trim() || null,
      });
      await refreshProfile();
      setStep(2);
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setSaving(false);
    }
  };

  /** Step 2 — save shop details (only when selling). */
  const saveShop = async () => {
    setSaving(true);
    try {
      if (selling) {
        if (!shopName.trim()) {
          toast.error(null, t("setupShopNameRequired"));
          setSaving(false);
          return;
        }
        const name = shopName.trim();
        const slug =
          name && profile?.shop_name?.trim() === name && profile?.shop_slug
            ? profile.shop_slug
            : await uniqueShopSlug(name);
        await updateProfile(user.id, {
          shop_name: name,
          shop_slug: slug,
          shop_description: shopDesc.trim() || null,
          shop_address: shopAddress.trim() || null,
          whatsapp: whatsapp.trim() || null,
          telegram: telegram.trim().replace(/^@/, "") || null,
          latitude,
          longitude,
          is_seller: true,
        });
      }
      await refreshProfile();
      setStep(3);
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setSaving(false);
    }
  };

  /** Step 3 — save alert preferences. */
  const savePrefs = async () => {
    setSaving(true);
    try {
      await saveBuyerPreferences(user.id, {
        ...prefs,
        price_min: prefMin ? Number(prefMin) : null,
        price_max: prefMax ? Number(prefMax) : null,
      });
      setStep(4);
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setSaving(false);
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

  const submitDoc = async () => {
    setDocBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const path = await uploadVerificationDocument(user.id, res.assets[0]);
      const { error } = await supabase.from("seller_verification_documents").insert({
        seller_id: user.id,
        document_type: docType,
        file_url: path,
        status: "pending",
      });
      if (error) throw error;
      toast.success(t("setupDocSubmitted"));
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setDocBusy(false);
    }
  };

  const togglePrefCategory = (id: string) =>
    setPrefs((p) => ({
      ...p,
      category_ids: p.category_ids.includes(id)
        ? p.category_ids.filter((c) => c !== id)
        : [...p.category_ids, id],
    }));

  const togglePrefCity = (c: string) =>
    setPrefs((p) => ({
      ...p,
      preferred_cities: p.preferred_cities.includes(c)
        ? p.preferred_cities.filter((x) => x !== c)
        : [...p.preferred_cities, c],
    }));

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t("setupTitle")}</Text>
          <Text style={styles.subtitle}>{t("setupSubtitle")}</Text>
          {/* Progress dots */}
          <View style={styles.progressRow}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={[styles.dot, i < step && styles.dotActive]} />
            ))}
            <Text style={styles.stepLabel}>
              {t("setupStep")} {step}/{STEPS}
            </Text>
          </View>
        </View>

        {/* Step 1 — basics */}
        {step === 1 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("setupBasics")}</Text>
            <Text style={styles.cardHint}>{t("setupBasicsHint")}</Text>
            <Field label={t("fullName")} value={fullName} onChange={setFullName} />
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
            <Field
              label={t("phone")}
              value={phone}
              onChange={setPhone}
              keyboardType="phone-pad"
            />
            <Button title={t("setupContinue")} onPress={saveBasics} loading={saving} disabled={saving} />
          </View>
        ) : null}

        {/* Step 2 — shop */}
        {step === 2 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("setupShop")}</Text>
            <Text style={styles.cardHint}>{t("setupShopHint")}</Text>

            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>{t("setupSelling")}</Text>
              <Switch
                value={selling}
                onValueChange={setSelling}
                trackColor={{ true: colors.primary }}
              />
            </View>

            {selling ? (
              <>
                <Field label={t("shopName")} value={shopName} onChange={setShopName} />
                <Field label={t("shopDescription")} value={shopDesc} onChange={setShopDesc} multiline />
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Field label={t("whatsapp")} value={whatsapp} onChange={setWhatsapp} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label={t("telegram")} value={telegram} onChange={setTelegram} />
                  </View>
                </View>
                <Field label={t("shopAddress")} value={shopAddress} onChange={setShopAddress} />
                <Text style={styles.fieldLabel}>{t("setLocation")}</Text>
                {latitude != null && longitude != null ? (
                  <Text style={styles.locationSummary} numberOfLines={1}>
                    <Ionicons name="location" size={13} color={colors.primary} />{" "}
                    {latitude.toFixed(5)}, {longitude.toFixed(5)}
                  </Text>
                ) : null}
                <DraggablePinMap
                  value={latitude != null && longitude != null ? { latitude, longitude } : null}
                  onChange={(c) => {
                    setLatitude(c?.latitude ?? null);
                    setLongitude(c?.longitude ?? null);
                  }}
                />
              </>
            ) : (
              <View style={styles.skipBox}>
                <Text style={styles.skipText}>{t("setupSkipShopHint")}</Text>
              </View>
            )}
            <Button
              title={t("setupContinue")}
              onPress={saveShop}
              loading={saving}
              disabled={saving}
              style={{ marginTop: 12 }}
            />
          </View>
        ) : null}

        {/* Step 3 — preferences */}
        {step === 3 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("setupPrefs")}</Text>
            <Text style={styles.cardHint}>{t("setupPrefsHint")}</Text>

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

            <Button title={t("setupContinue")} onPress={savePrefs} loading={saving} disabled={saving} />
          </View>
        ) : null}

        {/* Step 4 — review & finish */}
        {step === 4 ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("setupReview")}</Text>
              <Text style={styles.cardHint}>{t("setupReviewHint")}</Text>

              <SummaryRow icon="person-outline" label={t("fullName")} value={fullName || "—"} />
              <SummaryRow icon="location-outline" label={t("city")} value={city || "—"} />
              <SummaryRow icon="call-outline" label={t("phone")} value={phone || "—"} />
              {selling ? (
                <>
                  <SummaryRow icon="storefront-outline" label={t("shopName")} value={shopName || "—"} />
                  {latitude != null && longitude != null ? (
                    <SummaryRow
                      icon="map-outline"
                      label={t("setLocation")}
                      value={`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
                    />
                  ) : null}
                </>
              ) : null}
              <SummaryRow
                icon="notifications-outline"
                label={t("alertPrefs")}
                value={
                  prefs.category_ids.length > 0 || prefs.preferred_cities.length > 0
                    ? `${prefs.category_ids.length} ${t("setupCatShort")} · ${prefs.preferred_cities.length} ${t("setupCityShort")}`
                    : t("setupNoPrefs")
                }
              />

              <View style={styles.doneRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.doneText}>{t("setupDone")}</Text>
              </View>

              <Button
                title={t("setupFinish")}
                onPress={() => router.back()}
                style={{ marginTop: 4 }}
              />
            </View>

            {/* Phone verification */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("verifyPhone")}</Text>
              {profile?.phone_verified_at ? (
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
            </View>

            {/* Verified badge (sellers) */}
            {selling ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("verifyBadge")}</Text>
                <Text style={styles.cardHint}>{t("setupDocHint")}</Text>
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
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
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
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadows.card,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginTop: 4 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 14 },
  dot: {
    width: 26,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  dotActive: { backgroundColor: colors.primary },
  stepLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600", marginLeft: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
    marginBottom: 0,
    ...shadows.card,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 6 },
  cardHint: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: 12 },
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
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 8,
  },
  prefLabel: { fontSize: 13.5, color: colors.text, fontWeight: "600" },
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
  skipBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 4,
  },
  skipText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  summaryLabel: { fontSize: 12.5, color: colors.textMuted, width: 92 },
  summaryValue: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600" },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 14 },
  doneText: { fontSize: 14, color: colors.success, fontWeight: "700" },
});
