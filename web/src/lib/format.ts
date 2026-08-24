export function formatBirr(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return (
    new Intl.NumberFormat("en-ET", {
      maximumFractionDigits: 0,
    }).format(n) + " ETB"
  );
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

/** ── Ethiopian calendar (12×30 + Pagume; epoch 29 Aug 8 CE) ────────────── */
const ETHIOPIC_EPOCH_JDN = 1724221; // JDN of 1 Meskerem 1 EC

/** Meeus-style Gregorian → Julian Day Number (integer division). */
function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const Y = y + 4800 - a;
  const M = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * M + 2) / 5) +
    365 * Y +
    Math.floor(Y / 4) -
    Math.floor(Y / 100) +
    Math.floor(Y / 400) -
    32045
  );
}

export function toEthiopianDate(date: Date): { day: number; month: number; year: number } {
  const jdn = gregorianToJdn(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const diff = jdn - ETHIOPIC_EPOCH_JDN;
  const cycles = Math.floor(diff / 1461); // 4-year leap cycle
  const rem = diff % 1461;
  const yearInCycle = Math.min(3, Math.floor(rem / 365));
  const dayInYear = rem - 365 * yearInCycle;
  const month = Math.min(12, Math.floor(dayInYear / 30)); // 12 = Pagume
  const day = dayInYear - Math.min(month, 12) * 30 + 1;
  return { day, month: month + 1, year: 4 * cycles + yearInCycle + 1 };
}

const ETHIOPIAN_MONTHS_EN = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miazia",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagume",
] as const;

const ETHIOPIAN_MONTHS_AM = [
  "መስከረም",
  "ጥቅምት",
  "ኅዳር",
  "ታኅሣሥ",
  "ጥር",
  "የካቲት",
  "መጋቢት",
  "ሚያዝያ",
  "ግንቦት",
  "ሰኔ",
  "ሐምሌ",
  "ነሐሴ",
  "ጳጉሜ",
] as const;

/** Formats a date in the Ethiopian calendar, e.g. "26 Hamle 2018 (EC)". */
export function formatEthiopianDate(iso: string, lang: "en" | "am"): string {
  const e = toEthiopianDate(new Date(iso));
  const months = lang === "am" ? ETHIOPIAN_MONTHS_AM : ETHIOPIAN_MONTHS_EN;
  return `${e.day} ${months[e.month - 1] ?? months[12]} ${e.year} (EC)`;
}

/** ── Geo helpers (nearest sort, map pin) ─────────────────────────────── */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Approximate coordinates for common Addis Ababa sub-cities (for the map pin). */
export const SUB_CITY_COORDS: Record<string, { latitude: number; longitude: number }> = {
  Bole: { latitude: 9.0149, longitude: 38.7869 },
  Piassa: { latitude: 9.0305, longitude: 38.7456 },
  Kazanchis: { latitude: 9.0085, longitude: 38.7641 },
  Gerji: { latitude: 9.0196, longitude: 38.8438 },
  Sarbet: { latitude: 9.0008, longitude: 38.7542 },
  Megenagna: { latitude: 9.0246, longitude: 38.8004 },
  "Bole Road": { latitude: 9.008, longitude: 38.789 },
  Merkato: { latitude: 9.0309, longitude: 38.7413 },
  Yeka: { latitude: 9.0196, longitude: 38.8438 },
  "Addis Ababa": { latitude: 9.03, longitude: 38.74 },
};

export const CONDITIONS = ["like new", "good", "fair", "needs repair"] as const;
/**
 * Browse's material filter. Must stay a superset of the seeded `material`
 * attribute options, or a seller can pick a material on the sell form that no
 * buyer can then filter by — `marble` and `rattan` were exactly that gap.
 * `mesh` has no seeded option but predates the attribute table, so listings
 * still carry it.
 */
export const MATERIALS = [
  "wood",
  "leather",
  "fabric",
  "metal",
  "glass",
  "marble",
  "rattan",
  "mesh",
  "plastic",
] as const;
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

export type CategoryNameSource = { name: string; name_am: string | null } | null | undefined;

/** Returns the category name in the active language, falling back to English. */
export function categoryName(cat: CategoryNameSource, lang: "en" | "am"): string {
  if (!cat) return "";
  return lang === "am" ? (cat.name_am ?? cat.name) : cat.name;
}

/** True if the seller's last-seen heartbeat is within 5 minutes. */
export function isOnlineNow(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}
