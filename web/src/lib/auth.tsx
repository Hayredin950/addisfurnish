import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  is_seller: boolean;
  shop_name: string | null;
  shop_slug: string | null;
  shop_description: string | null;
  shop_logo_url: string | null;
  shop_address: string | null;
  verified: boolean;
  is_online: boolean;
  last_seen: string;
  phone_verified_at: string | null;
  whatsapp: string | null;
  telegram: string | null;
  preferred_language: string;
  registration_number: string | null;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      queryClient.invalidateQueries();
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  // Online status heartbeat: while signed in, mark profile online and refresh
  // last_seen every 60s so buyers can see whether a seller is currently active.
  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    const beat = () => {
      supabase
        .from("profiles")
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq("id", uid)
        .then(() => {});
    };
    beat();
    const interval = window.setInterval(beat, 60_000);
    const markOffline = () => {
      supabase
        .from("profiles")
        .update({ is_online: false })
        .eq("id", uid)
        .then(() => {});
    };
    window.addEventListener("beforeunload", markOffline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", markOffline);
      markOffline();
    };
  }, [session]);

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      profile: profile ?? null,
      signOut: async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
      },
    }),
    [session, loading, profile, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
