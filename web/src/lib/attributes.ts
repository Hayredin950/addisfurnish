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
