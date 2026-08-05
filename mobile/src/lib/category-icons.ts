import type { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Maps the `categories.icon` seed values to Ionicons names.
 *
 * The column stores lucide names ('sofa', 'bed', …) because the web app renders
 * them with lucide-react. Mobile has no lucide, so it translates the same keys
 * to the nearest Ionicons glyph — keep this table in step with
 * web/src/lib/category-icons.ts so the two apps show the same thing.
 *
 * Rendering `icon` directly in a <Text> (what mobile did before) printed the
 * literal word "sofa", or nothing at all for the sub-categories where the
 * column is null.
 */
const CATEGORY_ICONS: Record<string, IoniconName> = {
  sofa: "bed-outline",
  bed: "bed-outline",
  briefcase: "briefcase-outline",
  utensils: "restaurant-outline",
  trees: "leaf-outline",
  archive: "archive-outline",
};

/** Falls back to a generic box, matching web's Package fallback. */
export function categoryIcon(icon: string | null | undefined): IoniconName {
  return (icon ? CATEGORY_ICONS[icon] : undefined) ?? "cube-outline";
}
