import { useState } from "react";
import { AppWindow, Download, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "suqbet-app-banner-dismissed";

/** Mobile app download banner (spec §10). Links are placeholders until the app ships. */
export function MobileAppBanner() {
  const { t } = useLang();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1",
  );

  if (dismissed) return null;

  return (
    <div className="border-b bg-gradient-to-r from-primary/10 via-secondary/50 to-primary/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3.5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <AppWindow className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">SuqBet App</p>
          <p className="truncate text-xs text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href="https://play.google.com/store" target="_blank" rel="noopener noreferrer">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Google Play
            </a>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <a href="#" onClick={(e) => e.preventDefault()}>
              Android APK
            </a>
          </Button>
          <button
            type="button"
            aria-label={t("report.cancel")}
            onClick={() => {
              setDismissed(true);
              window.localStorage.setItem(DISMISS_KEY, "1");
            }}
            className="ml-1 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
