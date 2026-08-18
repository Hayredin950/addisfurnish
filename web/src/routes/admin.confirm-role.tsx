import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Public route — reached from the one-time emailed link after an admin
 * clicks "Make admin" or "Remove admin" in the Users tab. The token is
 * the credential (possession of the email link IS the verification),
 * so no login is required.
 */
export const Route = createFileRoute("/admin/confirm-role")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  head: () => ({
    meta: [
      { title: "Confirm admin change — AddisFurnish" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmRolePage,
});

function ConfirmRolePage() {
  const { token } = Route.useSearch();
  const { t } = useLang();
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [result, setResult] = useState<{
    ok: boolean;
    error?: string;
    action?: string;
    name?: string;
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setResult({ ok: false, error: "invalid" });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("admin_confirm_role_change", {
        _token: token,
      });
      if (cancelled) return;
      if (error || !data) {
        setState("error");
        setResult({ ok: false, error: "invalid" });
        return;
      }
      const r = data as {
        ok: boolean;
        error?: string;
        action?: string;
        name?: string;
      };
      setResult(r);
      setState(r.ok ? "done" : "error");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const iconName = (action?: string) =>
    action === "promote" ? CheckCircle2 : XCircle;
  const Icon = iconName(result?.action);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-24 text-center">
      {state === "loading" ? (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <h1 className="mt-4 font-display text-2xl font-semibold">
            {t("admin.confirmTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("browse.loading")}
          </p>
        </>
      ) : state === "done" ? (
        <>
          <Icon className="h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 font-display text-2xl font-semibold">
            {t("admin.confirmTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {result?.action === "promote"
              ? t("admin.confirmPromoteDone", {
                  name: result?.name ?? "",
                })
              : t("admin.confirmDemoteDone", {
                  name: result?.name ?? "",
                })}
          </p>
        </>
      ) : (
        <>
          <ShieldCheck className="h-12 w-12 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-semibold">
            {t("admin.confirmTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {result?.error === "expired"
              ? t("admin.confirmExpired")
              : result?.error === "used"
                ? t("admin.confirmUsed")
                : result?.error === "super_admin"
                  ? t("admin.confirmSuperAdmin")
                  : t("admin.confirmInvalid")}
          </p>
        </>
      )}

      <Button asChild variant="outline" className="mt-8">
        <Link to="/admin">{t("admin.confirmBack")}</Link>
      </Button>
    </div>
  );
}
