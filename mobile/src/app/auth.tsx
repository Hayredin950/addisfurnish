import { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useLang } from "../lib/lang";
import { Button } from "../components/Button";
import { colors, radius, spacing } from "../lib/theme";

type Mode = "signin" | "signup";

/**
 * Exchange a Supabase auth redirect URL for a session.
 *
 * Email confirmation (implicit flow — the client default) redirects back with
 * `#access_token=…&refresh_token=…` in the fragment, exactly like the Google
 * flow. Projects configured for PKCE instead return `?code=…`, which we
 * exchange the same way. Returns true when a session was established.
 */
async function handleAuthRedirectUrl(rawUrl: string): Promise<boolean> {
  try {
    const url = new URL(rawUrl);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error) return true;
    }
    const code = url.searchParams.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return true;
    }
  } catch {
    // Malformed URL — nothing to do.
  }
  return false;
}

/**
 * Email/password sign-in + account creation, and Google sign-in.
 *
 * Phone OTP login was removed: it depended on an SMS gateway that was never
 * configured, so it silently failed for every user. Phone is now a verified
 * attribute on the profile rather than a way in — see the Telegram-bot
 * verification flow in supabase/functions/telegram-bot.
 */
export default function AuthScreen() {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("signin");
  // Full name is only collected at sign-up.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set after a signup that needs email confirmation, so we can offer a resend
  // — confirmation mail lands in spam often enough that a dead end here would
  // strand people who can't find it.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const handledDeepLink = useRef(false);

  // Email-confirmation return: the verification page redirects the browser to
  // addisfurnish://auth#access_token=… (or ?code=… for PKCE projects). Capture
  // it on cold start and warm start, set the session and enter the app.
  useEffect(() => {
    const consume = async (raw: string | null) => {
      if (!raw || handledDeepLink.current) return;
      if (await handleAuthRedirectUrl(raw)) {
        handledDeepLink.current = true;
        router.replace("/(tabs)");
      }
    };
    void Linking.getInitialURL().then(consume);
    const sub = Linking.addEventListener("url", (e) => void consume(e.url));
    return () => sub.remove();
  }, []);

  const loginEmail = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
      } else {
        router.replace("/(tabs)");
      }
    } finally {
      setBusy(false);
    }
  };

  const signUp = async () => {
    setError(null);
    setNotice(null);
    if (password.length < 6) {
      setError(t("passwordMinLength"));
      return;
    }
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Confirmation and magic-link redirects land back in the app.
          emailRedirectTo: Linking.createURL("auth"),
          data: { full_name: fullName.trim() || undefined },
        },
      });
      if (err) {
        setError(err.message);
        return;
      }
      if (!data.session) {
        // Email confirmation is enabled — show the check-your-inbox state.
        setPendingEmail(email.trim());
        return;
      }
      router.replace("/(tabs)");
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    if (!pendingEmail) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email: pendingEmail,
      });
      if (err) setError(err.message);
      else setNotice(t("confirmationResent"));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Google OAuth via Supabase. The authorize URL is opened in an in-app
   * browser session; on return the tokens live in the URL fragment, which we
   * parse and hand to setSession (same trust chain as the web flow).
   */
  const loginGoogle = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const redirectTo = Linking.createURL("auth");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("no-url");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success" || !result.url) {
        setError(t("googleSignInFailed"));
        return;
      }
      // Supabase hands the tokens back in the URL *fragment* (`#access_token=`),
      // exactly like the web flow — never in the query string.
      const url = new URL(result.url);
      const params = new URLSearchParams(url.hash.slice(1));
      if (params.get("error")) {
        setError(t("googleSignInFailed"));
        return;
      }
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setError(t("googleSignInFailed"));
        return;
      }
      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionErr) throw sessionErr;
      router.replace("/(tabs)");
    } catch {
      setError(t("googleSignInFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Image
              source={require("../../assets/images/logo-mark.png")}
              style={styles.logoImg}
            />
          </View>
          <Text style={styles.title}>
            Addis<Text style={{ color: colors.primary }}>Furnish</Text>
          </Text>
          <Text style={styles.subtitle}>{t("welcome")}</Text>
        </View>

        {/* Google — mirrors the web OAuth flow (spec §3 fallback). */}
        <Pressable style={styles.googleBtn} onPress={loginGoogle} disabled={busy}>
          <Ionicons name="logo-google" size={18} color={colors.text} />
          <Text style={styles.googleText}>{t("continueGoogle")}</Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("orEmail")}</Text>
          <View style={styles.dividerLine} />
        </View>

        {pendingEmail ? (
          /* Confirmation email sent — offer a resend instead of a dead end. */
          <View style={styles.confirmCard}>
            <Ionicons name="mail-outline" size={22} color={colors.primary} />
            <Text style={styles.confirmTitle}>{t("checkEmail")}</Text>
            <Text style={styles.confirmHint}>{t("checkEmailHint")}</Text>
            <Button
              title={t("resendConfirmation")}
              onPress={resendConfirmation}
              loading={busy}
              disabled={busy}
              size="md"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          </View>
        ) : (
          <>
            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, mode === "signin" && styles.tabActive]}
                onPress={() => {
                  setMode("signin");
                  setError(null);
                  setNotice(null);
                }}
              >
                <Text style={[styles.tabText, mode === "signin" && styles.tabTextActive]}>
                  {t("signIn")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, mode === "signup" && styles.tabActive]}
                onPress={() => {
                  setMode("signup");
                  setError(null);
                  setNotice(null);
                }}
              >
                <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
                  {t("createAccount")}
                </Text>
              </Pressable>
            </View>

            <View style={styles.form}>
              {mode === "signup" ? (
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={t("fullName")}
                  placeholderTextColor={colors.textSoft}
                  autoCapitalize="words"
                  style={styles.input}
                />
              ) : null}
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t("email")}
                placeholderTextColor={colors.textSoft}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                style={styles.input}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={t("password")}
                placeholderTextColor={colors.textSoft}
                secureTextEntry
                autoComplete={mode === "signup" ? "new-password" : "password"}
                style={styles.input}
              />
              {mode === "signup" ? (
                <Text style={styles.hint}>{t("passwordMinLength")}</Text>
              ) : null}
              <Button
                title={mode === "signin" ? t("loginEmail") : t("createAccount")}
                onPress={mode === "signin" ? loginEmail : signUp}
                loading={busy}
                disabled={
                  busy || !email.trim() || !password || (mode === "signup" && !fullName.trim())
                }
                size="lg"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            </View>
          </>
        )}

        <Text style={styles.footer}>{t("madeInEthiopia")}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  brand: { alignItems: "center", marginBottom: spacing.xl },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 14,
  },
  logoImg: { width: 72, height: 72 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, fontFamily: "Georgia, serif" },
  subtitle: {
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
  tabTextActive: { color: colors.onPrimary },
  form: { gap: 12 },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
  },
  hint: { fontSize: 12, color: colors.textSoft, marginTop: -6 },
  confirmCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    gap: 10,
  },
  confirmTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  confirmHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 4,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    marginBottom: 4,
  },
  googleText: { fontSize: 14, color: colors.text, fontWeight: "700" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 12, color: colors.textSoft },
  error: { fontSize: 13, color: colors.danger, textAlign: "center" },
  notice: { fontSize: 13, color: colors.primary, textAlign: "center" },
  footer: { fontSize: 12, color: colors.textSoft, textAlign: "center", marginTop: spacing.xl },
});
