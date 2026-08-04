import {
  Archive,
  Bed,
  Briefcase,
  Package,
  Sofa,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the `categories.icon` seed values to lucide components.
 *
 * Shared by the categories page and the homepage "shop by room" row so the two
 * can't drift apart.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  sofa: Sofa,
  bed: Bed,
  briefcase: Briefcase,
  utensils: UtensilsCrossed,
  trees: Trees,
  archive: Archive,
};

/** Falls back to a generic box for categories with no icon set. */
export function categoryIcon(icon: string | null | undefined): LucideIcon {
  return (icon ? CATEGORY_ICONS[icon] : undefined) ?? Package;
}
