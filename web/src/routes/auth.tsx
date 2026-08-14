import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In or Create an Account — AddisFurnish" },
      {
        name: "description",
        content:
          "Sign in with your email or Google to message sellers, save favourites and post your own used furniture listings on AddisFurnish.",
      },
      { property: "og:title", content: "Sign In — AddisFurnish" },
      { property: "og:description", content: "Access your AddisFurnish buyer and seller tools." },
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

  if (user) {
    navigate({ to: "/dashboard", replace: true });
  }

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("toast.welcomeBack"));
    navigate({ to: "/dashboard" });
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
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setPendingEmail(email);
      return;
    }
    navigate({ to: "/dashboard" });
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
      toast.error(error.message);
      return;
    }
    if (data.session) {
      toast.success(t("auth.otpVerified"));
      navigate({ to: "/dashboard" });
    }
  };

  const resendConfirmation = async () => {
    if (!pendingEmail) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: pendingEmail });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.confirmResent"));
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error("Google sign-in failed");
      return;
    }
    // The browser redirects to Google; the session is picked up on return via
    // the server-side auth middleware (cookie-based).
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">{t("auth.welcome")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

      {pendingEmail ? (
        <div className="mt-8 rounded-xl border bg-card p-5 shadow-soft">
          <p className="text-sm font-semibold">{t("auth.confirmSent")}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("auth.otpHint")}</p>
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
