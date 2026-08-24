import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Category } from "@/lib/marketplace";
import { categoryName } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The browse sidebar's category filter: the real 3-level taxonomy (spec §3/§16)
 * as a collapsible tree rather than one flat dropdown.
 *
 * A single `<select>` listing 160 categories with an em-dash prefix gave no
 * sense of what belongs to what — "Sofas" read as a sibling of "Furniture".
 * Rows are keyed by slug because that is what the `category` search param
 * carries, and picking any level filters that level's whole subtree.
 */
export function CategoryFilterTree({
  categories,
  value,
  onChange,
  counts,
  label,
}: {
  categories: Category[];
  value: string;
  onChange: (slug: string) => void;
  counts?: Record<string, number> | undefined;
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

  /** Ancestor slugs of the current selection, so its branch opens itself. */
  const selectedPath = useMemo(() => {
    const chain: string[] = [];
    let cur = active.find((c) => c.slug === value);
    while (cur) {
      chain.unshift(cur.slug);
      const parentId = cur.parent_id;
      cur = parentId ? active.find((c) => c.id === parentId) : undefined;
    }
    return chain;
  }, [active, value]);

  const [open, setOpen] = useState<string[]>(selectedPath);
  useEffect(() => {
    // Keep whatever the reader opened by hand; only add the selection's branch.
    setOpen((prev) => [...new Set([...prev, ...selectedPath])]);
  }, [selectedPath]);

  const toggle = (slug: string) =>
    setOpen((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));

  const rows = (parentId: string | null, depth: number): React.ReactNode =>
    (byParent.get(parentId) ?? []).map((c) => {
      const kids = byParent.get(c.id) ?? [];
      const expanded = open.includes(c.slug);
      const selected = value === c.slug;
      const count = counts?.[c.id];
      return (
        <li key={c.id}>
          <div className="flex items-center">
            {kids.length ? (
              <button
                type="button"
                onClick={() => toggle(c.slug)}
                aria-expanded={expanded}
                aria-label={`${expanded ? t("browse.collapse") : t("browse.expand")} ${categoryName(c, lang)}`}
                className="grid h-6 w-5 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              // Keeps leaf labels aligned with their expandable siblings.
              <span className="h-6 w-5 shrink-0" aria-hidden="true" />
            )}
            <button
              type="button"
              aria-pressed={selected}
              // Tapping the selected row clears it, so a dead filter is one
              // click to escape without hunting for "clear all".
              onClick={() => onChange(selected ? "" : c.slug)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm capitalize hover:bg-muted",
                selected && "bg-primary/10 font-semibold text-primary",
                depth === 0 && "font-medium",
                depth === 2 && "text-[13px] text-muted-foreground",
              )}
            >
              <span className="truncate">{categoryName(c, lang)}</span>
              {count ? (
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{count}</span>
              ) : null}
            </button>
          </div>
          {kids.length && expanded ? (
            <ul className="ml-2.5 border-l pl-1.5">{rows(c.id, depth + 1)}</ul>
          ) : null}
        </li>
      );
    });

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="max-h-72 overflow-y-auto pr-1">
        <button
          type="button"
          aria-pressed={!value}
          onClick={() => onChange("")}
          className={cn(
            "mb-1 ml-5 block rounded px-1.5 py-1 text-sm hover:bg-muted",
            !value && "font-semibold text-primary",
          )}
        >
          {t("browse.allCategories")}
        </button>
        <ul>{rows(null, 0)}</ul>
      </div>
    </div>
  );
}
