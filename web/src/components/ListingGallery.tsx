import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useImageUrl } from "@/lib/storage";
import { useLang } from "@/lib/i18n";
import { ListingImage } from "@/components/ListingImage";

type GalleryImage = { id: string; url: string; position: number };

/**
 * Full-screen photo viewer with zoom and pan.
 *
 * Deliberately not built on the shared Dialog: that component hardcodes a
 * max-width, padding and its own close button, all of which fight a
 * full-bleed lightbox.
 */
function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
  alt,
}: {
  images: GalleryImage[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  alt: string;
}) {
  const { t } = useLang();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const current = images[index];
  const resolved = useImageUrl(current?.url ?? null);

  // Reset the transform whenever the photo changes.
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [index]);

  const next = useCallback(
    () => onIndexChange((index + 1) % images.length),
    [index, images.length, onIndexChange],
  );
  const prev = useCallback(
    () => onIndexChange((index - 1 + images.length) % images.length),
    [index, images.length, onIndexChange],
  );

  // Keyboard: arrows to navigate, +/- to zoom, Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.5));
      else if (e.key === "-") setZoom((z) => Math.max(1, z - 0.5));
    };
    window.addEventListener("keydown", onKey);
    // Don't let the page scroll behind the overlay.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [next, prev, onClose]);

  const zoomed = zoom > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm tabular-nums">
          {t("listing.photoCounter", { index: index + 1, total: images.length })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            disabled={zoom <= 1}
            aria-label={t("listing.zoomOut")}
            className="rounded-full p-2 hover:bg-white/15 disabled:opacity-40"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
            disabled={zoom >= 4}
            aria-label={t("listing.zoomIn")}
            className="rounded-full p-2 hover:bg-white/15 disabled:opacity-40"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("listing.closeViewer")}
            className="rounded-full p-2 hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        // Click the backdrop to dismiss, but not while zoomed in (the user is
        // panning) and not when clicking the image itself.
        onClick={(e) => {
          if (e.target === e.currentTarget && !zoomed) onClose();
        }}
      >
        {resolved.data ? (
          <img
            src={resolved.data}
            alt={alt}
            draggable={false}
            onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
            style={{
              transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px)`,
              cursor: zoomed ? "grab" : "zoom-in",
            }}
            className="max-h-full max-w-full select-none object-contain transition-transform duration-150"
            onPointerDown={(e) => {
              if (!zoomed) {
                setZoom(2);
                return;
              }
              const startX = e.clientX;
              const startY = e.clientY;
              const from = { ...offset };
              const move = (ev: PointerEvent) => {
                setOffset({
                  x: from.x + (ev.clientX - startX) / zoom,
                  y: from.y + (ev.clientY - startY) / zoom,
                });
              };
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          />
        ) : (
          <div className="h-24 w-24 animate-pulse rounded-lg bg-white/10" />
        )}

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 rounded-full bg-black/50 p-2.5 text-white hover:bg-black/70"
              aria-label="Previous"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 rounded-full bg-black/50 p-2.5 text-white hover:bg-black/70"
              aria-label="Next"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto p-3">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onIndexChange(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded border-2 ${
                i === index ? "border-white" : "border-transparent opacity-60"
              }`}
            >
              <ListingImage path={img.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Listing photo gallery: a cover image with a thumbnail strip, and a
 * full-screen zoomable viewer on click.
 */
export function ListingGallery({ images, alt }: { images: GalleryImage[]; alt: string }) {
  const { t } = useLang();
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  if (images.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border bg-muted">
        <ListingImage path={null} alt={alt} className="aspect-4/3 w-full object-cover" />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-xl border bg-muted"
        aria-label={t("listing.viewFullSize")}
      >
        <ListingImage
          path={images[active]?.url ?? null}
          alt={alt}
          eager
          className="aspect-4/3 w-full object-cover"
        />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-3 w-3" /> {t("listing.viewFullSize")}
        </span>
        {images.length > 1 ? (
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] tabular-nums text-white">
            {t("listing.photoCounter", { index: active + 1, total: images.length })}
          </span>
        ) : null}
      </button>

      {images.length > 1 ? (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              onDoubleClick={() => setOpen(true)}
              className={`h-20 w-20 shrink-0 overflow-hidden rounded-md border ${
                i === active ? "ring-2 ring-primary" : ""
              }`}
            >
              <ListingImage
                path={img.url}
                alt={`${alt} ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <Lightbox
          images={images}
          index={active}
          onIndexChange={setActive}
          onClose={() => setOpen(false)}
          alt={alt}
        />
      ) : null}
    </>
  );
}
