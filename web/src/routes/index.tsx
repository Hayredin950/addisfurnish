import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ShieldCheck,
  Tag,
  MessagesSquare,
  TrendingUp,
  History,
  Star,
} from "lucide-react";
import heroImage from "@/assets/hero-showroom.jpg";
import { ListingCard } from "@/components/ListingCard";
import { MobileAppBanner } from "@/components/MobileAppBanner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  categoriesQuery,
  listingsQuery,
  recentlyViewedQuery,
  trendingSearchesQuery,
} from "@/lib/marketplace";
import { categoryName } from "@/lib/format";
import { categoryIcon } from "@/lib/category-icons";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AddisHome — Buy & Sell Used Furniture in Ethiopia" },
      {
        name: "description",
        content:
          "Browse thousands of second-hand sofas, beds, desks and dining sets from trusted shops across Addis Ababa. Free to list, free to message.",
      },
      { property: "og:title", content: "AddisHome — Buy & Sell Used Furniture in Ethiopia" },
      {
        property: "og:description",
        content:
          "Browse thousands of second-hand sofas, beds, desks and dining sets from trusted shops across Addis Ababa. Free to list, free to message.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { data: newest, isLoading } = useQuery(listingsQuery({ sort: "newest", limit: 8 }));
  const { data: popular } = useQuery(listingsQuery({ sort: "viewed", limit: 4 }));
  const { data: featured } = useQuery(listingsQuery({ featured: true, limit: 4 }));
  const { data: categories } = useQuery(categoriesQuery);
  const { data: trending } = useQuery(trendingSearchesQuery(8));
  const { data: recent } = useQuery(recentlyViewedQuery(user?.id ?? ""));

  const roots = (categories ?? []).filter((c) => !c.parent_id);

  return (
    <div>
      <MobileAppBanner />
      <section className="relative overflow-hidden border-b">
        <img
          src={heroImage}
          alt="Second-hand furniture showroom in Addis Ababa"
          width={1600}
          height={1104}
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Addis Ababa · Adama · Bahir Dar
          </p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-[1.1] sm:text-6xl">
            {t("home.title")}
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            {t("home.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/browse">
                {t("home.browseListings")} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/sell">{t("nav.postItem")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold">{t("home.shopByCategory")}</h2>
          <Link to="/categories" className="text-sm text-primary">
            {t("home.allCategories")}
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {roots.map((cat) => {
            const Icon = categoryIcon(cat.icon);
            return (
              <Link
                key={cat.id}
                to="/browse"
                search={{ category: cat.slug }}
                className="card-lift flex items-center gap-2.5 rounded-lg border bg-card p-4 text-sm font-medium shadow-soft"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 truncate">{categoryName(cat, lang)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold">{t("home.freshListings")}</h2>
          <Link to="/browse" className="text-sm text-primary">
            {t("home.seeAll")}
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-4/5 w-full rounded-lg" />
              ))
            : (newest ?? []).map((listing) => <ListingCard key={listing.id} listing={listing} />)}
        </div>
      </section>

      {featured && featured.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" /> Featured
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {featured.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      ) : null}

      {user && recent && recent.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="flex items-end justify-between">
            <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
              <History className="h-5 w-5 text-primary" /> {t("home.recentlyViewed")}
            </h2>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {recent.slice(0, 4).map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-display text-2xl font-semibold">{t("home.mostViewed")}</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(popular ?? []).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>

      {trending && trending.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 pb-14">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <TrendingUp className="h-5 w-5 text-primary" /> {t("home.popularSearches")}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {trending.map((term) => (
              <Link
                key={term}
                to="/browse"
                search={{ q: term }}
                className="rounded-full border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {term}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-y bg-secondary/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: t("home.trustVerifiedTitle"),
              body: t("home.trustVerifiedBody"),
            },
            {
              icon: MessagesSquare,
              title: t("home.trustTalkTitle"),
              body: t("home.trustTalkBody"),
            },
            {
              icon: Tag,
              title: t("home.trustPricingTitle"),
              body: t("home.trustPricingBody"),
            },
          ].map((item) => (
            <div key={item.title}>
              <item.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
