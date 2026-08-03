import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function ShareButton({ variant = "outline" }: { variant?: "outline" | "ghost" }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    const title = document.title;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("toast.shared"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("toast.requestFailed"));
    }
  };

  return (
    <Button variant={variant} size="sm" onClick={share}>
      {copied ? <Check className="mr-1 h-4 w-4" /> : <Share2 className="mr-1 h-4 w-4" />}
      {t("listing.share")}
    </Button>
  );
}
