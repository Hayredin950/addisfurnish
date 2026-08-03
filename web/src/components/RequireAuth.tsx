import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useLang();

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm text-muted-foreground">
        {t("browse.loading")}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">{t("req.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("req.body")}</p>
        <Button asChild className="mt-6">
          <Link to="/auth">{t("req.cta")}</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
