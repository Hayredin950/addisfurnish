import {
  Archive,
  Bed,
  Briefcase,
  Library,
  Lightbulb,
  Package,
  Shirt,
  Sofa,
  Trees,
  Tv,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the `categories.icon` seed values to lucide components.
 *
 * Shared by the categories page, the homepage "shop by room" row and the
 * admin category manager so the three can't drift apart. Keep this set in
 * step with mobile/src/lib/category-icons.ts — every key must exist in both
 * lucide-react (web) and the Ionicons glyphmap (mobile).
 */
export const CATEGORY_ICON_KEYS = [
  "sofa",
  "bed",
  "briefcase",
  "utensils",
  "trees",
  "archive",
  "tv",
  "lamp",
  "wardrobe",
  "bookshelf",
] as const;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  sofa: Sofa,
  bed: Bed,
  briefcase: Briefcase,
  utensils: UtensilsCrossed,
  trees: Trees,
  archive: Archive,
  tv: Tv,
  lamp: Lightbulb,
  wardrobe: Shirt,
  bookshelf: Library,
};

/** Falls back to a generic box for categories with no icon set. */
export function categoryIcon(icon: string | null | undefined): LucideIcon {
  return (icon ? CATEGORY_ICONS[icon] : undefined) ?? Package;
}
