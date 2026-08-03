import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function FavoriteButton({ listingId }: { listingId: string }) {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: favorites } = useQuery({
    queryKey: ["favorites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("favorites").select("listing_id");
      if (error) throw error;
      return (data ?? []).map((f) => f.listing_id);
    },
  });

  const isFavorite = !!favorites?.includes(listingId);

  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      if (isFavorite) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("listing_id", listingId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ listing_id: listingId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: () => toast.error(t("toast.requestFailed")),
  });

  return (
    <button
      type="button"
      aria-label={isFavorite ? t("favBtn.remove") : t("favBtn.save")}
      aria-pressed={isFavorite}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          toast.info(t("toast.signInToSave"));
          navigate({ to: "/auth" });
          return;
        }
        toggle.mutate();
      }}
      className="grid h-8 w-8 place-items-center rounded-full bg-card/90 backdrop-blur transition-colors hover:bg-card"
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-colors",
          isFavorite ? "fill-primary text-primary" : "text-muted-foreground",
        )}
      />
    </button>
  );
}
