import { useState } from "react";
import { Ban } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Preset lengths, in hours. "Permanent" is a century — GoTrue has no infinity. */
const DURATIONS = [
  { key: "admin.banHours24", hours: 24 },
  { key: "admin.banDays7", hours: 24 * 7 },
  { key: "admin.banDays30", hours: 24 * 30 },
  { key: "admin.banPermanent", hours: 24 * 365 * 100 },
] as const;

/**
 * Suspension dialog: pick a duration and an optional reason.
 *
 * Kept separate from the admin page so both the sellers and users tabs use the
 * same flow rather than each hardcoding 24 hours.
 */
export function BanDialog({
  open,
  onOpenChange,
  onConfirm,
  subjectName,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (hours: number, reason: string) => void;
  subjectName: string;
  pending?: boolean;
}) {
  const { t } = useLang();
  const [hours, setHours] = useState<number>(24);
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.banTitle")}</DialogTitle>
          <DialogDescription>
            {subjectName} — {t("admin.banBody")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("admin.banDuration")}</Label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <Button
                  key={d.key}
                  type="button"
                  size="sm"
                  variant={hours === d.hours ? "default" : "outline"}
                  onClick={() => setHours(d.hours)}
                >
                  {t(d.key)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ban-reason">{t("admin.banReason")}</Label>
            <Input
              id="ban-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("report.reason")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("action.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => onConfirm(hours, reason.trim())}
          >
            <Ban className="mr-1.5 h-4 w-4" />
            {t("admin.banConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
