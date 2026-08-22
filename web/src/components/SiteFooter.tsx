import { Link } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";

export function SiteFooter() {
  const { t } = useLang();

  return (
    <footer className="mt-20 border-t bg-secondary/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg font-semibold">
            Addis<span className="text-primary">Home</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div className="text-sm">
          <p className="font-medium">{t("footer.marketplace")}</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li>
              <Link to="/browse">{t("footer.browseAll")}</Link>
            </li>
            <li>
              <Link to="/categories">{t("nav.categories")}</Link>
            </li>
            <li>
              <Link to="/sell">{t("nav.postItem")}</Link>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-medium">{t("footer.trust")}</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li>
              <Link to="/safety">{t("footer.safetyGuidelines")}</Link>
            </li>
            <li>
              <Link to="/auth">{t("footer.createAccount")}</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t py-5 text-center text-xs text-muted-foreground">
        {t("footer.pricesNote")}
      </div>
    </footer>
  );
}
