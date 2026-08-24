import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
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
  X,
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
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";

/** Neutral person silhouette — used for guests, who have no profile picture. */
function DefaultAvatar() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
      <User className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}

/**
 * The header search field plus its trending / suggestion dropdown.
 *
 * Extracted so the same box can serve the desktop header *and* the phone-width
 * expanded row — the app has a search field on its home screen, and before this
 * the web header hid search entirely below `lg`, leaving phones with no way to
 * search except walking to /browse first (item 12).
 */
function SearchBox({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);
  const { data: suggestions } = useQuery(searchSuggestionsQuery(term));
  const { data: trending } = useQuery(trendingSearchesQuery(5));

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setOpen(false);
    onDone?.();
    navigate({ to: "/browse", search: { q: term.trim() } });
  }

  function goToBrowse(q: string) {
    setOpen(false);
    setTerm(q);
    onDone?.();
    navigate({ to: "/browse", search: { q } });
  }

  // Suggestions must navigate programmatically too: closing the dropdown on
  // mousedown unmounts the <Link> before its click event can fire, which is
  // exactly why "clicking a suggestion did nothing".
  function goToListing(id: string) {
    setOpen(false);
    onDone?.();
    navigate({ to: "/listing/$id", params: { id } });
  }

  const showTrending = open && term.trim().length < 2;
  const showSuggestions = open && term.trim().length >= 2;

  return (
    <>
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
          autoFocus={autoFocus ?? false}
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
                      <button
                        type="button"
                        onMouseDown={() => goToListing(s.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                      >
                        <span className="truncate font-medium">{s.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatBirr(s.price)}
                        </span>
                      </button>
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
    </>
  );
}

export function SiteHeader() {
  const { user, profile, signOut } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [mobileSearch, setMobileSearch] = useState(false);
  const { data: isAdmin } = useQuery(isAdminQuery(user?.id));

  const NAV: readonly { to: string; label: string }[] = [
    { to: "/browse", label: t("nav.browse") },
    { to: "/categories", label: t("nav.categories") },
    { to: "/safety", label: t("nav.safety") },
    // Admins get the dashboard in the main nav, not just the account menu.
    ...(isAdmin ? [{ to: "/admin", label: t("nav.admin") }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 font-display text-xl font-semibold tracking-tight"
        >
          <img
            src="/logo-mark.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-auto"
            // Above the fold on every page, so don't defer it.
            loading="eager"
          />
          {/* Wordmark hides on very narrow phones so bell/profile/burger stay
              on screen without horizontal panning. */}
          <span className="hidden min-[400px]:inline">
            Addis<span className="text-primary">Home</span>
          </span>
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
          <SearchBox />
        </div>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-2 sm:gap-2">
          {/* Phone-width search: the field itself doesn't fit beside the logo,
              so it opens as a second header row (item 12). */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t("nav.searchPlaceholder")}
            aria-expanded={mobileSearch}
            onClick={() => setMobileSearch((v) => !v)}
          >
            {mobileSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </Button>

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
                  {/* The user's own picture: shop logo for sellers, avatar for
                      individuals; the person silhouette only when they have no
                      photo. Guests get the neutral avatar since they're not
                      signed in. */}
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("nav.accountMenu")}
                    /* shrink-0: when the desktop search bar takes its space,
                        flex must not squeeze the avatar into an ellipse. */
                    className="size-9 shrink-0 overflow-hidden rounded-full p-0"
                  >
                    {profile?.shop_logo_url || profile?.avatar_url ? (
                      <UserAvatar
                        name={profile.shop_name ?? profile.full_name}
                        avatarUrl={profile.shop_logo_url ?? profile.avatar_url}
                        size={36}
                      />
                    ) : (
                      <DefaultAvatar />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">
                    {profile?.full_name ?? user.email}
                    {/* The email is the account identity; show it when a display
                        name is also present so the two aren't confused. */}
                    {profile?.full_name && user.email ? (
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {user.email}
                      </span>
                    ) : null}
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
                        <Shield className="mr-2 h-4 w-4 text-primary" /> {t("nav.admin")}
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
            <Button
              asChild
              variant="outline"
              size="icon"
              className="size-9 shrink-0 overflow-hidden rounded-full p-0"
              aria-label={t("nav.signIn")}
            >
              <Link to="/auth">
                <DefaultAvatar />
              </Link>
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
                {/* Account shortcuts — the app's profile quick actions,
                    so notifications and saved items stay one tap away on
                    phones even though the bottom bar holds only five tabs. */}
                {user ? (
                  <>
                    <div className="mt-4 border-t pt-3">
                      <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t("nav.accountMenu")}
                      </p>
                      <Link
                        to="/notifications"
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
                      >
                        <Bell className="h-4 w-4" /> {t("nav.notifications")}
                      </Link>
                      <Link
                        to="/favorites"
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
                      >
                        <Heart className="h-4 w-4" /> {t("nav.savedItems")}
                      </Link>
                      <Link
                        to="/dashboard"
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
                      >
                        <LayoutDashboard className="h-4 w-4" /> {t("nav.myShop")}
                      </Link>
                    </div>
                  </>
                ) : null}
                <div className="mt-4 px-3">
                  <LanguageToggle />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      {mobileSearch ? (
        <div className="mx-auto max-w-6xl px-4 pb-3 lg:hidden">
          <div className="relative">
            <SearchBox autoFocus onDone={() => setMobileSearch(false)} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
