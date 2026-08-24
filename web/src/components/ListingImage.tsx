import { useImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Sofa } from "lucide-react";

export function ListingImage({
  path,
  alt,
  className,
  eager = false,
  width = 600,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  eager?: boolean;
  /** Delivered pixel width. Cards don't need the 4 MB original. */
  width?: number;
}) {
  const { data: url } = useImageUrl(path, undefined, width);

  if (!url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-secondary text-muted-foreground",
          className,
        )}
      >
        <Sofa className="h-8 w-8" aria-hidden="true" />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      className={cn("object-cover", className)}
    />
  );
}
