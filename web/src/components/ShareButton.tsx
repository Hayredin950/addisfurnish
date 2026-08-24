import { useState } from "react";
import { Check, Link2, MessageCircle, Send, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Shareable listing link (spec §4). Every share carries utm attribution so the
 * backend can measure Telegram / WhatsApp / other channels as acquisition
 * sources, and the share itself is recorded in `analytics_events`.
 *
 * The current path MUST be preserved. This previously read
 * `VITE_SITE_URL ?? origin + pathname`, and since VITE_SITE_URL is set in
 * production the `?? ` branch never ran — every shared listing collapsed to the
 * bare origin, so Telegram previewed the homepage (site logo, generic blurb)
 * instead of the listing.
 */
function shareUrl(source: string): string {
  const siteUrl = import.meta.env["VITE_SITE_URL"] as string | undefined;
  // Resolve the live path against the canonical origin when one is configured,
  // so the link is absolute *and* still points at this listing.
  const url = siteUrl
    ? new URL(window.location.pathname, siteUrl)
    : new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "share");
  return url.toString();
}

/** The listing id from the current path (/listing/<uuid>), if any. */
function listingIdFromPath(): string | null {
  const m = window.location.pathname.match(/\/listing\/([0-9a-f-]{36})/i);
  return m ? (m[1] ?? null) : null;
}

/** Record the share for the admin analytics view — never blocks the share. */
async function trackShare(source: string) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("analytics_events").insert({
      event_name: "listing_shared",
      user_id: data.user?.id ?? null,
      listing_id: listingIdFromPath(),
      source,
      medium: "share",
    });
  } catch {
    // analytics must never break a share
  }
}

export function ShareButton({ variant = "outline" }: { variant?: "outline" | "ghost" }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const copy = async (source: string) => {
    await navigator.clipboard.writeText(shareUrl(source));
    setCopied(true);
    toast.success(t("toast.shared"));
    setTimeout(() => setCopied(false), 2000);
    void trackShare(source);
  };

  /** Native share sheet where available; the fallback is the dropdown below. */
  const share = async () => {
    const source = "share";
    const url = shareUrl(source);
    const title = document.title;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        void trackShare(source);
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    await copy(source);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm">
          {copied ? <Check className="mr-1 h-4 w-4" /> : <Share2 className="mr-1 h-4 w-4" />}
          {t("listing.share")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            const url = encodeURIComponent(shareUrl("telegram"));
            const text = encodeURIComponent(document.title);
            window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
            void trackShare("telegram");
          }}
        >
          <Send className="mr-2 h-4 w-4" /> {t("share.telegram")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const text = encodeURIComponent(`${document.title} — ${shareUrl("whatsapp")}`);
            window.open(`https://wa.me/?text=${text}`, "_blank");
            void trackShare("whatsapp");
          }}
        >
          <MessageCircle className="mr-2 h-4 w-4" /> {t("share.whatsapp")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void copy("copy")}>
          <Link2 className="mr-2 h-4 w-4" /> {t("share.copyLink")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
