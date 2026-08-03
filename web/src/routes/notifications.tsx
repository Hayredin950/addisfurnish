import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notificationsQuery } from "@/lib/marketplace";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — SuqBet" },
      { name: "description", content: "Messages, callback requests and price updates." },
      { property: "og:title", content: "Notifications — SuqBet" },
      { property: "og:description", content: "Your SuqBet activity." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <NotificationsPage />
    </RequireAuth>
  ),
});

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
> = {
  new_message: "notif.newMessage",
  callback_request: "notif.callbackRequest",
  listing_sold: "notif.listingSold",
  price_drop: "notif.priceDrop",
  saved_search_match: "notif.savedSearchMatch",
  callback_response: "notif.callbackResponse",
  seller_verified: "notif.sellerVerified",
  seller_rejected: "notif.sellerRejected",
};

function NotificationsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: notifications } = useQuery(notificationsQuery(user?.id ?? ""));

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = (notifications ?? []).filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-3xl font-semibold">
          <Bell className="h-6 w-6 text-primary" /> {t("nav.notifications")}
        </h1>
        {unread > 0 ? (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="mr-1.5 h-4 w-4" /> {t("notif.markRead")}
          </Button>
        ) : null}
      </div>

      <div className="mt-8 space-y-2">
        {(notifications ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            {t("notif.empty")}
          </p>
        ) : (
          (notifications ?? []).map((n) => {
            const key = TYPE_KEY[n.type] ?? "notif.newMessage";
            const vars =
              n.type === "price_drop"
                ? {
                    title: n.payload?.title ?? "",
                    price: n.payload?.newPrice ? `ETB ${n.payload.newPrice}` : "",
                  }
                : n.type === "saved_search_match"
                  ? { title: n.payload?.title ?? "", query: n.payload?.query ?? "" }
                  : n.type === "callback_response"
                    ? { status: n.payload?.status ?? "" }
                    : { title: n.payload?.title ?? "" };
            const body = t(key, vars);
            const inner = (
              <>
                <p className={n.is_read ? "text-muted-foreground" : "font-medium"}>{body}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
              </>
            );
            return n.payload?.listingId ? (
              <Link
                key={n.id}
                to="/listing/$id"
                params={{ id: n.payload.listingId }}
                onClick={() => {
                  if (!n.is_read) markRead.mutate(n.id);
                }}
                className={`block rounded-lg border bg-card p-4 text-sm transition-colors hover:border-primary ${
                  n.is_read ? "opacity-70" : ""
                }`}
              >
                {inner}
              </Link>
            ) : (
              <div
                key={n.id}
                className={`rounded-lg border bg-card p-4 text-sm ${n.is_read ? "opacity-70" : ""}`}
              >
                {inner}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
