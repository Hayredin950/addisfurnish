import { useState } from "react";
import {
  ActivityIndicator,
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

/**
 * Phone-first passwordless auth (spec §3).
 * Phone OTP uses Supabase's native signInWithOtp/verifyOtp; email/password is
 * offered as a fallback for users who registered with an email address.
 */
export default function AuthScreen() {
  const { t } = useLang();
  const [mode, setMode] = useState<"phone" | "email">("phone");

  // Phone OTP
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const sendOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true },
      });
      if (err) {
        setError(err.message);
      } else {
        setOtpSent(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        phone,
        token: code.trim(),
        type: "sms",
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

  const loginEmail = async () => {
    setError(null);
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

  /**
   * Google OAuth via Supabase. The authorize URL is opened in an in-app
   * browser session; on return the tokens live in the URL fragment, which we
   * parse and hand to setSession (same trust chain as the web flow).
   */
  const loginGoogle = async () => {
    setError(null);
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="storefront" size={34} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t("welcome")}</Text>
          <Text style={styles.subtitle}>{t("loginPhone")}</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === "phone" && styles.tabActive]}
            onPress={() => {
              setMode("phone");
              setError(null);
            }}
          >
            <Ionicons
              name="call"
              size={16}
              color={mode === "phone" ? colors.onPrimary : colors.textMuted}
            />
            <Text style={[styles.tabText, mode === "phone" && styles.tabTextActive]}>
              {t("phone")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === "email" && styles.tabActive]}
            onPress={() => {
              setMode("email");
              setError(null);
            }}
          >
            <Ionicons
              name="mail"
              size={16}
              color={mode === "email" ? colors.onPrimary : colors.textMuted}
            />
            <Text style={[styles.tabText, mode === "email" && styles.tabTextActive]}>
              {t("email")}
            </Text>
          </Pressable>
        </View>

        {/* Google — mirrors the web OAuth flow (spec §3 fallback). */}
        <Pressable
          style={styles.googleBtn}
          onPress={loginGoogle}
          disabled={busy}
        >
          <Ionicons name="logo-google" size={18} color={colors.text} />
          <Text style={styles.googleText}>{t("continueGoogle")}</Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("orEmail")}</Text>
          <View style={styles.dividerLine} />
        </View>

        {mode === "phone" ? (
          <View style={styles.form}>
            {!otpSent ? (
              <>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t("phone")}
                  placeholderTextColor={colors.textSoft}
                  keyboardType="phone-pad"
                  style={styles.input}
                  autoFocus
                />
                <Button
                  title={t("sendCode")}
                  onPress={sendOtp}
                  loading={busy}
                  disabled={busy || phone.trim().length < 9}
                  size="lg"
                />
              </>
            ) : (
              <>
                <View style={styles.codeRow}>
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    placeholder={t("code")}
                    placeholderTextColor={colors.textSoft}
                    keyboardType="number-pad"
                    style={[styles.input, styles.codeInput]}
                    maxLength={6}
                    autoFocus
                  />
                  <Pressable style={styles.resend} onPress={sendOtp} disabled={busy} hitSlop={8}>
                    <Text style={styles.resendText}>{t("resendCode")}</Text>
                  </Pressable>
                </View>
                <Button
                  title={t("verify")}
                  onPress={verifyOtp}
                  loading={busy}
                  disabled={busy || code.trim().length < 4}
                  size="lg"
                />
              </>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : (
          <View style={styles.form}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t("email")}
              placeholderTextColor={colors.textSoft}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t("password")}
              placeholderTextColor={colors.textSoft}
              secureTextEntry
              style={styles.input}
            />
            <Button
              title={t("loginEmail")}
              onPress={loginEmail}
              loading={busy}
              disabled={busy || !email.trim() || !password}
              size="lg"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
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
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
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
  codeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  codeInput: { flex: 1 },
  resend: { paddingVertical: 10 },
  resendText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
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
  footer: { fontSize: 12, color: colors.textSoft, textAlign: "center", marginTop: spacing.xl },
});
