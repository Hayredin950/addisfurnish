import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In or Create an Account — AddisHome" },
      {
        name: "description",
        content:
          "Sign in with your email or Google to message sellers, save favourites and post your own used furniture listings on AddisHome.",
      },
      { property: "og:title", content: "Sign In — AddisHome" },
      { property: "og:description", content: "Access your AddisHome buyer and seller tools." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  // Set after a signup that needs email confirmation, so we can offer a resend
  // — confirmation mail lands in spam often enough that a dead end here would
  // strand people who can't find it.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // 6-digit code entry for the {{ .Token }} in the confirmation email — typing
  // it (verifyOtp) is far more reliable than a magic-link tap, especially on
  // phones where the link often lands in spam.
  const [otpCode, setOtpCode] = useState("");
  // Password recovery. Steps through email → 6-digit code → new password,
  // mirroring the signup confirmation flow (the recovery email carries the
  // same {{ .Token }} code, verified with type: "recovery").
  const [resetStep, setResetStep] = useState<"hidden" | "email" | "otp" | "password">("hidden");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Signed-in users don't belong on /auth — but hold off while a reset flow is
  // mid-flight: verifyOtp (recovery) establishes a session the moment the code
  // is entered, and redirecting then would skip the new-password step.
  if (user && resetStep === "hidden" && !pendingEmail) {
    navigate({ to: "/", replace: true });
  }

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    toast.success(t("toast.welcomeBack"));
    navigate({ to: "/" });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    if (!data.session) {
      setPendingEmail(email);
      return;
    }
    navigate({ to: "/" });
  };

  const verifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEmail) return;
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: otpCode.trim(),
      type: "signup",
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    if (data.session) {
      toast.success(t("auth.otpVerified"));
      navigate({ to: "/" });
    }
  };

  const resendConfirmation = async () => {
    if (!pendingEmail) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: pendingEmail });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    toast.success(t("auth.confirmResent"));
  };

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    setResetStep("otp");
    toast.success(t("auth.resetSent"));
  };

  const verifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: resetEmail.trim(),
      token: resetOtp.trim(),
      type: "recovery",
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    if (data.session) {
      setResetStep("password");
    }
  };

  const saveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    toast.success(t("auth.resetDone"));
    navigate({ to: "/" });
  };

  const resendReset = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    toast.success(t("auth.resetSent"));
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error(t("err.generic"));
      return;
    }
    // The browser redirects to Google; the session is picked up on return via
    // the server-side auth middleware (cookie-based).
    navigate({ to: "/" });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">{t("auth.welcome")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

      {pendingEmail ? (
        <div className="mt-8 rounded-xl border bg-card p-5 shadow-soft">
          <p className="text-sm font-semibold">{t("auth.confirmSent")}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("auth.otpHint")}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {t("auth.otpSentTo", { email: pendingEmail })}
          </p>
          <form className="mt-4 space-y-3" onSubmit={verifyEmailOtp}>
            <Input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              required
            />
            <Button type="submit" className="w-full" disabled={busy || otpCode.trim().length < 6}>
              {t("auth.otpVerify")}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-muted-foreground">{t("auth.otpNoEmail")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            disabled={busy}
            onClick={resendConfirmation}
          >
            {t("auth.confirmResend")}
          </Button>
        </div>
      ) : resetStep !== "hidden" ? (
        <div className="mt-8 rounded-xl border bg-card p-5 shadow-soft">
          <p className="text-sm font-semibold">{t("auth.resetTitle")}</p>

          {resetStep === "email" && (
            <form className="mt-4 space-y-3" onSubmit={requestReset}>
              <p className="text-xs text-muted-foreground">{t("auth.resetHint")}</p>
              <div className="space-y-2">
                <Label htmlFor="reset-email">{t("auth.email")}</Label>
                <Input
                  id="reset-email"
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !resetEmail.trim()}>
                {t("auth.resetSend")}
              </Button>
            </form>
          )}

          {resetStep === "otp" && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t("auth.resetSentTo", { email: resetEmail })}
              </p>
              <form className="space-y-3" onSubmit={verifyResetOtp}>
                <Input
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  required
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || resetOtp.trim().length < 6}
                >
                  {t("auth.resetVerify")}
                </Button>
              </form>
              <p className="text-center text-xs text-muted-foreground">{t("auth.otpNoEmail")}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={busy}
                onClick={resendReset}
              >
                {t("auth.resetResend")}
              </Button>
            </div>
          )}

          {resetStep === "password" && (
            <form className="mt-4 space-y-3" onSubmit={saveNewPassword}>
              <div className="space-y-2">
                <Label htmlFor="new-password">{t("auth.resetNewPassword")}</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || newPassword.length < 6}>
                {t("auth.resetSave")}
              </Button>
            </form>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              setResetStep("hidden");
              setResetEmail("");
              setResetOtp("");
              setNewPassword("");
            }}
          >
            {t("auth.backToSignIn")}
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <Button variant="outline" className="w-full" onClick={google}>
              {t("auth.google")}
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> {t("auth.orEmailPass")}{" "}
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
              <TabsTrigger value="signup">{t("auth.createAccount")}</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="space-y-4 pt-4" onSubmit={signIn}>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      setResetEmail(email);
                      setResetStep("email");
                    }}
                  >
                    {t("auth.forgotPassword")}
                  </button>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {t("auth.signIn")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="space-y-4 pt-4" onSubmit={signUp}>
                <div className="space-y-2">
                  <Label htmlFor="name">{t("auth.fullName")}</Label>
                  <Input
                    id="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">{t("auth.email")}</Label>
                  <Input
                    id="email2"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">{t("auth.password")}</Label>
                  <Input
                    id="password2"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {t("auth.createAccount")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
