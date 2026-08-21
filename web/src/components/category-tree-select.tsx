import { useEffect, useMemo, useState } from "react";
import type { Category } from "@/lib/marketplace";
import { categoryName } from "@/lib/format";
import { useLang } from "@/lib/i18n";

/**
 * Controlled 3-level cascading category selector keyed by category id
 * (spec §2). Reading any level is allowed — Level 2 is optional — and the
 * most specific selected id is reported through `onChange`.
 */
export function CategoryTreeSelect({
  categories,
  value,
  onChange,
  label,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const { t, lang } = useLang();
  const active = useMemo(() => categories.filter((c) => c.is_active), [categories]);
  const byParent = useMemo(() => {
    const m = new Map<string | null, Category[]>();
    for (const c of active) {
      const list = m.get(c.parent_id) ?? [];
      list.push(c);
      m.set(c.parent_id, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [active]);

  // Resolve the selected id back into its ancestor chain.
  const path = useMemo(() => {
    const chain: string[] = [];
    let cur = active.find((c) => c.id === value);
    while (cur) {
      chain.unshift(cur.id);
      cur = cur.parent_id ? active.find((c) => c.id === cur!.parent_id) : undefined;
    }
    return chain;
  }, [active, value]);

  const [l0, setL0] = useState(path[0] ?? "");
  const [l1, setL1] = useState(path[1] ?? "");
  const [l2, setL2] = useState(path[2] ?? "");

  useEffect(() => {
    setL0(path[0] ?? "");
    setL1(path[1] ?? "");
    setL2(path[2] ?? "");
  }, [path]);

  const levels1 = byParent.get(l0) ?? [];
  const levels2 = byParent.get(l1) ?? [];

  const selectCls =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize";

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="grid gap-3 sm:grid-cols-3">
        <select
          value={l0}
          onChange={(e) => {
            setL0(e.target.value);
            setL1("");
            setL2("");
            onChange(e.target.value);
          }}
          className={selectCls}
        >
          <option value="">{t("sell.select")}</option>
          {(byParent.get(null) ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {categoryName(c, lang)}
            </option>
          ))}
        </select>
        <select
          value={l1}
          onChange={(e) => {
            setL1(e.target.value);
            setL2("");
            onChange(e.target.value || l0);
          }}
          className={selectCls}
          disabled={!levels1.length}
        >
          <option value="">{t("sell.select")}</option>
          {levels1.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryName(c, lang)}
            </option>
          ))}
        </select>
        <select
          value={l2}
          onChange={(e) => {
            setL2(e.target.value);
            onChange(e.target.value || l1);
          }}
          className={selectCls}
          disabled={!levels2.length}
        >
          <option value="">{t("sell.select")}</option>
          {levels2.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryName(c, lang)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Same selector, participating in a native HTML form via a hidden input named
 * `inputName` that carries the most specific selected category id.
 */
export function CategoryTreeField({
  categories,
  inputName,
  defaultValue = "",
  onChange,
  label,
}: {
  categories: Category[];
  inputName: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  label: string;
}) {
  const [val, setVal] = useState(defaultValue);
  return (
    <>
      <CategoryTreeSelect
        categories={categories}
        value={val}
        onChange={(id) => {
          setVal(id);
          onChange?.(id);
        }}
        label={label}
      />
      <input type="hidden" name={inputName} value={val} />
    </>
  );
}
