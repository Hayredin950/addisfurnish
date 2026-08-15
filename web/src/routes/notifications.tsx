import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";
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
      { title: "Notifications — AddisFurnish" },
      { name: "description", content: "Messages, callback requests and price updates." },
      { property: "og:title", content: "Notifications — AddisFurnish" },
      { property: "og:description", content: "Your AddisFurnish activity." },
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
  | "notif.reportResolved"
  | "notif.reportDismissed"
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
  report_resolved: "notif.reportResolved",
  report_dismissed: "notif.reportDismissed",
  shop_reviewed: "notif.shopReviewed",
};

/** Types that should open the inbox rather than the listing page. */
const MESSAGE_TYPES = new Set(["new_message", "callback_request", "callback_response"]);

function NotificationsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { data: notifications } = useQuery(notificationsQuery(user?.id ?? ""));

  // Live delivery — refetch whenever a realtime INSERT lands for this user, so
  // the web inbox stays in sync with the mobile app (mobile does the same).
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-web-${user.id}`)
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

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (error: Error) => toast.error(error.message),
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
            // Conversation-related alerts go straight to the conversation
            // (or the inbox when no conversation id travelled with it);
            // everything else points at the listing it concerns.
            const target =
              n.type === "new_message" && n.payload?.conversationId
                ? ({
                    to: "/messages",
                    search: { conv: n.payload.conversationId },
                  } as const)
                : MESSAGE_TYPES.has(n.type)
                  ? ({ to: "/messages" } as const)
                  : n.type === "shop_reviewed" &&
                      (n.payload as { shopSlug?: string } | null)?.shopSlug
                    ? ({
                        to: "/shop/$slug",
                        params: { slug: (n.payload as { shopSlug: string }).shopSlug },
                      } as const)
                    : n.payload?.listingId
                      ? ({ to: "/listing/$id", params: { id: n.payload.listingId } } as const)
                      : null;

            return (
              <div
                key={n.id}
                className={`flex items-start gap-2 rounded-lg border bg-card p-4 text-sm transition-colors ${
                  n.is_read ? "opacity-70" : ""
                } ${target ? "hover:border-primary" : ""}`}
              >
                {target ? (
                  <Link
                    {...target}
                    onClick={() => {
                      if (!n.is_read) markRead.mutate(n.id);
                    }}
                    className="min-w-0 flex-1"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{inner}</div>
                )}
                <button
                  type="button"
                  onClick={() => dismiss.mutate(n.id)}
                  aria-label={t("notif.dismiss")}
                  title={t("notif.dismiss")}
                  className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
