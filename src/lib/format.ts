export function formatBirr(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("en-ET", {
    maximumFractionDigits: 0,
  }).format(n) + " ETB";
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const CONDITIONS = ["like new", "good", "fair", "needs repair"] as const;
export const MATERIALS = ["wood", "leather", "fabric", "metal", "glass", "mesh", "plastic"] as const;
export const ROOM_TYPES = ["Living Room", "Bedroom", "Office", "Kitchen", "Outdoor"] as const;
export const CITIES = [
  "Addis Ababa",
  "Adama",
  "Bahir Dar",
  "Hawassa",
  "Mekelle",
  "Dire Dawa",
  "Gondar",
] as const;
export const STATUSES = ["active", "reserved", "sold"] as const;
