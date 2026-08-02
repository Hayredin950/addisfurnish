import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t bg-secondary/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg font-semibold">
            Suq<span className="text-primary">Bet</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Ethiopia's marketplace for quality second-hand furniture. Free to browse, free to list.
          </p>
        </div>
        <div className="text-sm">
          <p className="font-medium">Marketplace</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li>
              <Link to="/browse">Browse all items</Link>
            </li>
            <li>
              <Link to="/categories">Categories</Link>
            </li>
            <li>
              <Link to="/sell">Post an item</Link>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-medium">Trust</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li>
              <Link to="/safety">Safety guidelines</Link>
            </li>
            <li>
              <Link to="/auth">Create an account</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t py-5 text-center text-xs text-muted-foreground">
        Prices in Ethiopian Birr (ETB). Meet in safe, public places and inspect items before paying.
      </div>
    </footer>
  );
}
