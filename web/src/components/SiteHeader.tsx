import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Shield,
  TrendingUp,
  User,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { formatBirr } from "@/lib/format";
import { isAdminQuery, searchSuggestionsQuery, trendingSearchesQuery } from "@/lib/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";

export function SiteHeader() {
  const { user, profile, signOut } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);
  const { data: isAdmin } = useQuery(isAdminQuery(user?.id));
  const { data: suggestions } = useQuery(searchSuggestionsQuery(term));
  const { data: trending } = useQuery(trendingSearchesQuery(5));

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setOpen(false);
    navigate({ to: "/browse", search: { q: term.trim() } });
  }

  function goToBrowse(q: string) {
    setOpen(false);
    setTerm(q);
    navigate({ to: "/browse", search: { q } });
  }

  const showTrending = open && term.trim().length < 2;
  const showSuggestions = open && term.trim().length >= 2;

  const NAV = [
    { to: "/browse", label: t("nav.browse") },
    { to: "/categories", label: t("nav.categories") },
    { to: "/safety", label: t("nav.safety") },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="shrink-0 font-display text-xl font-semibold tracking-tight">
          Suq<span className="text-primary">Bet</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="relative ml-auto hidden max-w-sm flex-1 lg:block">
          <form onSubmit={submitSearch} role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                if (blurTimer.current) window.clearTimeout(blurTimer.current);
                blurTimer.current = window.setTimeout(() => setOpen(false), 150);
              }}
              placeholder={t("nav.searchPlaceholder")}
              className="pl-9"
              aria-label={t("nav.searchPlaceholder")}
            />
          </form>

          {showSuggestions || showTrending ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border bg-card shadow-lift">
              {showSuggestions ? (
                <div>
                  {(suggestions ?? []).length > 0 ? (
                    <ul className="max-h-72 overflow-y-auto py-1">
                      {suggestions!.map((s) => (
                        <li key={s.id}>
                          <Link
                            to="/listing/$id"
                            params={{ id: s.id }}
                            onMouseDown={() => setOpen(false)}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-secondary"
                          >
                            <span className="truncate font-medium">{s.title}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatBirr(s.price)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-3 text-xs text-muted-foreground">{t("browse.loading")}</p>
                  )}
                  <div className="border-t px-3 py-2">
                    <button
                      type="button"
                      onMouseDown={() => goToBrowse(term.trim())}
                      className="text-xs font-medium text-primary"
                    >
                      {t("browse.title")} · “{term.trim()}”
                    </button>
                  </div>
                </div>
              ) : null}
              {showTrending && trending && trending.length > 0 ? (
                <div className="px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <TrendingUp className="h-3 w-3" /> {t("browse.popular")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {trending.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onMouseDown={() => goToBrowse(q)}
                        className="rounded-full bg-secondary px-2.5 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <LanguageToggle />

          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link to="/sell">
              <Plus className="mr-1 h-4 w-4" /> {t("nav.postItem")}
            </Link>
          </Button>

          {user ? (
            <>
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t("nav.accountMenu")}>
                    <User className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">
                    {profile?.full_name ?? user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard">
                      <LayoutDashboard className="mr-2 h-4 w-4" /> {t("nav.myShop")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/messages">
                      <MessageCircle className="mr-2 h-4 w-4" /> {t("nav.messages")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/favorites">
                      <Heart className="mr-2 h-4 w-4" /> {t("nav.savedItems")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <User className="mr-2 h-4 w-4" /> {t("nav.profile")}
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin ? (
                    <DropdownMenuItem asChild>
                      <Link to="/admin">
                        <Shield className="mr-2 h-4 w-4" /> {t("admin.title")}
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      navigate({ to: "/", replace: true });
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" /> {t("nav.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">{t("nav.signIn")}</Link>
            </Button>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t("nav.openMenu")}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <nav className="mt-8 flex flex-col gap-1">
                {NAV.map((item) => (
                  <Link key={item.to} to={item.to} className="rounded-md px-3 py-2 text-sm">
                    {item.label}
                  </Link>
                ))}
                <Link to="/sell" className="rounded-md px-3 py-2 text-sm">
                  {t("nav.postItem")}
                </Link>
                <div className="mt-4 px-3">
                  <LanguageToggle />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
