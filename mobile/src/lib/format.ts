/** Formatting helpers shared across the mobile app (mirrors the web lib). */

export function formatBirr(value: number | null | undefined): string {
  if (value == null) return "—";
  return `ETB ${value.toLocaleString("en-ET", { maximumFractionDigits: 0 })}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const ETHIOPIC_EPOCH_JDN = 1724221; // JDN of 1 Meskerem 1 EC

const ETHIOPIC_MONTHS = [
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
];

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

/**
 * Gregorian → Ethiopian calendar date (day, month, year). Verified against
 * 2 Aug 2026 = 26 Hamle 2018 and 11 Sep 2005 = 1 Meskerem 1998.
 */
export function ethiopianDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";

  const jdn = gregorianToJdn(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const diff = jdn - ETHIOPIC_EPOCH_JDN;
  const cycles = Math.floor(diff / 1461); // 4-year leap cycle
  const rem = diff % 1461;
  const yearInCycle = Math.min(3, Math.floor(rem / 365));
  const dayInYear = rem - 365 * yearInCycle;
  const month = Math.min(12, Math.floor(dayInYear / 30)); // 12 = Pagume
  const day = dayInYear - Math.min(month, 12) * 30 + 1;

  return `${day} ${ETHIOPIC_MONTHS[month]} ${4 * cycles + yearInCycle + 1} ዓ/ም`;
}

const EARTH_RADIUS_KM = 6371;

/** Haversine distance in kilometres between two coordinates. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Normalizes an Ethiopian phone number to +251 format, or null. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9 && /^[79]/.test(digits)) return `+251${digits}`;
  if (digits.length === 10 && digits.startsWith("0") && /^09|^07/.test(digits))
    return `+251${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("251")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("251")) return `+${digits}`;
  return null;
}

/** Rough sub-city coordinates for Addis Ababa (used to seed demo listings + map). */
export const ADDIS_SUBCITY_COORDS: Record<string, [number, number]> = {
  Bole: [8.9903, 38.7877],
  Yeka: [9.0307, 38.7745],
  Arada: [9.0222, 38.7469],
  Kirkos: [9.0115, 38.7639],
  Lideta: [9.0019, 38.7353],
  "Addis Ketema": [9.0302, 38.7364],
  "Nifas Silk-Lafto": [8.9701, 38.7162],
  "Kolfe Keranio": [9.0106, 38.6991],
  Gulele: [9.0477, 38.7243],
  "Akaki Kality": [8.8683, 38.7906],
  "Lemi Kura": [9.0357, 38.7918],
};

export function coordsForSubCity(subCity: string | null): [number, number] | null {
  if (!subCity) return null;
  return ADDIS_SUBCITY_COORDS[subCity] ?? null;
}
