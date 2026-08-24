import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AttributeOption = {
  id: string;
  attribute_id: string;
  value: string;
  label: string;
  label_am: string | null;
  sort_order: number;
  is_active: boolean;
};

/** One row of the `category_attribute_set` RPC (self + ancestors, deepest wins). */
export type CategoryAttributeDef = {
  attribute_id: string;
  slug: string;
  name: string;
  name_am: string | null;
  type: "text" | "number" | "boolean" | "single_select" | "multi_select" | "range";
  unit: string | null;
  is_required: boolean;
  is_filterable: boolean;
  sort_order: number;
  from_level: number;
  /** Active options for select types; empty for text/number/boolean. */
  options: AttributeOption[];
};

export type ListingAttributeValueRow = {
  attribute_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  option_id: string | null;
};

/**
 * Swatch colours for the `color` attribute's options (spec §10), keyed by the
 * option's `value`. A value with no entry here still renders — it just gets a
 * neutral chip — so an admin adding "teal" tomorrow doesn't break the picker.
 */
export const COLOR_SWATCHES: Record<string, string> = {
  black: "#111111",
  white: "#ffffff",
  grey: "#9ca3af",
  gray: "#9ca3af",
  silver: "#d4d4d8",
  brown: "#8b5a2b",
  beige: "#e8d9c0",
  cream: "#f5efe0",
  ivory: "#fffff0",
  red: "#dc2626",
  maroon: "#7f1d1d",
  orange: "#ea580c",
  yellow: "#eab308",
  gold: "#d4af37",
  green: "#16a34a",
  blue: "#2563eb",
  navy: "#1e3a8a",
  purple: "#7e22ce",
  pink: "#ec4899",
  wood: "#a9764a",
  // Rendered as a conic gradient by the picker rather than a flat fill.
  multicolor: "multi",
};

/** Attributes that also live as a column on `listings` (browse filters read those). */
export const NATIVE_FACET_SLUGS = ["material", "color", "brand"] as const;
export type NativeFacetSlug = (typeof NATIVE_FACET_SLUGS)[number];

/**
 * Attribute definitions configured for a category (spec §14/§15), resolved
 * through the `category_attribute_set` RPC so attributes attached at a parent
 * category are inherited. Options are fetched in a second call and merged in.
 * Loaded live so admin changes reach the form without a rebuild.
 */
export const categoryAttributesQuery = (categoryId: string | null | undefined) =>
  queryOptions({
    queryKey: ["category-attributes", categoryId],
    enabled: !!categoryId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("category_attribute_set", {
        _category_id: categoryId!,
      });
      if (error) throw error;
      const defs = (data ?? []) as Omit<CategoryAttributeDef, "options">[];
      if (!defs.length) return [] as CategoryAttributeDef[];

      const { data: opts, error: optError } = await supabase
        .from("attribute_options")
        .select("id,attribute_id,value,label,label_am,sort_order,is_active")
        .in(
          "attribute_id",
          defs
            .filter((d) => d.type === "single_select" || d.type === "multi_select")
            .map((d) => d.attribute_id),
        )
        .eq("is_active", true)
        .order("sort_order");
      if (optError) throw optError;

      const byAttr = new Map<string, AttributeOption[]>();
      for (const o of (opts ?? []) as AttributeOption[]) {
        byAttr.set(o.attribute_id, [...(byAttr.get(o.attribute_id) ?? []), o]);
      }
      return defs.map((d) => ({ ...d, options: byAttr.get(d.attribute_id) ?? [] }));
    },
  });

/** Existing seller-provided values for a listing (edit mode prefill). */
export async function fetchListingAttributeValues(
  listingId: string,
): Promise<ListingAttributeValueRow[]> {
  const { data, error } = await supabase
    .from("listing_attribute_values")
    .select("attribute_id,value_text,value_number,value_boolean,option_id")
    .eq("listing_id", listingId);
  if (error) throw error;
  return (data ?? []) as ListingAttributeValueRow[];
}

/**
 * Persist the seller's attribute values for a listing (spec §11).
 * Replaces the values of every attribute in `defs`; attributes left empty are
 * simply absent — the backend enforces required ones at publish time.
 */
export async function saveListingAttributeValues(
  listingId: string,
  defs: CategoryAttributeDef[],
  rows: ListingAttributeValueRow[],
): Promise<void> {
  if (!defs.length) return;
  const defIds = defs.map((d) => d.attribute_id);
  const { error: delError } = await supabase
    .from("listing_attribute_values")
    .delete()
    .eq("listing_id", listingId)
    .in("attribute_id", defIds);
  if (delError) throw delError;

  if (!rows.length) return;
  const { error: insError } = await supabase
    .from("listing_attribute_values")
    .insert(rows.map((v) => ({ ...v, listing_id: listingId })));
  if (insError) throw insError;
}

