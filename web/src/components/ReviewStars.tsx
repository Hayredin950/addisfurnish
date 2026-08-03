import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only star rating (1–5). */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${value} / 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

/** Interactive star picker for submitting a rating. */
export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          onClick={() => onChange(i)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              "h-5 w-5",
              i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </span>
  );
}
