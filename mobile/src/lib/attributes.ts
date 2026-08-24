import { supabase } from "./supabase";

/**
 * Dynamic category attributes (spec §10/§14/§15) for the app's sell form —
 * the mobile half of web/src/lib/attributes.ts. Keep the two in step: the
 * backend is the same, and a seller must be able to edit on either.
 *
 * Material, colour and brand used to be hardcoded inputs that showed on every
 * listing regardless of category, which is why a sofa was asked for its brand.
 * They are ordinary attribute rows now; the `listings` columns of the same name
 * still exist, so whatever the seller picks is mirrored across for the browse
 * filters (see `nativeFacetValues`).
 */

export type AttributeOption = {
  id: string;
  attribute_id: string;
  value: string;
  label: string;
  label_am: string | null;
  sort_order: number;
  is_active: boolean;
};

export type AttributeType =
  | "text"
  | "number"
  | "boolean"
  | "single_select"
  | "multi_select"
  | "range";

/** One row of the `category_attribute_set` RPC (self + ancestors, deepest wins). */
export type CategoryAttributeDef = {
  attribute_id: string;
  slug: string;
  name: string;
  name_am: string | null;
  type: AttributeType;
  unit: string | null;
  is_required: boolean;
  is_filterable: boolean;
  sort_order: number;
  from_level: number;
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
 * Swatch colours for the `color` attribute's options, keyed by option `value`.
 * An unknown value still renders — it just gets an empty chip — so an admin
 * adding "teal" tomorrow doesn't break the picker.
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
  multicolor: "#f97316",
};

/** Attributes that also live as a column on `listings`. */
export const NATIVE_FACET_SLUGS = ["material", "color", "brand"] as const;
export type NativeFacetSlug = (typeof NATIVE_FACET_SLUGS)[number];

/** What the form holds for one attribute. `text` doubles as the number entry. */
export type AttrValue = { optionIds: string[]; text: string; bool: boolean };
export type AttrState = Record<string, AttrValue>;

export const emptyAttrValue = (): AttrValue => ({ optionIds: [], text: "", bool: false });

/**
 * Attribute definitions for a category, inherited from its ancestors by the
 * `category_attribute_set` RPC. Options come in a second call and are merged in.
 */
export async function fetchCategoryAttributes(
  categoryId: string | null,
): Promise<CategoryAttributeDef[]> {
  if (!categoryId) return [];
  const { data, error } = await supabase.rpc("category_attribute_set", {
    _category_id: categoryId,
  });
  if (error) throw error;
  const defs = (data ?? []) as Omit<CategoryAttributeDef, "options">[];
  if (!defs.length) return [];

  const selectIds = defs
    .filter((d) => d.type === "single_select" || d.type === "multi_select")
    .map((d) => d.attribute_id);
  if (!selectIds.length) return defs.map((d) => ({ ...d, options: [] }));

  const { data: opts, error: optError } = await supabase
    .from("attribute_options")
    .select("id,attribute_id,value,label,label_am,sort_order,is_active")
    .in("attribute_id", selectIds)
    .eq("is_active", true)
    .order("sort_order");
  if (optError) throw optError;

  const byAttr = new Map<string, AttributeOption[]>();
  for (const o of (opts ?? []) as AttributeOption[]) {
    byAttr.set(o.attribute_id, [...(byAttr.get(o.attribute_id) ?? []), o]);
  }
  return defs.map((d) => ({ ...d, options: byAttr.get(d.attribute_id) ?? [] }));
}

/** Existing values for a listing (edit-mode prefill). */
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

/** Replace the values of every attribute in `defs` for this listing (spec §11). */
export async function saveListingAttributeValues(
  listingId: string,
  defs: CategoryAttributeDef[],
  rows: ListingAttributeValueRow[],
): Promise<void> {
  if (!defs.length) return;
  const { error: delError } = await supabase
    .from("listing_attribute_values")
    .delete()
    .eq("listing_id", listingId)
    .in(
      "attribute_id",
      defs.map((d) => d.attribute_id),
    );
  if (delError) throw delError;
  if (!rows.length) return;
  const { error: insError } = await supabase
    .from("listing_attribute_values")
    .insert(rows.map((r) => ({ ...r, listing_id: listingId })));
  if (insError) throw insError;
}

