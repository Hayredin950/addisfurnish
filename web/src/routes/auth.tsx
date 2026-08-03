import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { requestAuthOtp, verifyAuthOtp, rotateAuthPassword } from "@/lib/otp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In or Create an Account — SuqBet" },
      {
        name: "description",
        content:
          "Sign in with your phone number (OTP), email or Google to message sellers, save favourites and post your own used furniture listings on SuqBet.",
      },
      { property: "og:title", content: "Sign In — SuqBet" },
      { property: "og:description", content: "Access your SuqBet buyer and seller tools." },
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

  // Phone OTP state
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);

  if (user) {
    navigate({ to: "/dashboard", replace: true });
  }

  const sendOtp = async () => {
    setOtpBusy(true);
    const res = await requestAuthOtp({ data: { phone } });
    setOtpBusy(false);
    if (res.ok) {
      setOtpSent(true);
      setOtpDevCode(res.dev ? (res.devCode ?? null) : null);
    } else if (res.error === "invalid_phone") {
      toast.error(t("otp.invalidPhone"));
    } else if (res.error === "rate_limited") {
      toast.error(t("otp.rateLimited"));
    } else {
      toast.error(t("toast.requestFailed"));
    }
  };

  const verifyOtp = async () => {
    setOtpBusy(true);
    const res = await verifyAuthOtp({ data: { phone, code } });
    if (!res.ok) {
      setOtpBusy(false);
      if (res.error === "wrong_code") toast.error(t("otp.wrongCode"));
      else if (res.error === "expired") toast.error(t("otp.expired"));
      else if (res.error === "too_many") toast.error(t("otp.tooMany"));
      else if (res.error === "no_code") toast.error(t("otp.sendFirst"));
      else toast.error(t("toast.requestFailed"));
      return;
    }
    // One-time password exchange → real session.
    const { error } = await supabase.auth.signInWithPassword({
      phone: res.phone,
      password: res.password,
    });
    setOtpBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Invalidate the one-time password so the code can't be replayed.
    void rotateAuthPassword({ data: { phone: res.phone } });
    toast.success(res.isNew ? t("auth.welcomeNew") : t("toast.welcomeBack"));
    navigate({ to: "/dashboard" });
  };

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
      toast.success(t("toast.checkEmail"));
      return;
    }
    navigate({ to: "/dashboard" });
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

      {/* Phone-first passwordless sign in / register */}
      <div className="mt-8 rounded-xl border bg-card p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="h-4 w-4 text-primary" /> {t("auth.phoneTitle")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("auth.phoneHint")}</p>
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xx xxx xxx"
              inputMode="tel"
              disabled={otpSent}
            />
            <Button
              type="button"
              variant={otpSent ? "ghost" : "default"}
              disabled={otpBusy || phone.trim().length < 9}
              onClick={otpSent ? () => setOtpSent(false) : sendOtp}
            >
              {otpSent ? t("auth.changeNumber") : t("otp.send")}
            </Button>
          </div>
          {otpSent ? (
            <div className="space-y-2">
              {otpDevCode ? (
                <p className="text-xs text-muted-foreground">
                  Dev mode (no SMS provider configured) — your code is{" "}
                  <strong className="text-foreground">{otpDevCode}</strong>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("otp.codeSentShort")}</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("otp.placeholder")}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                />
                <Button type="button" disabled={otpBusy || code.length !== 6} onClick={verifyOtp}>
                  {t("auth.verifyContinue")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> {t("auth.orEmail")}{" "}
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" className="w-full" onClick={google}>
        {t("auth.google")}
      </Button>

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
    </div>
  );
}
