import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Tag, MessagesSquare } from "lucide-react";
import heroImage from "@/assets/hero-showroom.jpg";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriesQuery, listingsQuery } from "@/lib/marketplace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SuqBet — Buy & Sell Used Furniture in Ethiopia" },
      {
        name: "description",
        content:
          "Browse thousands of second-hand sofas, beds, desks and dining sets from trusted shops across Addis Ababa. Free to list, free to message.",
      },
      { property: "og:title", content: "SuqBet — Buy & Sell Used Furniture in Ethiopia" },
      {
        property: "og:description",
        content: "Browse thousands of second-hand sofas, beds, desks and dining sets from trusted shops across Addis Ababa. Free to list, free to message.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: newest, isLoading } = useQuery(listingsQuery({ sort: "newest", limit: 8 }));
  const { data: popular } = useQuery(listingsQuery({ sort: "viewed", limit: 4 }));
  const { data: categories } = useQuery(categoriesQuery);
  const roots = (categories ?? []).filter((c) => !c.parent_id);

  return (
    <div>
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
            Good furniture deserves a second home.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Buy and sell pre-owned sofas, beds, desks and dining sets directly with local shops and
            households. No commission, prices in Birr.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/browse">
                Browse listings <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/sell">Post an item</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold">Shop by room</h2>
          <Link to="/categories" className="text-sm text-primary">
            All categories
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {roots.map((cat) => (
            <Link
              key={cat.id}
              to="/browse"
              search={{ category: cat.slug }}
              className="card-lift rounded-lg border bg-card p-4 text-sm font-medium shadow-soft"
            >
              {cat.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold">Fresh listings</h2>
          <Link to="/browse" className="text-sm text-primary">
            See all
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

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-display text-2xl font-semibold">Most viewed this week</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(popular ?? []).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>

      <section className="border-y bg-secondary/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "Verified shops",
              body: "Sellers are reviewed by our team before they get the verified badge.",
            },
            {
              icon: MessagesSquare,
              title: "Talk before you travel",
              body: "Message sellers in-app or leave your number for a callback.",
            },
            {
              icon: Tag,
              title: "Honest pricing",
              body: "Every price change is recorded, so you can see when an item drops.",
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
