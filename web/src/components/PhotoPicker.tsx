import { useEffect, useState } from "react";
import { ImagePlus, Star, Trash2, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useImageUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_PHOTOS = 10;

/** One already-uploaded photo, shown when editing an existing listing. */
export type ExistingPhoto = { id: string; url: string; position: number };

function ExistingThumb({
  photo,
  isCover,
  onRemove,
  onMakeCover,
}: {
  photo: ExistingPhoto;
  isCover: boolean;
  onRemove: () => void;
  onMakeCover: () => void;
}) {
  const { t } = useLang();
  const resolved = useImageUrl(photo.url);
  return (
    <li className="relative h-24 w-24 overflow-hidden rounded-md border bg-secondary">
      {resolved.data ? (
        <img src={resolved.data} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" />
      )}
      {isCover ? (
        <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
          {t("sell.coverPhoto")}
        </span>
      ) : (
        <button
          type="button"
          onClick={onMakeCover}
          title={t("sell.coverPhoto")}
          className="absolute left-1 top-1 rounded bg-black/60 p-1 text-white hover:bg-black/80"
        >
          <Star className="h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("sell.removePhoto")}
        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-destructive"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}

/**
 * Photo picker with thumbnails.
 *
 * Appends to the current selection rather than replacing it (a bare
 * `<input multiple>` discards the previous batch on every pick), and lets the
 * seller drop individual photos or promote one to cover before publishing.
 */
export function PhotoPicker({
  files,
  onFilesChange,
  existing = [],
  onRemoveExisting,
  onReorderExisting,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  existing?: ExistingPhoto[];
  onRemoveExisting?: (id: string) => void;
  onReorderExisting?: (id: string) => void;
}) {
  const { t } = useLang();
  const [previews, setPreviews] = useState<string[]>([]);

  // Object URLs must be revoked or the blobs leak for the page's lifetime.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const total = existing.length + files.length;
  const room = Math.max(0, MAX_PHOTOS - total);

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const accepted = Array.from(picked)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room);
    if (accepted.length) onFilesChange([...files, ...accepted]);
  };

  const removeAt = (index: number) => onFilesChange(files.filter((_, i) => i !== index));

  const promote = (index: number) => {
    const next = [...files];
    const [picked] = next.splice(index, 1);
    if (picked) onFilesChange([picked, ...next]);
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="photos">{t("sell.photos")}</Label>

      {existing.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t("sell.currentPhotos")}</p>
          <ul className="flex flex-wrap gap-2">
            {existing.map((photo, i) => (
              <ExistingThumb
                key={photo.id}
                photo={photo}
                isCover={i === 0 && files.length === 0}
                onRemove={() => onRemoveExisting?.(photo.id)}
                onMakeCover={() => onReorderExisting?.(photo.id)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.lastModified}-${i}`}
              className="relative h-24 w-24 overflow-hidden rounded-md border bg-secondary"
            >
              {previews[i] ? (
                <img src={previews[i]} alt={file.name} className="h-full w-full object-cover" />
              ) : null}
              {i === 0 && existing.length === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  {t("sell.coverPhoto")}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => promote(i)}
                  title={t("sell.coverPhoto")}
                  className="absolute left-1 top-1 rounded bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <Star className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={t("sell.removePhoto")}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" disabled={room === 0}>
          <label htmlFor="photos" className="cursor-pointer">
            <ImagePlus className="mr-1.5 h-4 w-4" />
            {t("sell.addPhotos")}
          </label>
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("sell.photosSelected", { count: total })}
        </span>
      </div>

      <Input
        id="photos"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={room === 0}
        onChange={(e) => {
          addFiles(e.target.files);
          // Reset so picking the same file again still fires onChange.
          e.target.value = "";
        }}
      />
      <p className="text-xs text-muted-foreground">{t("sell.photoHint")}</p>
    </div>
  );
}
