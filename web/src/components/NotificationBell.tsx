import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notificationsQuery } from "@/lib/marketplace";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TYPE_KEY: Record<
  string,
  | "notif.newMessage"
  | "notif.callbackRequest"
  | "notif.listingSold"
  | "notif.priceDrop"
  | "notif.savedSearchMatch"
  | "notif.callbackResponse"
  | "notif.sellerVerified"
  | "notif.sellerRejected"
  | "notif.shopReviewed"
> = {
  new_message: "notif.newMessage",
  callback_request: "notif.callbackRequest",
  listing_sold: "notif.listingSold",
  price_drop: "notif.priceDrop",
  saved_search_match: "notif.savedSearchMatch",
  callback_response: "notif.callbackResponse",
  seller_verified: "notif.sellerVerified",
  seller_rejected: "notif.sellerRejected",
  shop_reviewed: "notif.shopReviewed",
};

export function NotificationBell() {
  const { user } = useAuth();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: notifications } = useQuery(notificationsQuery(user?.id ?? ""));

  // Live badge: refetch when a realtime INSERT lands, so the unread count and
  // list stay in sync with the mobile app without a page reload.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-bell-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unread = (notifications ?? []).filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (!error) queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("nav.notifications")}
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("nav.notifications")}</span>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs font-normal text-primary"
            >
              <CheckCheck className="h-3.5 w-3.5" /> {t("notif.markRead")}
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {(notifications ?? []).length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t("notif.empty")}
            </p>
          ) : (
            (notifications ?? []).slice(0, 8).map((n) => {
              const title = n.payload?.title ?? "";
              const key = TYPE_KEY[n.type] ?? "notif.newMessage";
              const vars =
                n.type === "price_drop"
                  ? { title, price: n.payload?.newPrice ? `ETB ${n.payload.newPrice}` : "" }
                  : n.type === "saved_search_match"
                    ? { title, query: n.payload?.query ?? "" }
                    : n.type === "callback_response"
                      ? { status: n.payload?.status ?? "" }
                      : { title };
              // Deep-link straight to what the notification is about — the
              // same targets the /notifications page uses.
              const link =
                n.type === "new_message" && n.payload?.conversationId
                  ? ({ to: "/messages", search: { conv: n.payload.conversationId } } as const)
                  : n.type === "shop_reviewed" &&
                      (n.payload as { shopSlug?: string } | null)?.shopSlug
                    ? ({
                        to: "/shop/$slug",
                        params: { slug: (n.payload as { shopSlug: string }).shopSlug },
                      } as const)
                    : n.payload?.listingId
                      ? ({ to: "/listing/$id", params: { id: n.payload.listingId } } as const)
                      : null;
              const row = (
                <div className="border-b px-3 py-2.5 text-sm last:border-0">
                  <p className={`leading-snug ${n.is_read ? "opacity-60" : ""}`}>{t(key, vars)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
              );
              return link ? (
                <Link key={n.id} {...link} className="block">
                  {row}
                </Link>
              ) : (
                <div key={n.id} className={`${n.is_read ? "opacity-60" : ""}`}>
                  {row}
                </div>
              );
            })
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="p-1.5">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to="/notifications">{t("nav.notifications")}</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