/**
 * Read the dynamic attribute inputs (`attr_<attribute-id>` fields) out of a
 * submitted form and map them to typed value rows per attribute type.
 * `range` behaves like number here; the backend validates the pairing.
 *
 * A `single_select` may also carry a free-text companion field
 * (`attr_<id>_text`) — the colour picker uses it so a seller can type "Walnut"
 * when none of the swatches fit. A picked option wins; the text is the
 * fallback, stored as `value_text`.
 */
export function collectAttributeValues(
  form: FormData,
  defs: CategoryAttributeDef[],
): {
  rows: ListingAttributeValueRow[];
  missingRequired: CategoryAttributeDef[];
} {
  const rows: ListingAttributeValueRow[] = [];
  const missingRequired: CategoryAttributeDef[] = [];
  for (const def of defs) {
    const raw = form.getAll(`attr_${def.attribute_id}`).map(String);
    const filled = raw.filter((v) => v !== "");
    const freeText = String(form.get(`attr_${def.attribute_id}_text`) ?? "").trim();
    let row: ListingAttributeValueRow | null = null;
    if (def.type === "text") {
      if (filled[0])
        row = {
          attribute_id: def.attribute_id,
          value_text: filled[0].trim(),
          value_number: null,
          value_boolean: null,
          option_id: null,
        };
    } else if (def.type === "number" || def.type === "range") {
      if (filled[0] && !Number.isNaN(Number(filled[0])))
        row = {
          attribute_id: def.attribute_id,
          value_text: null,
          value_number: Number(filled[0]),
          value_boolean: null,
          option_id: null,
        };
    } else if (def.type === "boolean") {
      // Checkbox submits "on" when ticked; absent means false.
      row = {
        attribute_id: def.attribute_id,
        value_text: null,
        value_number: null,
        value_boolean: raw.includes("on"),
        option_id: null,
      };
    } else if (def.type === "single_select") {
      if (filled[0])
        row = {
          attribute_id: def.attribute_id,
          value_text: null,
          value_number: null,
          value_boolean: null,
          option_id: filled[0],
        };
      else if (freeText)
        row = {
          attribute_id: def.attribute_id,
          value_text: freeText,
          value_number: null,
          value_boolean: null,
          option_id: null,
        };
    } else if (def.type === "multi_select") {
      // One row per chosen option.
      for (const optId of filled) {
        rows.push({
          attribute_id: def.attribute_id,
          value_text: null,
          value_number: null,
          value_boolean: null,
          option_id: optId,
        });
      }
    }
    if (row) rows.push(row);
    if (def.is_required) {
      const hasValue =
        def.type === "multi_select"
          ? filled.length > 0
          : def.type === "boolean"
            ? true // booleans always carry a value (ticked or not)
            : !!row;
      if (!hasValue) missingRequired.push(def);
    }
  }
  return { rows, missingRequired };
}

/**
 * The `listings.material` / `.color` / `.brand` columns, derived from the
 * dynamic values the seller just entered.
 *
 * Those three used to be hardcoded, always-visible inputs, which is why a sofa
 * asked for a brand. They now come from `category_attributes` like every other
 * attribute — but the columns still exist and the browse filters read them, so
 * whatever the seller picked is mirrored across. Options are stored by id;
 * the column wants the human value ("wood"), so resolve it here.
 */
export function nativeFacetValues(
  form: FormData,
  defs: CategoryAttributeDef[],
): Record<NativeFacetSlug, string | null> {
  const out: Record<NativeFacetSlug, string | null> = {
    material: null,
    color: null,
    brand: null,
  };
  for (const def of defs) {
    const slug = NATIVE_FACET_SLUGS.find((s) => s === def.slug);
    if (!slug) continue;
    const picked = String(form.get(`attr_${def.attribute_id}`) ?? "").trim();
    const freeText = String(form.get(`attr_${def.attribute_id}_text`) ?? "").trim();
    const option = picked ? def.options.find((o) => o.id === picked) : undefined;
    out[slug] = option?.value ?? (picked && !def.options.length ? picked : null) ?? null;
    if (!out[slug] && freeText) out[slug] = freeText;
  }
  return out;
}

/**
 * An option id to preselect for a legacy listing: rows written before the
 * dynamic system stored plain text in the column ("Wood", "wood"), so match it
 * against the option values case-insensitively rather than dropping the value.
 */
export function optionIdForLegacyValue(
  def: CategoryAttributeDef,
  legacy: string | null | undefined,
): { optionId: string | null; text: string | null } {
  const v = (legacy ?? "").trim();
  if (!v) return { optionId: null, text: null };
  const hit = def.options.find(
    (o) => o.value.toLowerCase() === v.toLowerCase() || o.label.toLowerCase() === v.toLowerCase(),
  );
  return hit ? { optionId: hit.id, text: null } : { optionId: null, text: v };
}
