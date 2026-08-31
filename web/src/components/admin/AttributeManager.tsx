import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, List, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoriesQuery, type Category } from "@/lib/marketplace";
import {
  categoryAttributesQuery,
  type CategoryAttributeDef,
  type AttributeOption,
} from "@/lib/attributes";
import { logAdminAction } from "@/lib/admin-audit";
import { useLang } from "@/lib/i18n";

type AttrType = CategoryAttributeDef["type"];

type AttributeRow = {
  id: string;
  name: string;
  name_am: string | null;
  slug: string;
  type: AttrType;
  unit: string | null;
  is_filterable: boolean;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

const ATTR_TYPES: AttrType[] = [
  "text",
  "number",
  "boolean",
  "single_select",
  "multi_select",
  "range",
];

const TYPE_LABELS = {
  text: "admin.attributeTypeText",
  number: "admin.attributeTypeNumber",
  boolean: "admin.attributeTypeBoolean",
  single_select: "admin.attributeTypeSingleSelect",
  multi_select: "admin.attributeTypeMultiSelect",
  range: "admin.attributeTypeRange",
} as const;

const TYPE_BADGE: Record<AttrType, string> = {
  text: "bg-sky-500/10 text-sky-600",
  number: "bg-emerald-500/10 text-emerald-600",
  boolean: "bg-amber-500/10 text-amber-600",
  single_select: "bg-violet-500/10 text-violet-600",
  multi_select: "bg-fuchsia-500/10 text-fuchsia-600",
  range: "bg-teal-500/10 text-teal-600",
};

/** The catalogue + category-attachment admin panel (spec §3, §4, §9, §10). */
export function AttributeManager() {
  const { t } = useLang();
  const queryClient = useQueryClient();

  const { data: attributes } = useQuery({
    queryKey: ["attribute-catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attributes")
        .select("id,name,name_am,slug,type,unit,is_filterable,is_required,is_active,sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AttributeRow[];
    },
  });
  const { data: categories } = useQuery(categoriesQuery);

  // ── Catalogue form ────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");
  const [type, setType] = useState<AttrType>("single_select");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);

  const [expandedAttr, setExpandedAttr] = useState<string | null>(null);
  const [editingAttr, setEditingAttr] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameAm, setEditNameAm] = useState("");
  const [editUnit, setEditUnit] = useState("");

  const [newOption, setNewOption] = useState({ value: "", label: "", labelAm: "" });
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [optValue, setOptValue] = useState("");
  const [optLabel, setOptLabel] = useState("");
  const [optLabelAm, setOptLabelAm] = useState("");

  // ── Category attachment ───────────────────────────────────────────
  const [categoryId, setCategoryId] = useState<string>("");
  const selectedCat = categories?.find((c) => c.id === categoryId);
  const { data: effective } = useQuery(categoryAttributesQuery(categoryId || null));

  const invalidateCatalogue = () => {
    queryClient.invalidateQueries({ queryKey: ["attribute-catalogue"] });
    queryClient.invalidateQueries({ queryKey: ["attribute-options"] });
    if (categoryId)
      queryClient.invalidateQueries({ queryKey: ["category-attributes", categoryId] });
  };

  const { data: optionsByAttr } = useQuery({
    queryKey: ["attribute-options", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attribute_options")
        .select("id,attribute_id,value,label,label_am,sort_order,is_active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const map = new Map<string, AttributeOption[]>();
      for (const o of (data ?? []) as AttributeOption[]) {
        map.set(o.attribute_id, [...(map.get(o.attribute_id) ?? []), o]);
      }
      return map;
    },
  });

  const optionsList = (attrId: string): AttributeOption[] => optionsByAttr?.get(attrId) ?? [];

  // ── Catalogue actions ─────────────────────────────────────────────
  const createAttribute = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const { error } = await supabase.from("attributes").insert({
      name: name.trim(),
      name_am: nameAm.trim() || null,
      slug,
      type,
      unit: unit.trim() || null,
      is_filterable: type !== "boolean" && type !== "text",
      is_required: false,
      is_active: true,
      sort_order: (attributes?.length ?? 0) + 1,
    });
    setBusy(false);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    setName("");
    setNameAm("");
    setUnit("");
    void logAdminAction({
      action: "attribute_created",
      entityType: "attribute",
      newValue: { name: name.trim(), slug, type },
    });
    invalidateCatalogue();
    toast.success(t("toast.listingUpdated"));
  };

  const startEdit = (a: AttributeRow) => {
    setEditingAttr(a.id);
    setEditName(a.name);
    setEditNameAm(a.name_am ?? "");
    setEditUnit(a.unit ?? "");
  };

  const saveEdit = async (a: AttributeRow) => {
    const { error } = await supabase
      .from("attributes")
      .update({
        name: editName.trim() || a.name,
        name_am: editNameAm.trim() || null,
        unit: editUnit.trim() || null,
      })
      .eq("id", a.id);
    setEditingAttr(null);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    void logAdminAction({
      action: "attribute_changed",
      entityType: "attribute",
      entityId: a.id,
      newValue: { name: editName.trim(), unit: editUnit.trim() || null },
    });
    invalidateCatalogue();
  };

  const toggleFlag = async (a: AttributeRow, field: "is_active" | "is_filterable") => {
    const update =
      field === "is_active"
        ? { is_active: a.is_active === false }
        : { is_filterable: !a.is_filterable };
    const { error } = await supabase.from("attributes").update(update).eq("id", a.id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    invalidateCatalogue();
  };

  // ── Options actions ───────────────────────────────────────────────
  const addOption = async (a: AttributeRow) => {
    if (!newOption.value.trim() || !newOption.label.trim()) return;
    const { error } = await supabase.from("attribute_options").insert({
      attribute_id: a.id,
      value: newOption.value.trim().toLowerCase().replace(/\s+/g, "-"),
      label: newOption.label.trim(),
      label_am: newOption.labelAm.trim() || null,
      sort_order: optionsList(a.id).length + 1,
      is_active: true,
    });
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    setNewOption({ value: "", label: "", labelAm: "" });
    void logAdminAction({
      action: "attribute_option_created",
      entityType: "attribute",
      entityId: a.id,
      newValue: { value: newOption.value.trim(), label: newOption.label.trim() },
    });
    invalidateCatalogue();
  };

  const toggleOption = async (o: AttributeOption) => {
    const { error } = await supabase
      .from("attribute_options")
      .update({ is_active: o.is_active === false })
      .eq("id", o.id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    invalidateCatalogue();
  };

  const saveOption = async (o: AttributeOption) => {
    const { error } = await supabase
      .from("attribute_options")
      .update({
        value: optValue.trim() || o.value,
        label: optLabel.trim() || o.label,
        label_am: optLabelAm.trim() || null,
      })
      .eq("id", o.id);
    setEditingOption(null);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    invalidateCatalogue();
  };

  const startEditOption = (o: AttributeOption) => {
    setEditingOption(o.id);
    setOptValue(o.value);
    setOptLabel(o.label);
    setOptLabelAm(o.label_am ?? "");
  };

  // ── Category attachment actions ───────────────────────────────────
  const attachAttribute = async (attrId: string) => {
    if (!categoryId) return;
    const attr = attributes?.find((a) => a.id === attrId);
    const inSet = (effective ?? []).some((d) => d.attribute_id === attrId);
    if (inSet) return;
    const { error } = await supabase.from("category_attributes").insert({
      category_id: categoryId,
      attribute_id: attrId,
      is_required: attr?.is_required ?? false,
      is_filterable: attr?.is_filterable ?? true,
      sort_order: (effective?.length ?? 0) + 1,
    });
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    void logAdminAction({
      action: "category_attribute_attached",
      entityType: "category",
      entityId: categoryId,
      newValue: { attribute_id: attrId },
    });
    queryClient.invalidateQueries({ queryKey: ["category-attributes", categoryId] });
  };

  const detachAttribute = async (def: CategoryAttributeDef) => {
    if (!categoryId) return;
    const { error } = await supabase
      .from("category_attributes")
      .delete()
      .eq("category_id", categoryId)
      .eq("attribute_id", def.attribute_id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    void logAdminAction({
      action: "category_attribute_detached",
      entityType: "category",
      entityId: categoryId,
      newValue: { attribute_id: def.attribute_id },
    });
    queryClient.invalidateQueries({ queryKey: ["category-attributes", categoryId] });
  };

  const toggleCategoryFlag = async (
    def: CategoryAttributeDef,
    field: "is_required" | "is_filterable",
  ) => {
    if (!categoryId || def.from_level !== selectedCat?.level) return;
    const update =
      field === "is_required"
        ? { is_required: def.is_required === false }
        : { is_filterable: def.is_filterable === false };
    const { error } = await supabase
      .from("category_attributes")
      .update(update)
      .eq("category_id", categoryId)
      .eq("attribute_id", def.attribute_id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["category-attributes", categoryId] });
  };

  const pathLabel = (cat: Category): string => {
    const names: string[] = [];
    let cursor = cat.parent_id ? categories?.find((c) => c.id === cat.parent_id) : undefined;
    let hops = 0;
    while (cursor && hops < 5) {
      names.unshift(cursor.name);
      cursor = cursor.parent_id ? categories?.find((c) => c.id === cursor!.parent_id) : undefined;
      hops += 1;
    }
    return [...names, cat.name].join(" › ");
  };

  const attachable = (attributes ?? []).filter(
    (a) => a.is_active && !(effective ?? []).some((d) => d.attribute_id === a.id),
  );

  return (
    <div className="space-y-6">
      {/* ── Catalogue ──────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">{t("admin.attributeCatalogue")}</p>

        {/* Create form */}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_150px_110px_auto]">
          <Input
            placeholder={t("admin.attributeName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder={t("admin.attributeNameAm")}
            value={nameAm}
            onChange={(e) => setNameAm(e.target.value)}
          />
          <Select value={type} onValueChange={(v) => setType(v as AttrType)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTR_TYPES.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  {t(TYPE_LABELS[ty])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={t("admin.attributeUnit")}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <Button disabled={!name.trim() || busy} onClick={createAttribute}>
            <Plus className="mr-1.5 h-4 w-4" /> {t("admin.addAttribute")}
          </Button>
        </div>

        {/* List */}
        {attributes?.length ? (
          <ul className="mt-4 space-y-2">
            {attributes.map((a) => (
              <li key={a.id} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[a.type]}`}
                  >
                    {t(TYPE_LABELS[a.type])}
                  </span>
                  {editingAttr === a.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 min-w-32 flex-1"
                      />
                      <Input
                        value={editNameAm}
                        onChange={(e) => setEditNameAm(e.target.value)}
                        className="h-8 min-w-32 flex-1"
                      />
                      <Input
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        placeholder={t("admin.attributeUnit")}
                        className="h-8 w-24"
                      />
                      <Button size="sm" onClick={() => saveEdit(a)}>
                        <Check className="mr-1 h-3.5 w-3.5" /> {t("profile.save")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingAttr(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{a.name}</span>
                      {a.name_am ? (
                        <span className="text-xs text-muted-foreground">({a.name_am})</span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">/{a.slug}</span>
                      {a.unit ? (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {a.unit}
                        </span>
                      ) : null}
                      <span className="ml-auto flex items-center gap-1">
                        {(a.type === "single_select" || a.type === "multi_select") && (
                          <button
                            type="button"
                            onClick={() => setExpandedAttr(expandedAttr === a.id ? null : a.id)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title={t("admin.attributeOptions")}
                          >
                            <List className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            a.is_filterable
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {t("admin.attributeFilterable")}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleFlag(a, "is_filterable")}
                          className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                          title={t("admin.attributeFilterable")}
                        >
                          {a.is_filterable ? "✓" : "✗"}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFlag(a, "is_active")}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
                            a.is_active === false
                              ? "bg-destructive/10 text-destructive"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {a.is_active === false
                            ? t("admin.attributeInactive")
                            : t("admin.attributeActive")}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(a)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </>
                  )}
                </div>

                {/* Options editor for select types */}
                {expandedAttr === a.id &&
                (a.type === "single_select" || a.type === "multi_select") ? (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("admin.attributeOptions")}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-[110px_1fr_1fr_auto]">
                      <Input
                        placeholder={t("admin.optionValue")}
                        value={newOption.value}
                        onChange={(e) => setNewOption({ ...newOption, value: e.target.value })}
                        className="h-8"
                      />
                      <Input
                        placeholder={t("admin.optionLabel")}
                        value={newOption.label}
                        onChange={(e) => setNewOption({ ...newOption, label: e.target.value })}
                        className="h-8"
                      />
                      <Input
                        placeholder={t("admin.optionLabelAm")}
                        value={newOption.labelAm}
                        onChange={(e) => setNewOption({ ...newOption, labelAm: e.target.value })}
                        className="h-8"
                      />
                      <Button size="sm" onClick={() => addOption(a)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> {t("admin.addOption")}
                      </Button>
                    </div>
                    {optionsList(a.id).length ? (
                      <ul className="space-y-1">
                        {optionsList(a.id).map((o) =>
                          editingOption === o.id ? (
                            <li key={o.id} className="flex items-center gap-2">
                              <Input
                                value={optValue}
                                onChange={(e) => setOptValue(e.target.value)}
                                className="h-8 w-28"
                              />
                              <Input
                                value={optLabel}
                                onChange={(e) => setOptLabel(e.target.value)}
                                className="h-8 flex-1"
                              />
                              <Input
                                value={optLabelAm}
                                onChange={(e) => setOptLabelAm(e.target.value)}
                                className="h-8 flex-1"
                              />
                              <Button size="sm" onClick={() => saveOption(o)}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingOption(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </li>
                          ) : (
                            <li key={o.id} className="flex items-center gap-2 text-sm">
                              <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                                {o.value}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{o.label}</span>
                              <button
                                type="button"
                                onClick={() => toggleOption(o)}
                                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                  o.is_active === false
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                {o.is_active === false
                                  ? t("admin.attributeInactive")
                                  : t("admin.attributeActive")}
                              </button>
                              <button
                                type="button"
                                onClick={() => startEditOption(o)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("admin.noOptions")}</p>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t("admin.noAttributes")}</p>
        )}
      </div>

      {/* ── Category attachment ────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">{t("admin.effectiveAttributes")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-10 min-w-56 flex-1 sm:flex-none">
              <SelectValue placeholder={t("admin.selectCategory")} />
            </SelectTrigger>
            <SelectContent>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {pathLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {categoryId ? (
          <>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{t("admin.attachAttributeHint")}</p>
            </div>
            {(effective ?? []).length ? (
              <ul className="mt-3 space-y-2">
                {(effective ?? []).map((d) => {
                  const direct = selectedCat ? d.from_level === selectedCat.level : false;
                  return (
                    <li
                      key={d.attribute_id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3 text-sm"
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[d.type]}`}
                      >
                        {t(TYPE_LABELS[d.type])}
                      </span>
                      <span className="font-medium">{d.name}</span>
                      {d.unit ? (
                        <span className="text-xs text-muted-foreground">{d.unit}</span>
                      ) : null}
                      {direct ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          {t("admin.attachedDirectly")}
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {t("admin.inherited")}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          disabled={!direct}
                          onClick={() => toggleCategoryFlag(d, "is_required")}
                          className={`rounded-full px-2 py-0.5 text-[10px] transition-colors disabled:opacity-40 ${
                            d.is_required
                              ? "bg-destructive/10 text-destructive"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {t("admin.attributeRequired")}
                        </button>
                        <button
                          type="button"
                          disabled={!direct}
                          onClick={() => toggleCategoryFlag(d, "is_filterable")}
                          className={`rounded-full px-2 py-0.5 text-[10px] transition-colors disabled:opacity-40 ${
                            d.is_filterable
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {t("admin.attributeFilterable")}
                        </button>
                        {direct ? (
                          <button
                            type="button"
                            onClick={() => detachAttribute(d)}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t("admin.noAttributes")}</p>
            )}

            {attachable.length ? (
              <div className="mt-4 border-t pt-3">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t("admin.attachAttribute")}
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {attachable.map((a) => (
                    <Button
                      key={a.id}
                      size="sm"
                      variant="outline"
                      onClick={() => attachAttribute(a.id)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> {a.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
