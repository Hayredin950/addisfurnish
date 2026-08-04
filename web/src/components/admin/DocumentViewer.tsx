import { ExternalLink, FileText } from "lucide-react";
import { useImageUrl } from "@/lib/storage";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Viewer for an uploaded ID / business licence.
 *
 * The `verification-docs` bucket is private, so the file is fetched through a
 * signed URL (admins are allowed to read it by the "verif docs admin read"
 * policy). PDFs render in an iframe; images render inline.
 */
export function DocumentViewer({
  open,
  onOpenChange,
  filePath,
  sellerName,
  documentType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string | null;
  sellerName: string;
  documentType: string;
}) {
  const { t } = useLang();
  const resolved = useImageUrl(open ? filePath : null, "verification-docs");
  const isPdf = (filePath ?? "").toLowerCase().endsWith(".pdf");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("admin.documentTitle")}</DialogTitle>
          <DialogDescription>
            {sellerName} — {documentType.replace(/_/g, " ")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-auto rounded-lg border bg-muted">
          {resolved.isLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              {t("browse.loading")}
            </div>
          ) : resolved.data ? (
            isPdf ? (
              <iframe
                src={resolved.data}
                title={t("admin.documentTitle")}
                className="h-[70vh] w-full border-0"
              />
            ) : (
              <img src={resolved.data} alt={t("admin.documentTitle")} className="w-full" />
            )
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-8 w-8" />
              {t("admin.documentMissing")}
            </div>
          )}
        </div>

        {resolved.data ? (
          <Button asChild variant="outline" size="sm" className="self-start">
            <a href={resolved.data} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              {t("admin.openOriginal")}
            </a>
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
