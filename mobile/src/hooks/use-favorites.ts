import { useCallback, useEffect, useState } from "react";
import { fetchFavoriteIds, toggleFavorite } from "../lib/api";
import { useAuth } from "../lib/auth";

/**
 * Shared favourite state for any screen that renders listing cards.
 *
 * The heart on <ListingCard> only renders when an `onToggleFav` handler is
 * passed, so every screen with cards needs this — previously only the Browse
 * tab wired it up and the heart was simply absent everywhere else, including
 * the Favourites tab itself (where un-favouriting was therefore impossible).
 *
 * Toggling updates local state optimistically and rolls back if the write
 * fails, so the heart never lies about what the server stored.
 */
export function useFavorites() {
  const { user } = useAuth();
  const [favIds, setFavIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    if (!user) {
      setFavIds([]);
      return;
    }
    try {
      setFavIds(await fetchFavoriteIds(user.id));
    } catch {
      // A failed read leaves the previous state; hearts stay as they were.
    }
  }, [user?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isFav = useCallback((listingId: string) => favIds.includes(listingId), [favIds]);

  const toggle = useCallback(
    async (listingId: string, currentlyFav: boolean) => {
      if (!user) return;
      // Optimistic: the heart flips immediately, before the round trip.
      setFavIds((prev) =>
        currentlyFav ? prev.filter((x) => x !== listingId) : [...prev, listingId],
      );
      try {
        await toggleFavorite(user.id, listingId, currentlyFav);
      } catch {
        setFavIds((prev) =>
          currentlyFav ? [...prev, listingId] : prev.filter((x) => x !== listingId),
        );
      }
    },
    [user?.id],
  );

  return { favIds, isFav, toggle, reload };
}
