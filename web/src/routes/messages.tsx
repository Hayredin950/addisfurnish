import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { RequireAuth } from "@/components/RequireAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — SuqBet" },
      { name: "description", content: "Chat with buyers and sellers about furniture listings." },
      { property: "og:title", content: "Messages — SuqBet" },
      { property: "og:description", content: "Your SuqBet conversations." },
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
  listings: { title: string } | null;
  buyer: Participant;
  seller: Participant;
};

type Message = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

function Messages() {
  const { user } = useAuth();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const { data: conversations } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Both participant FKs point at profiles, so each embed names its
      // constraint — an unqualified `profiles(...)` would be ambiguous.
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id,last_message_at,buyer_id,seller_id,listings(title)," +
            "buyer:profiles!conversations_buyer_id_fkey(id,full_name,avatar_url)," +
            "seller:profiles!conversations_seller_id_fkey(id,full_name,avatar_url)",
        )
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });

  const current = activeId ?? conversations?.[0]?.id ?? null;

  const { data: messages } = useQuery({
    queryKey: ["messages", current],
    enabled: !!current,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id,body,sender_id,created_at,profiles!messages_sender_id_fkey(full_name,avatar_url)",
        )
        .eq("conversation_id", current!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Message[];
    },
  });

  const activeConversation = (conversations ?? []).find((c) => c.id === current);
  /** The other participant — whichever side of the conversation isn't me. */
  const counterpart = activeConversation
    ? activeConversation.buyer_id === user?.id
      ? activeConversation.seller
      : activeConversation.buyer
    : null;

  // Live delivery: the messages table is on the realtime publication, so new
  // incoming messages appear without a manual refresh.
  useEffect(() => {
    if (!current) return;
    const channel = supabase
      .channel(`messages-${current}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
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

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: current!, sender_id: user!.id, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["messages", current] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{t("nav.messages")}</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          {(conversations ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`w-full rounded-md border p-3 text-left text-sm ${
                c.id === current ? "border-primary bg-secondary/50" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                {(() => {
                  // Show who you're talking to, not your own side.
                  const other = c.buyer_id === user?.id ? c.seller : c.buyer;
                  return (
                    <UserAvatar name={other?.full_name} avatarUrl={other?.avatar_url} size={28} />
                  );
                })()}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {(c.listings as { title: string } | null)?.title ?? t("msg.listing")}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {(c.buyer_id === user?.id ? c.seller : c.buyer)?.full_name ?? ""} ·{" "}
                    {timeAgo(c.last_message_at)}
                  </span>
                </span>
              </span>
            </button>
          ))}
          {conversations?.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("msg.noConversations")}</p>
          ) : null}
        </aside>

        <section className="flex min-h-[420px] flex-col rounded-lg border bg-card p-4">
          {counterpart ? (
            <header className="mb-3 flex items-center gap-2 border-b pb-3">
              <UserAvatar name={counterpart.full_name} avatarUrl={counterpart.avatar_url} />
              <span className="text-sm font-medium">{counterpart.full_name}</span>
            </header>
          ) : null}
          <div className="flex-1 space-y-3 overflow-y-auto">
            {(messages ?? []).map((m) => {
              const mine = m.sender_id === user?.id;
              const sender = m.profiles as {
                full_name: string | null;
                avatar_url: string | null;
              } | null;
              return (
                <div
                  key={m.id}
                  className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
                >
                  <UserAvatar name={sender?.full_name} avatarUrl={sender?.avatar_url} size={28} />
                  <div className="max-w-[75%]">
                    <span
                      className={`block text-[11px] text-muted-foreground ${
                        mine ? "text-right" : "text-left"
                      }`}
                    >
                      {sender?.full_name ?? ""} · {timeAgo(m.created_at)}
                    </span>
                    <div
                      className={`mt-0.5 rounded-lg px-3 py-2 text-sm ${
                        mine ? "bg-primary text-primary-foreground" : "bg-secondary"
                      }`}
                    >
                      {m.body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {current ? (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (body.trim()) send.mutate();
              }}
            >
              <Input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("msg.write")}
              />
              <Button type="submit" disabled={send.isPending}>
                {t("msg.send")}
              </Button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}