/** Seed the form state from saved values, falling back to the legacy columns. */
export function attrStateFromRows(
  defs: CategoryAttributeDef[],
  rows: ListingAttributeValueRow[],
  legacy: Partial<Record<NativeFacetSlug, string | null>> = {},
): AttrState {
  const state: AttrState = {};
  for (const def of defs) {
    const mine = rows.filter((r) => r.attribute_id === def.attribute_id);
    const value = emptyAttrValue();
    for (const r of mine) {
      if (r.option_id) value.optionIds.push(r.option_id);
      if (r.value_text) value.text = r.value_text;
      if (r.value_number != null) value.text = String(r.value_number);
      if (r.value_boolean != null) value.bool = r.value_boolean;
    }
    // Written before the attribute existed: the value only lives in the
    // `listings` column, so match it to an option or keep it as free text.
    if (!mine.length) {
      const slug = NATIVE_FACET_SLUGS.find((s) => s === def.slug);
      const raw = slug ? (legacy[slug] ?? "").trim() : "";
      if (raw) {
        const hit = def.options.find(
          (o) =>
            o.value.toLowerCase() === raw.toLowerCase() ||
            o.label.toLowerCase() === raw.toLowerCase(),
        );
        if (hit) value.optionIds = [hit.id];
        else value.text = raw;
      }
    }
    state[def.attribute_id] = value;
  }
  return state;
}

/** Typed value rows for the current form state, plus unfilled required defs. */
export function buildAttributeRows(
  defs: CategoryAttributeDef[],
  state: AttrState,
): { rows: ListingAttributeValueRow[]; missingRequired: CategoryAttributeDef[] } {
  const rows: ListingAttributeValueRow[] = [];
  const missingRequired: CategoryAttributeDef[] = [];
  const base = (attribute_id: string): ListingAttributeValueRow => ({
    attribute_id,
    value_text: null,
    value_number: null,
    value_boolean: null,
    option_id: null,
  });

  for (const def of defs) {
    const v = state[def.attribute_id] ?? emptyAttrValue();
    const text = v.text.trim();
    let filled = false;

    if (def.type === "boolean") {
      rows.push({ ...base(def.attribute_id), value_boolean: v.bool });
      filled = true;
    } else if (def.type === "text") {
      if (text) {
        rows.push({ ...base(def.attribute_id), value_text: text });
        filled = true;
      }
    } else if (def.type === "number" || def.type === "range") {
      if (text && !Number.isNaN(Number(text))) {
        rows.push({ ...base(def.attribute_id), value_number: Number(text) });
        filled = true;
      }
    } else if (def.type === "single_select") {
      const picked = v.optionIds[0];
      if (picked) {
        rows.push({ ...base(def.attribute_id), option_id: picked });
        filled = true;
      } else if (text) {
        // The colour picker's "another colour" box, and any select whose saved
        // value predates its options.
        rows.push({ ...base(def.attribute_id), value_text: text });
        filled = true;
      }
    } else if (def.type === "multi_select") {
      for (const id of v.optionIds) rows.push({ ...base(def.attribute_id), option_id: id });
      if (v.optionIds.length) filled = true;
      else if (text) {
        rows.push({ ...base(def.attribute_id), value_text: text });
        filled = true;
      }
    }

    if (def.is_required && !filled) missingRequired.push(def);
  }
  return { rows, missingRequired };
}

/** The `listings.material` / `.color` / `.brand` columns for this form state. */
export function nativeFacetValues(
  defs: CategoryAttributeDef[],
  state: AttrState,
): Record<NativeFacetSlug, string | null> {
  const out: Record<NativeFacetSlug, string | null> = {
    material: null,
    color: null,
    brand: null,
  };
  for (const def of defs) {
    const slug = NATIVE_FACET_SLUGS.find((s) => s === def.slug);
    if (!slug) continue;
    const v = state[def.attribute_id] ?? emptyAttrValue();
    const option = v.optionIds[0]
      ? def.options.find((o) => o.id === v.optionIds[0])
      : undefined;
    out[slug] = option?.value ?? (v.text.trim() || null);
  }
  return out;
}

/** Label in the reader's language, with the unit and a required marker. */
export function attrLabel(def: CategoryAttributeDef, lang: "en" | "am"): string {
  const name = lang === "am" && def.name_am ? def.name_am : def.name;
  return `${name}${def.unit ? ` (${def.unit})` : ""}${def.is_required ? " *" : ""}`;
}

export function optionLabel(o: AttributeOption, lang: "en" | "am"): string {
  return lang === "am" && o.label_am ? o.label_am : o.label;
}
