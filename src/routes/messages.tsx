import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
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

function Messages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const { data: conversations } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id,last_message_at,buyer_id,seller_id,listings(title)")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const current = activeId ?? conversations?.[0]?.id ?? null;

  const { data: messages } = useQuery({
    queryKey: ["messages", current],
    enabled: !!current,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id,body,sender_id,created_at")
        .eq("conversation_id", current!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

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
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">Messages</h1>
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
              <span className="block font-medium">
                {(c.listings as { title: string } | null)?.title ?? "Listing"}
              </span>
              <span className="text-xs text-muted-foreground">{timeAgo(c.last_message_at)}</span>
            </button>
          ))}
          {conversations?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          ) : null}
        </aside>

        <section className="flex min-h-[420px] flex-col rounded-lg border bg-card p-4">
          <div className="flex-1 space-y-3 overflow-y-auto">
            {(messages ?? []).map((m) => (
              <div
                key={m.id}
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  m.sender_id === user?.id
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-secondary"
                }`}
              >
                {m.body}
              </div>
            ))}
          </div>
          {current ? (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (body.trim()) send.mutate();
              }}
            >
              <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message" />
              <Button type="submit" disabled={send.isPending}>
                Send
              </Button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}
