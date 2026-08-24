import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, ExternalLink, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notifyUser } from "@/lib/marketplace";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { useDraft } from "@/lib/drafts";
import { uploadListingImage } from "@/lib/storage";
import { RequireAuth } from "@/components/RequireAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { ListingImage } from "@/components/ListingImage";
import { formatBirr, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — AddisHome" },
      { name: "description", content: "Chat with buyers and sellers about furniture listings." },
      { property: "og:title", content: "Messages — AddisHome" },
      { property: "og:description", content: "Your AddisHome conversations." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Messages />
    </RequireAuth>
  ),
});

/** A chat participant as embedded from `profiles`. */
type Participant = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  shop_name: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp: string | null;
} | null;

/**
 * Shapes for the aliased PostgREST embeds. The generated types can't infer
 * aliases (`buyer:profiles!fk(...)`), so the query result is cast to these.
 */
type Conversation = {
  id: string;
  last_message_at: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  listings: {
    id: string;
    title: string;
    price: number;
    status: string;
    listing_images: { url: string; position: number }[];
  } | null;
  buyer: Participant;
  seller: Participant;
};

type Message = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  read_at: string | null;
  image_url: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

function Messages() {
  const { user } = useAuth();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  // The message log is the scroll container now that the page itself doesn't
  // scroll, so newest-at-the-bottom has to be scrolled to explicitly.
  const logRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Both participant FKs point at profiles, so each embed names its
      // constraint — an unqualified `profiles(...)` would be ambiguous.
      // Rows deleted for *this* user are hidden (per-side soft delete).
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id,last_message_at,buyer_id,seller_id,listing_id," +
            "listings(id,title,price,status,listing_images(url,position))," +
            "buyer:profiles!conversations_buyer_id_fkey(id,full_name,avatar_url,shop_name,phone,telegram,whatsapp)," +
            "seller:profiles!conversations_seller_id_fkey(id,full_name,avatar_url,shop_name,phone,telegram,whatsapp)",
        )
        .or(
          `and(buyer_id.eq.${user!.id},buyer_deleted_at.is.null),and(seller_id.eq.${user!.id},seller_deleted_at.is.null)`,
        )
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });

  // Unread per conversation: messages from the other side with no read_at.
  const { data: unreadRows } = useQuery({
    queryKey: ["conversation-unread", user?.id],
    enabled: !!user && !!conversations?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id,id")
        .in(
          "conversation_id",
          (conversations ?? []).map((c) => c.id),
        )
        .neq("sender_id", user!.id)
        .is("read_at", null);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        counts.set(row.conversation_id, (counts.get(row.conversation_id) ?? 0) + 1);
      }
      return counts;
    },
  });

  // Deep link: opening /messages?conv=<id> selects that conversation.
  useEffect(() => {
    const convParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("conv")
        : null;
    if (convParam && conversations?.some((c) => c.id === convParam)) setActiveId(convParam);
  }, [conversations]);

  const current = activeId ?? conversations?.[0]?.id ?? null;

  // Unsent text is kept per conversation (item 42), so switching threads or
  // reloading no longer throws away a half-written message.
  const [body, setBody, clearBody] = useDraft(`msg:${current ?? "none"}`);

  const { data: messages } = useQuery({
    queryKey: ["messages", current],
    enabled: !!current,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id,body,sender_id,created_at,edited_at,deleted_at,read_at,image_url," +
            "profiles!messages_sender_id_fkey(full_name,avatar_url)",
        )
        .eq("conversation_id", current!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Message[];
    },
  });

  const activeConversation = (conversations ?? []).find((c) => c.id === current);

  // Jump to the newest message when the thread changes or a message arrives.
  // The log is the scroll container now, so this no longer happens for free.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [current, messages?.length]);

  /** The other participant — whichever side of the conversation isn't me. */
  const counterpart = activeConversation
    ? activeConversation.buyer_id === user?.id
      ? activeConversation.seller
      : activeConversation.buyer
    : null;

  const editMessage = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase
        .from("messages")
        .update({ body: text, edited_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      setEditBody("");
      queryClient.invalidateQueries({ queryKey: ["messages", current] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, t)),
  });

  /** Soft delete: the row stays so the other side sees a "deleted" placeholder. */
  const removeMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", current] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, t)),
  });

  // Mark the counterpart's messages read when the conversation is open. The DB
  // trigger rejects a sender marking their own message, so filter by sender.
  useEffect(() => {
    if (!current || !user || !messages?.length) return;
    const unread = messages.filter((m) => m.sender_id !== user.id && !m.read_at).map((m) => m.id);
    if (!unread.length) return;
    void supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["messages", current] });
        queryClient.invalidateQueries({ queryKey: ["conversation-unread"] });
      });
  }, [current, user, messages, queryClient]);

  // Live delivery: the messages table is on the realtime publication, so new
  // incoming messages appear without a manual refresh.
  useEffect(() => {
    if (!current) return;
    const channel = supabase
      .channel(`messages-${current}`)
      .on(
        "postgres_changes",
        {
          // "*" so edits, deletions and read receipts sync too, not just sends.
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${current}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", current] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [current, queryClient]);

  // The picked file is held locally and uploaded on send (mobile parity). It
  // used to upload on pick, inline, with no error check at all — so a failed
  // upload left the preview showing while `imageUrl` stayed null, and Send
  // remained disabled with no explanation.
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  /** Drops the staged attachment and releases its object URL. */
  const clearPendingImage = () => {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingFile(null);
  };

  // A staged attachment belongs to the conversation it was picked in.
  useEffect(() => {
    clearPendingImage();
  }, [current]);

  const send = useMutation({
    mutationFn: async () => {
      let imageUrl: string | null = null;
      if (pendingFile) {
        try {
          imageUrl = await uploadListingImage(user!.id, pendingFile);
        } catch (err) {
          // Rethrow with a marker so the toast says "image upload" instead of
          // the generic "could not be sent" — and the console keeps the cause.
          console.error("[chat] image upload failed", err);
          throw new Error(`image_upload_failed: ${err instanceof Error ? err.message : ""}`);
        }
      }
      const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: current!, sender_id: user!.id, body, image_url: imageUrl });
      if (error) throw error;
      // Notify the other party (mobile parity): this inserts the in-app
      // notification row, which also fans out to push + Telegram.
      if (activeConversation) {
        const recipientId =
          activeConversation.buyer_id === user!.id
            ? activeConversation.seller_id
            : activeConversation.buyer_id;
        const me =
          activeConversation.buyer_id === user!.id
            ? activeConversation.buyer
            : activeConversation.seller;
        await notifyUser(recipientId, "new_message", {
          title: activeConversation.listings?.title ?? "",
          listingId: activeConversation.listings?.id ?? "",
          conversationId: current!,
          senderName: me?.full_name || "",
          messagePreview: body || "[Image]",
        });
      }
    },
    onSuccess: () => {
      clearBody();
      clearPendingImage();
      queryClient.invalidateQueries({ queryKey: ["messages", current] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-unread"] });
    },
    // Keep the typed text and the staged image so the send can be retried.
    onError: (error: Error) => {
      if (error.message.startsWith("image_upload_failed")) {
        toast.error(t("msg.imageUploadFailed"));
        return;
      }
      // Surface the underlying reason (RLS, column, network…) alongside the
      // friendly line so failures are diagnosable instead of a dead end.
      const detail = friendlyError(error, t, "msg.sendFailed");
      toast.error(error.message ? `${detail} (${error.message})` : detail);
    },
  });

  /** Hide the conversation from the caller's own inbox. */
  const removeConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) throw new Error("auth");
      const { data: row } = await supabase
        .from("conversations")
        .select("buyer_id,seller_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (!row) return;
      const patch =
        row.buyer_id === user.id
          ? { buyer_deleted_at: new Date().toISOString() }
          : { seller_deleted_at: new Date().toISOString() };
      const { error } = await supabase.from("conversations").update(patch).eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      setActiveId(null);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-unread"] });
      toast.success(t("msg.conversationDeleted"));
    },
    onError: (error: Error) => toast.error(friendlyError(error, t)),
  });

  return (
    /*
     * Chat is a fixed-height app pane, not a document. The page used to be a
     * normal `py-12` column, so the composer sat below the fold and you had to
     * scroll the whole window to reach the input — and every new message pushed
     * it further down. Now the outer shell is pinned to the viewport minus the
     * sticky header (and minus the mobile tab bar), `overflow-hidden` stops the
     * window from scrolling, and the only scrollable regions are the
     * conversation list and the message log.
     *
     * 100dvh, not 100vh: on mobile browsers the dynamic unit accounts for the
     * collapsing URL bar, which otherwise cuts the composer off.
     */
    <div className="mx-auto flex h-[calc(100dvh-4rem-3.5rem)] max-w-5xl flex-col overflow-hidden px-4 py-4 lg:h-[calc(100dvh-4rem)] lg:py-6">
      <h1 className="shrink-0 font-display text-2xl font-semibold lg:text-3xl">
        {t("nav.messages")}
      </h1>
      <div className="mt-4 grid min-h-0 flex-1 gap-4 md:grid-cols-[260px_1fr] lg:mt-6 lg:gap-6">
        {/* Only this list scrolls, not the page. */}
        {/* Phones: one pane at a time — picking a conversation swaps the list
            for the chat, and the back arrow returns to the inbox. */}
        <aside
          className={`min-h-0 space-y-2 overflow-y-auto md:pr-1 ${activeId ? "hidden md:block" : ""}`}
        >
          {(conversations ?? []).map((c) => {
            const unread = unreadRows?.get(c.id) ?? 0;
            return (
              <div
                key={c.id}
                className={`group relative w-full rounded-md border p-3 text-left text-sm ${
                  c.id === current ? "border-primary bg-secondary/50" : ""
                } ${unread > 0 ? "border-primary/50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className="w-full text-left"
                >
                  <span className="flex items-center gap-2">
                    {(() => {
                      // Show who you're talking to, not your own side.
                      const other = c.buyer_id === user?.id ? c.seller : c.buyer;
                      return (
                        <UserAvatar
                          name={other?.full_name}
                          avatarUrl={other?.avatar_url}
                          size={28}
                        />
                      );
                    })()}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`block truncate ${
                            unread > 0 ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {(c.listings as { title: string } | null)?.title ?? t("msg.listing")}
                        </span>
                        {unread > 0 ? (
                          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {(c.buyer_id === user?.id ? c.seller : c.buyer)?.full_name ?? ""} ·{" "}
                        {timeAgo(c.last_message_at)}
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  title={t("msg.deleteConversation")}
                  onClick={() => removeConversation.mutate(c.id)}
                  className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted-foreground transition-opacity hover:bg-secondary hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {conversations?.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("msg.noConversations")}</p>
          ) : null}
        </aside>

        {activeId ? (
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground md:hidden"
          >
            ← {t("listing.back")}
          </button>
        ) : null}
        {/* min-h-0 is what lets the inner message log shrink and scroll instead
            of the section growing to fit every message. */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card p-4">
          {counterpart ? (
            <header className="mb-3 flex shrink-0 items-center gap-2 border-b pb-3">
              <UserAvatar name={counterpart.full_name} avatarUrl={counterpart.avatar_url} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {counterpart.full_name ?? counterpart.shop_name ?? ""}
                </span>
              </span>
              {/* Contact the other party directly, like on the listing page. */}
              <span className="flex shrink-0 flex-wrap gap-1.5">
                {counterpart.phone ? (
                  <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-xs">
                    <a href={`tel:${counterpart.phone}`}>
                      <Phone className="mr-1 h-3 w-3" /> {t("listing.call")}
                    </a>
                  </Button>
                ) : null}
                {counterpart.whatsapp ? (
                  <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-xs">
                    <a
                      href={`https://wa.me/${counterpart.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("listing.whatsapp")}
                    </a>
                  </Button>
                ) : null}
                {counterpart.telegram ? (
                  <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-xs">
                    <a
                      href={`https://t.me/${counterpart.telegram.replace(/^@/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("listing.telegram")}
                    </a>
                  </Button>
                ) : null}
              </span>
            </header>
          ) : null}

          {/* Which item this conversation is about — so a seller with several
              listings knows immediately without asking. */}
          {activeConversation?.listings ? (
            <Link
              to="/listing/$id"
              params={{ id: activeConversation.listings.id }}
              className="mb-3 flex shrink-0 items-center gap-3 rounded-lg border bg-secondary/40 p-2.5 transition-colors hover:border-primary"
            >
              <ListingImage
                path={
                  [...(activeConversation.listings.listing_images ?? [])].sort(
                    (a, b) => a.position - b.position,
                  )[0]?.url ?? null
                }
                alt={activeConversation.listings.title}
                className="h-12 w-12 shrink-0 rounded object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("msg.aboutItem")}
                </span>
                <span className="block truncate text-sm font-medium">
                  {activeConversation.listings.title}
                </span>
                <span className="block text-xs text-primary">
                  {formatBirr(activeConversation.listings.price)}
                </span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : null}

          <div ref={logRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {(messages ?? []).map((m) => {
              const mine = m.sender_id === user?.id;
              const sender = m.profiles;
              const deleted = !!m.deleted_at;
              const isEditing = editingId === m.id;
              return (
                <div
                  key={m.id}
                  className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
                >
                  <UserAvatar name={sender?.full_name} avatarUrl={sender?.avatar_url} size={28} />
                  <div className="max-w-[75%]">
                    <span
                      className={`block text-[11px] text-muted-foreground ${
                        mine ? "text-right" : "text-left"
                      }`}
                    >
                      {sender?.full_name ?? ""} · {timeAgo(m.created_at)}
                      {m.edited_at && !deleted ? ` · ${t("msg.edited")}` : ""}
                    </span>

                    {isEditing ? (
                      <form
                        className="mt-0.5 flex gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editBody.trim())
                            editMessage.mutate({ id: m.id, text: editBody.trim() });
                        }}
                      >
                        <Input
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <Button type="submit" size="sm" className="h-8" disabled={!editBody.trim()}>
                          {t("msg.saveEdit")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => setEditingId(null)}
                        >
                          {t("action.cancel")}
                        </Button>
                      </form>
                    ) : (
                      <div
                        className={`mt-0.5 rounded-lg px-3 py-2 text-sm ${
                          deleted
                            ? "border border-dashed bg-transparent italic text-muted-foreground"
                            : mine
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary"
                        }`}
                      >
                        {!deleted && m.image_url ? (
                          <img
                            src={m.image_url}
                            alt=""
                            className="mb-1 max-h-48 rounded-md object-cover"
                          />
                        ) : null}
                        {deleted ? t("msg.deletedPlaceholder") : m.body}
                      </div>
                    )}

                    <div
                      className={`mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground ${
                        mine ? "justify-end" : "justify-start"
                      }`}
                    >
                      {mine && !deleted ? (
                        <span className="inline-flex items-center gap-0.5">
                          {m.read_at ? (
                            <>
                              <CheckCheck className="h-3 w-3 text-primary" /> {t("msg.seen")}
                            </>
                          ) : (
                            <>
                              <Check className="h-3 w-3" /> {t("msg.sent")}
                            </>
                          )}
                        </span>
                      ) : null}
                      {/* Touch devices have no hover: actions stay visible;
                          on md+ they reveal on hover to keep the inbox tidy. */}
                      {mine && !deleted && !isEditing ? (
                        <span className="inline-flex gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                          <button
                            type="button"
                            className="hover:text-foreground"
                            onClick={() => {
                              setEditingId(m.id);
                              setEditBody(m.body);
                            }}
                          >
                            {t("msg.editAction")}
                          </button>
                          <button
                            type="button"
                            className="hover:text-destructive"
                            onClick={() => removeMessage.mutate(m.id)}
                          >
                            {t("msg.deleteAction")}
                          </button>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {current ? (
            <form
              className="mt-3 shrink-0 space-y-2 border-t pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (body.trim() || pendingFile) send.mutate();
              }}
            >
              {pendingImage ? (
                <div className="flex items-center gap-2 rounded-md border p-2">
                  <img src={pendingImage} alt="" className="h-12 w-12 rounded object-cover" />
                  <span className="flex-1 text-xs text-muted-foreground">
                    {send.isPending ? t("msg.imageUploading") : t("msg.imageAttached")}
                  </span>
                  <button
                    type="button"
                    onClick={clearPendingImage}
                    disabled={send.isPending}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <div className="flex gap-2">
                <label
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background ${
                    send.isPending
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer hover:bg-accent"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={send.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // Reset the input so re-picking the same file re-fires onChange.
                      e.target.value = "";
                      if (!file || !user) return;
                      if (!file.type.startsWith("image/")) {
                        toast.error(t("msg.imageInvalid"));
                        return;
                      }
                      clearPendingImage();
                      setPendingImage(URL.createObjectURL(file));
                      setPendingFile(file);
                    }}
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </label>
                <Input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t("msg.write")}
                />
                <Button type="submit" disabled={send.isPending || (!body.trim() && !pendingFile)}>
                  {send.isPending ? t("msg.sending") : t("msg.send")}
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}
