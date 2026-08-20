import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery, categoryCountsQuery } from "@/lib/marketplace";
import { useLang } from "@/lib/i18n";
import { categoryName } from "@/lib/format";
import { categoryIcon } from "@/lib/category-icons";

/** Shared search defaults so a category link lands on an unfiltered browse. */
const BROWSE_DEFAULTS = {
  q: "",
  condition: "",
  material: "",
  room: "",
  city: "",
  min: 0,
  max: 0,
  sort: "newest",
} as const;

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Furniture Categories — HabeshaHome" },
      {
        name: "description",
        content:
          "Browse used furniture by room and type: living room sofas, bedroom wardrobes, office desks, dining sets, outdoor and storage.",
      },
      { property: "og:title", content: "Furniture Categories — HabeshaHome" },
      {
        property: "og:description",
        content: "Every room and furniture type available on HabeshaHome.",
      },
    ],
  }),
  component: Categories,
});

function Categories() {
  const { data: categories } = useQuery(categoriesQuery);
  const { data: counts } = useQuery(categoryCountsQuery);
  const { t, lang } = useLang();
  const roots = (categories ?? []).filter((c) => !c.parent_id);

  const countFor = (id: string) => counts?.[id] ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{t("categories.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("categories.subtitle")}</p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {roots.map((root) => {
          const children = (categories ?? []).filter((c) => c.parent_id === root.id);
          const Icon = categoryIcon(root.icon);
          const rootCount = countFor(root.id);
          return (
            <section
              key={root.id}
              className="rounded-lg border bg-card p-5 shadow-soft transition-colors hover:border-primary/50"
            >
              <Link
                to="/browse"
                search={{ ...BROWSE_DEFAULTS, category: root.slug }}
                className="flex items-center gap-3"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg font-semibold hover:text-primary">
                    {categoryName(root, lang)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {rootCount > 0
                      ? t("categories.itemCount", { count: rootCount })
                      : t("categories.empty")}
                  </span>
                </span>
              </Link>

              <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                {children.map((child) => {
                  const childCount = countFor(child.id);
                  return (
                    <li key={child.id}>
                      <Link
                        to="/browse"
                        search={{ ...BROWSE_DEFAULTS, category: child.slug }}
                        className="flex items-center justify-between gap-2 hover:text-foreground"
                      >
                        <span className="truncate">{categoryName(child, lang)}</span>
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums">
                          {childCount}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {children.length === 0 ? <li>{t("categories.noSubs")}</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
