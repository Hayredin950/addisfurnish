import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { isAdminQuery, submitReport } from "@/lib/marketplace";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const REASONS = [
  { value: "scam", labelKey: "report.reasonScam", labelEn: "Suspected scam or fraud" },
  {
    value: "misleading",
    labelKey: "report.reasonMisleading",
    labelEn: "Misleading photos or description",
  },
  {
    value: "unavailable",
    labelKey: "report.reasonUnavailable",
    labelEn: "Item is not actually available",
  },
  {
    value: "offensive",
    labelKey: "report.reasonOffensive",
    labelEn: "Offensive or abusive behaviour",
  },
  { value: "other", labelKey: "report.reasonOther", labelEn: "Other" },
] as const;

export function ReportDialog({
  listingId,
  sellerId,
  trigger,
}: {
  listingId?: string;
  sellerId?: string;
  trigger: React.ReactNode;
}) {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const { data: isAdmin } = useQuery(isAdminQuery(user?.id));
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) {
      setOpen(false);
      navigate({ to: "/auth" });
      return;
    }
    const selected = REASONS.find((r) => r.value === reason);
    if (!selected) return;
    setBusy(true);
    try {
      await submitReport({
        reporterId: user.id,
        // Store readable English text so moderators never see i18n keys.
        reason: selected.labelEn,
        details,
        listingId,
        reportedUserId: sellerId,
      });
      toast.success(t("toast.reportSent"));
      setOpen(false);
      setReason("");
      setDetails("");
    } catch {
      toast.error(t("toast.requestFailed"));
    } finally {
      setBusy(false);
    }
  };

  // Item 38: moderators resolve reports, so they may not author them — filing
  // one would put the same person on both sides of the case. Item 36: nobody
  // reports themselves. Both are enforced by the reports INSERT policy as well;
  // hiding the trigger just stops the UI from offering a dead action.
  if (isAdmin || (sellerId && sellerId === user?.id)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{listingId ? t("report.titleListing") : t("report.titleUser")}</DialogTitle>
          <DialogDescription>{t("toast.reportSent")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-reason">{t("report.reason")}</Label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("sell.select")}</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-details">{t("report.details")}</Label>
            <Textarea
              id="report-details"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("report.cancel")}
          </Button>
          <Button disabled={!reason || busy} onClick={submit}>
            {t("report.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
