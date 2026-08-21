import { useEffect, useMemo, useCallback, useState } from "react";
import type { Category } from "@/lib/marketplace";
import { categoryName } from "@/lib/format";
import { useLang } from "@/lib/i18n";

function useCategoryTree(active: Category[]) {
  return useMemo(() => {
    const roots = active.filter((c) => c.level === 0).sort((a, b) => a.sort_order - b.sort_order);
    const byParent = (parentId: string | null) =>
      active.filter((c) => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);
    return { roots, byParent };
  }, [active]);
}

/**
 * Controlled 3-level cascading selector keyed by category id.
 * Reading any level is allowed (Level 2 is optional per spec); the most specific
 * selected id is returned.
 */
export function CategoryTreeSelect({
  categories,
  value: controlledValue,
  onChange,
  label,
  placeholder,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  placeholder?: string;
}) {
  const { t, lang } = useLang();
  const active = useMemo(() => categories.filter((c) => c.is_active), [categories]);
  const { roots, byParent } = useCategoryTree(active);

  const path = useCallback(
    (id: string): string[] => {
      const chain: string[] = [];
      let cur = active.find((c) => c.id === id);
      while (cur) {
        chain.unshift(cur.id);
        cur = cur.parent_id ? active.find((c) => c.id === cur!.parent_id) : undefined;
      }
      return chain;
    },
    [active],
  );

  const [l0, setL0] = useState(controlledValue ? (path(controlledValue)[0] ?? "") : "");
  const [l1, setL1] = useState(controlledValue ? (path(controlledValue)[1] ?? "") : "");
  const [l2, setL2] = useState(controlledValue ? (path(controlledValue)[2] ?? "") : "");

  useEffect(() => {
    const p = controlledValue ? path(controlledValue) : [];
    setL0(p[0] ?? "");
    setL1(p[1] ?? "");
    setL2(p[2] ?? "");
  }, [controlledValue, path]);

  // Commit the most specific selected level on every change.
  const commit = (a: string, b: string, c: string) => onChange(c || b || a);

  const onChange0 = (v: string) => {
    setL0(v);
    setL1("");
    setL2("");
    commit(v, "", "");
  };
  const onChange1 = (v: string) => {
    setL1(v);
    setL2("");
    commit(l0, v, "");
  };
  const onChange2 = (v: string) => {
    setL2(v);
    commit(l0, l1, v);
  };

  const levels1 = byParent(l0);
  const levels2 = byParent(l1);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="grid gap-3 sm:grid-cols-3">
        <select
          value={l0}
          onChange={(e) => onChange0(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
        >
          <option value="">{placeholder ?? t("sell.select")}</option>
          {roots.map((o) => (
            <option key={o.id} value={o.id}>
              {categoryName(o, lang)}
            </option>
          ))}
        </select>
        <select
          value={l1}
          onChange={(e) => onChange1(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
        >
          <option value="">{placeholder ?? t("sell.select")}</option>
          {levels1.map((o) => (
            <option key={o.id} value={o.id}>
              {categoryName(o, lang)}
            </option>
          ))}
        </select>
        <select
          value={l2}
          onChange={(e) => onChange2(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
        >
          <option value="">{placeholder ?? t("sell.select")}</option>
          {levels2.map((o) => (
            <option key={o.id} value={o.id}>
              {categoryName(o, lang)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * 3-level cascading category selector that participates in a native HTML form
 * via a hidden input. Writes the chosen (most specific) category id to the
 * hidden field named `inputName`.
 */
export function CategoryPicker({
  categories,
  inputName,
  defaultValue = "",
  required,
  label,
}: {
  categories: Category[];
  inputName: string;
  defaultValue?: string;
  required?: boolean;
  label: string;
}) {
  const [val, setVal] = useState(defaultValue);
  return (
    <>
      <CategoryTreeSelect
        categories={categories}
        value={val}
        onChange={(id) => setVal(id)}
        label={label}
      />
      <input type="hidden" name={inputName} value={val} required={required} />
    </>
  );
}
