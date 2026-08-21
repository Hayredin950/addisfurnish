import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LanguageProvider, useLang } from "@/lib/i18n";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileTabBar } from "@/components/MobileTabBar";
import { Toaster } from "@/components/ui/sonner";

/** Applies the signed-in user's saved language once, unless they already picked one. */
function LanguageSync() {
  const { profile } = useAuth();
  const { lang, setLang } = useLang();
  const profileLang = profile?.preferred_language === "am" ? "am" : "en";
  useEffect(() => {
    if (!profile) return;
    const stored = window.localStorage.getItem("addisfurnish-lang");
    if (!stored && profileLang !== lang) setLang(profileLang);
  }, [profile, lang, profileLang, setLang]);
  return null;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

// Set VITE_SITE_URL at build time (e.g. https://addisfurnish.vercel.app) so social
// platforms resolve the og:image to an absolute URL. Falls back to a
// relative path when unset.
const siteUrl = (import.meta.env["VITE_SITE_URL"] as string | undefined) ?? "";
const ogImageUrl = `${siteUrl.replace(/\/+$/, "")}/og-image.png`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#AC451B" },
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AddisHome — Buy & Sell Used Furniture in Ethiopia" },
      {
        name: "twitter:description",
        content:
          "Browse thousands of second-hand sofas, beds, desks and dining sets from trusted shops across Addis Ababa. Free to list, free to message.",
      },
      { property: "og:image", content: ogImageUrl },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: ogImageUrl },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "48x48 32x32 16x16" },
      { rel: "icon", href: "/favicon-64.png", type: "image/png", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <LanguageSync />
          <div className="flex min-h-screen flex-col pb-14 lg:pb-0">
            <SiteHeader />
            <main className="flex-1">
              {/* Required: nested routes render here. */}
              <Outlet />
            </main>
            <SiteFooter />
          </div>
          <MobileTabBar />
          <Toaster richColors position="top-center" />
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
