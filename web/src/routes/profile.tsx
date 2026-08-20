import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, ChevronDown, Heart, LayoutDashboard, Send, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { RequireAuth } from "@/components/RequireAuth";
import { LocationPicker, type Coords } from "@/components/LocationPicker";
import { getTelegramConnectUrl, disconnectTelegram, telegramConfigured } from "@/lib/telegram";
import { startPhoneVerification, verifyPhoneOtp } from "@/lib/otp";
import {
  buyerPreferencesQuery,
  categoriesQuery,
  saveBuyerPreferences,
  sellerVerificationDocsQuery,
  submitVerificationDocument,
  type BuyerPreferences,
} from "@/lib/marketplace";
import {
  deleteCloudinaryAssets,
  useImageUrl,
  uploadShopLogo,
  uploadVerificationDocument,
} from "@/lib/storage";
import { CITIES } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/profile")({
  // Deep link from the Telegram bot: /profile?connect=telegram scrolls to and
  // highlights the Connect Telegram section so the user finds it instantly.
  validateSearch: (search: Record<string, unknown>): { connect?: string } => {
    const connect = typeof search["connect"] === "string" ? search["connect"] : undefined;
    // exactOptionalPropertyTypes: omit the key entirely when absent.
    return connect ? { connect } : {};
  },
  head: () => ({
    meta: [
      { title: "Your Profile & Shop — HabeshaHome" },
      { name: "description", content: "Update your contact details and shop information." },
      { property: "og:title", content: "Your Profile — HabeshaHome" },
      { property: "og:description", content: "Manage your HabeshaHome account and shop page." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ProfilePage />
    </RequireAuth>
  ),
});

const DOC_TYPE_KEY: Record<
  string,
  "verif.docTypenational_id" | "verif.docTypebusiness_license" | "verif.docTypeother"
> = {
  national_id: "verif.docTypenational_id",
  business_license: "verif.docTypebusiness_license",
  other: "verif.docTypeother",
};

const DOC_STATUS_KEY: Record<
  string,
  "verif.statuspending" | "verif.statusapproved" | "verif.statusrejected"
> = {
  pending: "verif.statuspending",
  approved: "verif.statusapproved",
  rejected: "verif.statusrejected",
};

function ProfilePage() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: categories } = useQuery(categoriesQuery);
  const { data: prefs } = useQuery(buyerPreferencesQuery(user?.id ?? ""));
  const { data: verificationDocs } = useQuery(sellerVerificationDocsQuery(user?.id ?? ""));
  const [docType, setDocType] = useState("business_license");
  const [docBusy, setDocBusy] = useState(false);
  const logoUrl = useImageUrl(profile?.shop_logo_url ?? null);
  const [prefCategoryIds, setPrefCategoryIds] = useState<string[]>(prefs?.category_ids ?? []);
  const [prefCities, setPrefCities] = useState<string[]>(prefs?.preferred_cities ?? []);
  const [prefMin, setPrefMin] = useState<string>(prefs?.price_min ? String(prefs.price_min) : "");
  const [prefMax, setPrefMax] = useState<string>(prefs?.price_max ? String(prefs.price_max) : "");
  const [prefTelegram, setPrefTelegram] = useState(prefs?.telegram_alerts_enabled ?? false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [otpPhone, setOtpPhone] = useState(profile?.phone ?? "");

  useEffect(() => {
    if (!prefs) return;
    setPrefCategoryIds(prefs.category_ids ?? []);
    setPrefCities(prefs.preferred_cities ?? []);
    setPrefMin(prefs.price_min ? String(prefs.price_min) : "");
    setPrefMax(prefs.price_max ? String(prefs.price_max) : "");
    setPrefTelegram(prefs.telegram_alerts_enabled ?? false);
  }, [prefs]);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  // Shop location pin. Seeded from the profile once it loads.
  const [shopCoords, setShopCoords] = useState<Coords | null>(null);
  const coordsSeeded = useRef(false);
  useEffect(() => {
    if (coordsSeeded.current) return;
    if (profile?.latitude != null && profile?.longitude != null) {
      coordsSeeded.current = true;
      setShopCoords({ latitude: profile.latitude, longitude: profile.longitude });
    }
  }, [profile]);

  /** Saves just the account fields — one save per section, like the app. */
  const saveAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: String(form.get("full_name")),
        phone: (form.get("phone") as string) || null,
        city: (form.get("city") as string) || null,
      })
      .eq("id", user!.id);
    if (error) {
      // Show the real reason instead of a generic failure.
      toast.error(error.message);
      return;
    }
    toast.success(t("toast.profileUpdated"));
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  };

  /** Saves the shop fields; filling a shop name also makes you a seller. */
  const saveShop = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const shopName = (form.get("shop_name") as string) || null;
    const { error } = await supabase
      .from("profiles")
      .update({
        shop_name: shopName,
        shop_slug: shopName
          ? shopName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
          : null,
        shop_description: (form.get("shop_description") as string) || null,
        shop_address: (form.get("shop_address") as string) || null,
        whatsapp: (form.get("whatsapp") as string) || null,
        telegram: (form.get("telegram") as string) || null,
        registration_number: (form.get("registration_number") as string) || null,
        is_seller: !!shopName,
        latitude: shopCoords?.latitude ?? null,
        longitude: shopCoords?.longitude ?? null,
      })
      .eq("id", user!.id);
    if (error) {
      // Show the real reason instead of a generic failure.
      toast.error(error.message);
      return;
    }
    toast.success(t("toast.profileUpdated"));
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  };

  const submitVerificationDoc = async (file: File) => {
    if (!user) return;
    setDocBusy(true);
    try {
      const path = await uploadVerificationDocument(user.id, file);
      await submitVerificationDocument(user.id, docType, path);
      toast.success(t("verif.submitted"));
      queryClient.invalidateQueries({ queryKey: ["seller-verification-docs"] });
    } catch {
      toast.error(t("toast.couldNotSave"));
    } finally {
      setDocBusy(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!user) return;
    let path: string;
    try {
      path = await uploadShopLogo(user.id, file);
    } catch (error) {
      // Surface the real reason — a missing bucket and a rejected file type look
      // identical otherwise.
      toast.error(error instanceof Error ? error.message : t("toast.couldNotSave"));
      return;
    }
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ shop_logo_url: path })
      .eq("id", user.id);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    // The old logo leaves with the swap — it would otherwise stay on
    // Cloudinary forever.
    if (profile?.shop_logo_url) void deleteCloudinaryAssets([profile.shop_logo_url]);
    toast.success(t("toast.profileUpdated"));
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  };

  const savePrefs = async () => {
    if (!user) return;
    const next: BuyerPreferences = {
      category_ids: prefCategoryIds,
      price_min: prefMin ? Number(prefMin) : null,
      price_max: prefMax ? Number(prefMax) : null,
      preferred_cities: prefCities,
      telegram_alerts_enabled: prefTelegram,
    };
    try {
      await saveBuyerPreferences(user.id, next);
      toast.success(t("toast.prefsSaved"));
      queryClient.invalidateQueries({ queryKey: ["buyer-preferences"] });
    } catch {
      toast.error(t("toast.requestFailed"));
    }
  };

  const togglePrefCategory = (id: string) =>
    setPrefCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  const togglePrefCity = (city: string) =>
    setPrefCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city],
    );

  const linkTelegram = async () => {
    setTelegramBusy(true);
    const url = await getTelegramConnectUrl();
    setTelegramBusy(false);
    if (!url) {
      toast.error(t("toast.requestFailed"));
      return;
    }
    window.open(url, "_blank");
  };

  const unlinkTelegram = async () => {
    setTelegramBusy(true);
    const ok = await disconnectTelegram();
    setTelegramBusy(false);
    if (!ok) {
      toast.error(t("toast.requestFailed"));
      return;
    }
    // The badge reads profile.telegram_chat_id, so refresh the cached profile.
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success(t("profile.telegramDisconnected"));
  };

  const { connect } = Route.useSearch();
  const telegramRef = useRef<HTMLDivElement>(null);
  const [flashTelegram, setFlashTelegram] = useState(false);
  useEffect(() => {
    if (connect !== "telegram") return;
    // Let the section mount (and the profile finish loading) before scrolling.
    const scroll = setTimeout(() => {
      telegramRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashTelegram(true);
      setTimeout(() => setFlashTelegram(false), 2600);
    }, 350);
    return () => clearTimeout(scroll);
  }, [connect]);

  const latestDoc =
    verificationDocs?.find((d) => d.status === "pending") ?? verificationDocs?.[0] ?? null;
  const docStatus = latestDoc?.status ?? null;
  const docSummary = docStatus
    ? t(DOC_STATUS_KEY[docStatus] ?? "verif.statuspending")
    : t("profile.sectionNone");
  const prefsSummary = `${prefCategoryIds.length} ${t("profile.prefCategories")} · ${
    profile?.telegram_chat_id ? t("profile.telegramConnected") : t("profile.sectionNone")
  }`;

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      {/* Header — avatar, name, email and seller status, like the app. */}
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border bg-secondary text-lg font-bold text-muted-foreground">
          {logoUrl.data ? (
            <img src={logoUrl.data} alt="Shop logo" className="h-full w-full object-cover" />
          ) : (
            (profile?.full_name ?? "A").charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold">
            {profile?.shop_name ?? profile?.full_name ?? t("nav.profile")}
          </h1>
          {user?.email ? (
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          ) : null}
          {profile?.is_seller ? (
            <p className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
              <BadgeCheck className="h-3.5 w-3.5" />
              {profile.verified ? t("shop.verified") : t("verif.becomeSeller")}
            </p>
          ) : null}
        </div>
      </div>

      {/* Quick actions — the app's profile shortcuts, one tap each. */}
      <div className="mt-6 flex gap-2">
        {profile?.is_seller ? (
          <QuickAction
            icon={<LayoutDashboard className="h-5 w-5" />}
            label={t("nav.myShop")}
            to="/dashboard"
          />
        ) : null}
        <QuickAction
          icon={<ShieldCheck className="h-5 w-5" />}
          label={t("nav.safety")}
          to="/safety"
        />
        <QuickAction
          icon={<Heart className="h-5 w-5" />}
          label={t("nav.savedItems")}
          to="/favorites"
        />
      </div>

      {/* Account — always expanded. */}
      <ProfileSection
        title={t("profile.account")}
        defaultOpen
        summary={
          [profile?.full_name, profile?.city].filter(Boolean).join(" · ") ||
          t("profile.sectionNone")
        }
      >
        <form className="mt-4 space-y-4" onSubmit={saveAccount}>
          {/* The email is the login identity and can't be edited here — show it
              read-only so the account is identifiable. */}
          {user?.email ? (
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" value={user.email} readOnly disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">{t("profile.emailHint")}</p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="full_name">{t("auth.fullName")}</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={profile?.full_name ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t("profile.phone")}</Label>
            <Input id="phone" name="phone" defaultValue={profile?.phone ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">{t("browse.city")}</Label>
            <select
              id="city"
              name="city"
              defaultValue={profile?.city ?? ""}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("sell.select")}</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">{t("profile.save")}</Button>
        </form>
      </ProfileSection>

      {/* Become a seller — a nudge, not a wall of empty shop fields. */}
      {!profile?.is_seller ? (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-primary">{t("verif.becomeSeller")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("verif.becomeSellerHint")}</p>
          <p className="mt-2 text-xs font-medium text-primary">{t("profile.shopNotSet")}</p>
        </div>
      ) : null}

      {/* Seller & shop — collapsed unless a seller; open it to become one. */}
      <ProfileSection
        title={t("profile.sellerShop")}
        defaultOpen={!!profile?.is_seller}
        summary={profile?.shop_name || t("profile.shopNotSet")}
      >
        <form className="mt-4 space-y-5" onSubmit={saveShop}>
          <div className="space-y-2">
            <Label htmlFor="shop_name">{t("profile.shopName")}</Label>
            <Input id="shop_name" name="shop_name" defaultValue={profile?.shop_name ?? ""} />
          </div>
          <div className="flex items-end gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-secondary">
              {logoUrl.data ? (
                <img src={logoUrl.data} alt="Shop logo" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                  Logo
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="logo">{t("profile.logo")}</Label>
              <Input
                id="logo"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadLogo(file);
                }}
              />
              <p className="text-xs text-muted-foreground">{t("profile.logoHint")}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shop_description">{t("profile.shopDescription")}</Label>
            <Textarea
              id="shop_description"
              name="shop_description"
              rows={4}
              defaultValue={profile?.shop_description ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shop_address">{t("profile.shopAddress")}</Label>
            <Input
              id="shop_address"
              name="shop_address"
              defaultValue={profile?.shop_address ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("loc.pin")}</Label>
            <LocationPicker value={shopCoords} onChange={setShopCoords} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="whatsapp">{t("profile.whatsapp")}</Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                defaultValue={profile?.whatsapp ?? ""}
                placeholder="+2519…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegram">{t("profile.telegram")}</Label>
              <Input
                id="telegram"
                name="telegram"
                defaultValue={profile?.telegram ?? ""}
                placeholder="@yourname"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="registration_number">{t("profile.registrationNumber")}</Label>
            <Input
              id="registration_number"
              name="registration_number"
              defaultValue={profile?.registration_number ?? ""}
              placeholder="e.g. 2310/2024"
            />
            <p className="text-xs text-muted-foreground">{t("profile.registrationHint")}</p>
          </div>
          <Button type="submit">{t("profile.save")}</Button>
        </form>
      </ProfileSection>

      {/* Verification — sellers only, with an inline status summary. */}
      {profile?.is_seller ? (
        <ProfileSection title={t("verif.title")} summary={docSummary}>
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">{t("verif.hint")}</p>
            <div className="space-y-2">
              {(verificationDocs ?? []).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-secondary/30 px-3 py-2 text-xs"
                >
                  <span className="capitalize">
                    {t(DOC_TYPE_KEY[d.document_type] ?? "verif.docTypeother")}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 capitalize ${
                      d.status === "approved"
                        ? "bg-success/10 text-success"
                        : d.status === "rejected"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    {t(DOC_STATUS_KEY[d.status] ?? "verif.statuspending")}
                  </span>
                </div>
              ))}
              {verificationDocs?.some((d) => d.status === "rejected") ? (
                <p className="text-xs text-destructive">{t("verif.rejectedHint")}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs capitalize"
              >
                <option value="national_id">{t("verif.docTypenational_id")}</option>
                <option value="business_license">{t("verif.docTypebusiness_license")}</option>
                <option value="other">{t("verif.docTypeother")}</option>
              </select>
              <Input
                type="file"
                accept="image/*,.pdf"
                className="h-9 max-w-52 text-xs"
                disabled={docBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void submitVerificationDoc(file);
                }}
              />
            </div>
          </div>
        </ProfileSection>
      ) : null}

      {/* Phone verification. */}
      <ProfileSection
        title={t("otp.title")}
        summary={profile?.phone_verified_at ? t("otp.verified") : t("profile.sectionNone")}
      >
        <div className="mt-4 space-y-3">
          {profile?.phone_verified_at ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <BadgeCheck className="h-3.5 w-3.5" /> {t("otp.verified")}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("otp.telegramHint")}</p>
              <div className="flex gap-2">
                <Input
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(e.target.value)}
                  placeholder="09xx xxx xxx"
                  inputMode="tel"
                  disabled={otpSent}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={otpBusy || otpPhone.trim().length < 9}
                  onClick={async () => {
                    setOtpBusy(true);
                    const res = await startPhoneVerification({ data: { phone: otpPhone } });
                    setOtpBusy(false);
                    if (res.ok) {
                      // The bot asks for the contact, checks it, then DMs the
                      // code — so the input only opens once they're sent off.
                      setOtpSent(true);
                      window.open(res.url, "_blank");
                    } else if (res.error === "taken") {
                      toast.error(t("otp.phoneTaken"));
                    } else if (res.error === "invalid_phone") {
                      toast.error(t("otp.invalidPhone"));
                    } else if (res.error === "auth") {
                      toast.error(t("req.title"));
                    } else {
                      toast.error(t("toast.requestFailed"));
                    }
                  }}
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  {t("otp.verifyViaTelegram")}
                </Button>
              </div>
              {otpSent ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t("otp.codeSent")}</p>
                  <div className="flex gap-2">
                    <Input
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder={t("otp.placeholder")}
                      inputMode="numeric"
                      maxLength={6}
                    />
                    <Button
                      type="button"
                      disabled={otpBusy || otpCode.length !== 6}
                      onClick={async () => {
                        setOtpBusy(true);
                        const res = await verifyPhoneOtp({
                          data: { phone: otpPhone, code: otpCode },
                        });
                        setOtpBusy(false);
                        if (res.ok) {
                          toast.success(t("otp.toastVerified"));
                          setOtpSent(false);
                          setOtpCode("");
                          queryClient.invalidateQueries({ queryKey: ["profile"] });
                        } else if (res.error === "wrong_code") {
                          toast.error(t("otp.wrongCode"));
                        } else if (res.error === "expired") {
                          toast.error(t("otp.expired"));
                        } else if (res.error === "too_many") {
                          toast.error(t("otp.tooMany"));
                        } else if (res.error === "no_code") {
                          toast.error(t("otp.noCodeYet"));
                        } else if (res.error === "taken") {
                          toast.error(t("otp.phoneTaken"));
                        } else {
                          toast.error(t("toast.requestFailed"));
                        }
                      }}
                    >
                      {t("otp.verify")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </ProfileSection>

      {/* Notifications & alerts — Telegram link lives here, like the app. */}
      <ProfileSection
        title={t("profile.alertPrefs")}
        summary={prefsSummary}
        defaultOpen={connect === "telegram"}
      >
        <div ref={telegramRef} className="mt-4 space-y-4">
          {telegramConfigured() ? (
            <div
              className={`rounded-lg border border-dashed bg-secondary/40 p-4 transition-shadow ${
                flashTelegram ? "ring-2 ring-primary" : ""
              }`}
            >
              <p className="text-sm font-medium">{t("profile.telegramConnect")}</p>
              {profile?.telegram_chat_id ? (
                <>
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                    <BadgeCheck className="h-3.5 w-3.5" /> {t("profile.telegramConnected")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 block"
                    disabled={telegramBusy}
                    onClick={unlinkTelegram}
                  >
                    {t("profile.telegramDisconnect")}
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("profile.telegramConnectHint")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={telegramBusy}
                    onClick={linkTelegram}
                  >
                    <Send className="mr-1.5 h-4 w-4" />
                    {t("profile.telegramConnect")}
                  </Button>
                </>
              )}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">{t("profile.prefNote")}</p>
          <div className="space-y-2">
            <Label>{t("profile.prefCategories")}</Label>
            <div className="flex flex-wrap gap-2">
              {(categories ?? [])
                .filter((c) => !c.parent_id)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => togglePrefCategory(c.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      prefCategoryIds.includes(c.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-secondary"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("profile.prefCities")}</Label>
            <div className="flex flex-wrap gap-2">
              {CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => togglePrefCity(city)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    prefCities.includes(city)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-secondary"
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pref_min">{t("profile.priceMin")}</Label>
              <Input
                id="pref_min"
                type="number"
                min={0}
                value={prefMin}
                onChange={(e) => setPrefMin(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pref_max">{t("profile.priceMax")}</Label>
              <Input
                id="pref_max"
                type="number"
                min={0}
                value={prefMax}
                onChange={(e) => setPrefMax(e.target.value)}
                placeholder="100000"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="pref_telegram" checked={prefTelegram} onCheckedChange={setPrefTelegram} />
            <Label htmlFor="pref_telegram">{t("profile.telegramAlerts")}</Label>
          </div>
          <Button type="button" variant="outline" onClick={savePrefs}>
            {t("profile.savePrefs")}
          </Button>
        </div>
      </ProfileSection>
    </div>
  );
}

/** One tap on a profile shortcut — mirrors the app's QuickAction row. */
function QuickAction({
  icon,
  label,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  to: "/dashboard" | "/safety" | "/favorites";
}) {
  return (
    <Link
      to={to}
      className="flex flex-1 flex-col items-center gap-2 rounded-lg border bg-card px-2 py-3.5 text-center transition-colors hover:bg-accent"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="text-[11.5px] font-semibold leading-tight text-foreground">{label}</span>
    </Link>
  );
}

/**
 * One collapsible card on the profile page, mirroring the mobile app's
 * sections. Each carries a one-line status summary so its state is visible
 * without opening it.
 */
function ProfileSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group mt-4 rounded-lg border bg-card p-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
        <span>{title}</span>
        <span className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted-foreground">
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      {children}
    </details>
  );
}
