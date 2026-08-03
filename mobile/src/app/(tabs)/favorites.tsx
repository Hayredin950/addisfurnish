import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { fetchFavorites } from "../../lib/api";
import { ListingCard } from "../../components/ListingCard";
import { EmptyState } from "../../components/EmptyState";
import { colors, spacing } from "../../lib/theme";

export default function FavoritesScreen() {
  const { user } = useAuth();
  const { t, lang } = useLang();

  const { data, loading, error, refetch } = useAsync(
    () => fetchFavorites(user?.id ?? ""),
    [user?.id],
    !!user,
  );

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
          columnWrapperStyle={{ justifyContent: "space-between" }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
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
});
