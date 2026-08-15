import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notificationsQuery } from "@/lib/marketplace";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { formatBirr, timeAgo } from "@/lib/format";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  | "notif.offerReceived"
  | "notif.offerResponse"
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
  offer_received: "notif.offerReceived",
  offer_response: "notif.offerResponse",
  seller_verified: "notif.sellerVerified",
  seller_rejected: "notif.sellerRejected",
  report_resolved: "notif.reportResolved",
  report_dismissed: "notif.reportDismissed",
  shop_reviewed: "notif.shopReviewed",
};

/** Types that should open the inbox rather than the listing page. */
const MESSAGE_TYPES = new Set(["new_message", "callback_request", "callback_response"]);

/** Notification payload fields (subset of what the apps push through). */
type NotifPayload = {
  title?: string | null;
  listingId?: string | null;
  offerId?: string | null;
  conversationId?: string | null;
  buyerId?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  senderName?: string | null;
  messagePreview?: string | null;
  message?: string | null;
  note?: string | null;
  phone?: string | null;
  amount?: number | null;
  status?: string | null;
  shopSlug?: string | null;
  newPrice?: number | null;
  query?: string | null;
  rating?: number | null;
};

type Notif = {
  id: string;
  type: string;
  payload: NotifPayload | null;
  is_read: boolean;
  created_at: string;
};

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
  const [detail, setDetail] = useState<Notif | null>(null);

  /** Vars for the {placeholder} notification templates — shared by the list
   * rows, the detail-dialog heading and the header bell so nothing ever
   * renders a raw template. */
  const templateVars = (n: Notif) =>
    n.type === "price_drop"
      ? {
          title: n.payload?.title ?? "",
          price: n.payload?.newPrice ? `ETB ${n.payload.newPrice}` : "",
        }
      : n.type === "saved_search_match"
        ? { title: n.payload?.title ?? "", query: n.payload?.query ?? "" }
        : n.type === "callback_response"
          ? { status: n.payload?.status ?? "" }
          : n.type === "offer_received"
            ? {
                title: n.payload?.title ?? "",
                amount: n.payload?.amount ? `ETB ${n.payload.amount}` : "",
              }
            : n.type === "offer_response"
              ? { title: n.payload?.title ?? "", status: n.payload?.status ?? "" }
              : { title: n.payload?.title ?? "" };

  /** Label/value rows for the detail dialog, driven by the payload. */
  const detailRows = (n: Notif) => {
    const p = n.payload ?? {};
    const from = p.buyerName || p.senderName || "";
    const rows: { label: string; value: string }[] = [];
    if (from) rows.push({ label: t("notif.from"), value: from });
    if (p.amount != null)
      rows.push({ label: t("notif.amount"), value: formatBirr(Number(p.amount)) });
    if (p.phone) rows.push({ label: t("notif.phone"), value: p.phone });
    if (p.buyerPhone) rows.push({ label: t("notif.phone"), value: p.buyerPhone });
    if (p.message) rows.push({ label: t("notif.message"), value: p.message });
    if (p.note) rows.push({ label: t("notif.note"), value: p.note });
    if (p.messagePreview) rows.push({ label: t("notif.message"), value: p.messagePreview });
    if (p.status) rows.push({ label: t("notif.status"), value: p.status });
    if (n.type === "shop_reviewed") {
      if (p.rating != null) rows.push({ label: t("notif.rating"), value: `${p.rating}/5` });
      if (p.title) rows.push({ label: t("notif.review"), value: p.title });
    }
    return rows;
  };

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
            const vars = templateVars(n);
            const body = t(key, vars);
            const inner = (
              <>
                <p className={n.is_read ? "text-muted-foreground" : "font-medium"}>{body}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
              </>
            );
            // Conversation-related alerts go straight to the conversation
            // (or the inbox when no conversation id travelled with it); an
            // offer alert lands on the dashboard's exact offer row when the
            // offer id is known, falling back to its chat thread then the
            // plain dashboard; everything else points at the listing.
            const target =
              n.type === "new_message" && n.payload?.conversationId
                ? ({
                    to: "/messages",
                    search: { conv: n.payload.conversationId },
                  } as const)
                : n.type === "offer_received" && n.payload?.offerId
                  ? ({
                      to: "/dashboard",
                      search: { offer: n.payload.offerId ?? undefined },
                    } as const)
                  : (n.type === "offer_received" || n.type === "offer_response") &&
                      n.payload?.conversationId
                    ? ({
                        to: "/messages",
                        search: { conv: n.payload.conversationId },
                      } as const)
                    : n.type === "offer_received"
                      ? ({ to: "/dashboard" } as const)
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
                  onClick={() => {
                    setDetail(n);
                    if (!n.is_read) markRead.mutate(n.id);
                  }}
                  aria-label={t("notif.showDetails")}
                  title={t("notif.showDetails")}
                  className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Eye className="h-4 w-4" />
                </button>
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

      {/* Details — who, when, and every payload field for the tapped alert. */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {detail ? t(TYPE_KEY[detail.type] ?? "notif.newMessage", templateVars(detail)) : ""}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${new Date(detail.created_at).toLocaleDateString()} · ${new Date(detail.created_at).toLocaleTimeString()}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              {detailRows(detail).map((row) => (
                <div key={row.label} className="flex gap-3 border-b pb-2 last:border-0">
                  <span className="w-28 shrink-0 text-muted-foreground">{row.label}</span>
                  <span className="min-w-0 break-words">{row.value}</span>
                </div>
              ))}
              {(() => {
                const p = detail.payload ?? {};
                const isConversation =
                  (detail.type === "new_message" ||
                    detail.type === "offer_received" ||
                    detail.type === "offer_response") &&
                  !!p.conversationId;
                const to =
                  detail.type === "offer_received" && p.offerId
                    ? ({ to: "/dashboard", search: { offer: p.offerId ?? undefined } } as const)
                    : isConversation
                      ? ({ to: "/messages", search: { conv: p.conversationId } } as const)
                      : detail.type === "offer_received"
                        ? ({ to: "/dashboard" } as const)
                        : p.shopSlug
                          ? ({ to: "/shop/$slug", params: { slug: p.shopSlug } } as const)
                          : p.listingId
                            ? ({ to: "/listing/$id", params: { id: p.listingId } } as const)
                            : null;
                return to ? (
                  <Button asChild className="mt-2 w-full" onClick={() => setDetail(null)}>
                    <Link {...to}>
                      {isConversation
                        ? t("notif.openConversation")
                        : detail.type === "offer_received"
                          ? t("notif.openDashboard")
                          : p.shopSlug
                            ? t("notif.openShop")
                            : t("notif.openListing")}
                    </Link>
                  </Button>
                ) : null;
              })()}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
