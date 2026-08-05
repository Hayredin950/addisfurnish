import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { fetchFavorites } from "../../lib/api";
import { ListingCard } from "../../components/ListingCard";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../lib/theme";

export default function FavoritesScreen() {
  const { user } = useAuth();
  const { t, lang } = useLang();

  const { data, loading, error, refetch } = useAsync(
    () => fetchFavorites(user?.id ?? ""),
    [user?.id],
    !!user,
  );

  // Guests can reach this tab now that browsing is public, and favourites are
  // per-account — so prompt instead of showing a permanently empty list.
  if (!user) {
    return (
      <View style={styles.center}>
        <EmptyState title={t("notSignedIn")} hint={t("signInPrompt")} />
        <Button
          title={t("signIn")}
          onPress={() => router.push("/auth")}
          style={{ marginTop: 16 }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {loading && !data ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title={error ? t("noConnection") : t("emptyFavorites")}
          hint={error ? t("retry") : t("emptyFavoritesHint")}
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: 12 }}
          renderItem={({ item }) => <ListingCard listing={item} lang={lang} />}
          onRefresh={refetch}
          refreshing={loading && !!data}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
});
