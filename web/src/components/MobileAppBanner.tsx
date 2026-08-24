import { useState } from "react";
import { Download, X } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "addishome-app-banner-dismissed";

/**
 * The button links to /api/latest-apk, which 302-redirects to the newest
 * finished Android build. With EXPO_TOKEN set (see web/.env.example) that
 * stays current forever; without it the route falls back to the latest
 * pinned APK. Google Play stays a placeholder until the store listing exists.
 */
const ANDROID_APK_URL = "/api/latest-apk";

/** Mobile app download banner. */
export function MobileAppBanner() {
  const { t } = useLang();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1",
  );

  if (dismissed) return null;

  return (
    <div className="border-b bg-gradient-to-r from-primary/10 via-secondary/50 to-primary/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3.5">
        {/* The real app logo — not a generic placeholder icon. */}
        <img
          src="/logo-mark.png"
          alt="AddisHome logo"
          className="h-10 w-10 shrink-0 rounded-lg object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("app.bannerTitle")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Not `disabled`: a disabled button swallows taps, so on a phone the
              store-isn't-live explanation (which lived only in `title`, i.e.
              hover-only) was unreachable. Clickable + a toast tells everyone. */}
          <Button size="sm" variant="outline" onClick={() => toast.info(t("app.playComingSoon"))}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> {t("app.googlePlay")}
          </Button>
          {/* Shown at every width. It used to be `hidden sm:inline-flex`, which
              hid the direct download on exactly the devices that can install
              it. */}
          <Button asChild size="sm">
            <a href={ANDROID_APK_URL} target="_blank" rel="noopener noreferrer">
              <Download className="mr-1.5 h-3.5 w-3.5" /> {t("app.androidApk")}
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
