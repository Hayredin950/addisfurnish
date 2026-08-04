import { useImageUrl } from "@/lib/storage";

/** Initials fallback — "Abebe Bikila" → "AB". */
function initials(name: string | null | undefined) {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Round avatar for a marketplace participant. Falls back to initials when the
 * profile has no picture, so a sender is always identifiable.
 *
 * Pass the shop logo for sellers and `avatar_url` for individuals — both live
 * in the `listing-images` bucket.
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = 32,
  className = "",
}: {
  name: string | null | undefined;
  avatarUrl: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const resolved = useImageUrl(avatarUrl ?? null);
  const dimension = { width: size, height: size };

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-medium text-muted-foreground ${className}`}
      style={dimension}
      title={name ?? undefined}
    >
      {resolved.data ? (
        <img
          src={resolved.data}
          alt={name ?? "User"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
