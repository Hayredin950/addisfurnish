import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery } from "@/lib/marketplace";
import { useLang } from "@/lib/i18n";
import { categoryName } from "@/lib/format";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Furniture Categories — SuqBet" },
      {
        name: "description",
        content:
          "Browse used furniture by room and type: living room sofas, bedroom wardrobes, office desks, dining sets, outdoor and storage.",
      },
      { property: "og:title", content: "Furniture Categories — SuqBet" },
      {
        property: "og:description",
        content: "Every room and furniture type available on SuqBet.",
      },
    ],
  }),
  component: Categories,
});

function Categories() {
  const { data: categories } = useQuery(categoriesQuery);
  const { t, lang } = useLang();
  const roots = (categories ?? []).filter((c) => !c.parent_id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{t("categories.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("categories.subtitle")}</p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {roots.map((root) => {
          const children = (categories ?? []).filter((c) => c.parent_id === root.id);
          return (
            <section key={root.id} className="rounded-lg border bg-card p-5 shadow-soft">
              <h2 className="font-display text-lg font-semibold">
                <Link
                  to="/browse"
                  search={{
                    q: "",
                    category: root.slug,
                    condition: "",
                    material: "",
                    room: "",
                    city: "",
                    min: 0,
                    max: 0,
                    sort: "newest",
                  }}
                >
                  {categoryName(root, lang)}
                </Link>
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {children.map((child) => (
                  <li key={child.id}>
                    <Link
                      to="/browse"
                      search={{
                        q: "",
                        category: child.slug,
                        condition: "",
                        material: "",
                        room: "",
                        city: "",
                        min: 0,
                        max: 0,
                        sort: "newest",
                      }}
                      className="hover:text-foreground"
                    >
                      {categoryName(child, lang)}
                    </Link>
                  </li>
                ))}
                {children.length === 0 ? <li>{t("categories.noSubs")}</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
