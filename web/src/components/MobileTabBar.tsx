import { Link } from "@tanstack/react-router";
import { Home, Search, PlusCircle, MessageCircle, User } from "lucide-react";
import { useLang } from "@/lib/i18n";

/**
 * Bottom tab bar for small screens — mirrors the mobile app's five tabs
 * (Home, Browse, Sell, Messages, Profile) so the web app on a phone behaves
 * like the native app. Hidden once the desktop header nav takes over (`lg`).
 */
export function MobileTabBar() {
  const { t } = useLang();

  const TABS: {
    to: "/" | "/browse" | "/sell" | "/messages" | "/profile";
    label: string;
    icon: typeof Home;
    exact?: boolean;
  }[] = [
    { to: "/", label: t("nav.home"), icon: Home, exact: true },
    { to: "/browse", label: t("nav.browse"), icon: Search },
    { to: "/sell", label: t("nav.sell"), icon: PlusCircle },
    { to: "/messages", label: t("nav.messages"), icon: MessageCircle },
    { to: "/profile", label: t("nav.profile"), icon: User },
  ];

  const linkClass =
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-muted-foreground transition-colors";
  const activeClass = "text-primary";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur lg:hidden"
      aria-label={t("nav.accountMenu")}
    >
      <div className="mx-auto flex max-w-6xl items-stretch">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const common = { className: linkClass };
          // exactOptionalPropertyTypes: only attach activeOptions when needed.
          return tab.exact ? (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: true }}
              className={linkClass}
              activeProps={{ className: `${linkClass} ${activeClass}` }}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          ) : (
            <Link
              key={tab.to}
              to={tab.to}
              {...common}
              activeProps={{ className: `${linkClass} ${activeClass}` }}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
