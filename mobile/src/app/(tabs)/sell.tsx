import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { createListing, fetchCategories, updateProfile, uploadListingImage } from "../../lib/api";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { colors, radius, spacing, shadows } from "../../lib/theme";
import { coordsForSubCity } from "../../lib/format";

const CONDITIONS = ["New", "Used - Like New", "Used - Good", "Used - Fair"];
const ROOM_TYPES = ["Living Room", "Bedroom", "Dining", "Office", "Outdoor", "Kitchen"];
const CITIES = ["Addis Ababa", "Dire Dawa", "Hawassa", "Bahir Dar", "Mekelle", "Adama", "Gondar"];

export default function SellScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const { t, lang } = useLang();
  const cats = useAsync(fetchCategories, []);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [negotiable, setNegotiable] = useState(true);
  const [condition, setCondition] = useState(CONDITIONS[0]!);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [city, setCity] = useState(CITIES[0]!);
  const [subCity, setSubCity] = useState("");
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [roomType, setRoomType] = useState(ROOM_TYPES[0]!);
  const [brand, setBrand] = useState("");
  const [deliveryOffered, setDeliveryOffered] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [discountDays, setDiscountDays] = useState("");
  const [photos, setPhotos] = useState<{ uri: string; name: string }[]>([]);
  const [publishing, setPublishing] = useState(false);

  const isSeller = !!profile?.is_seller;

  // Gate: "become a seller" needs shop fields; allow creating them inline here.
  const [shopName, setShopName] = useState(profile?.shop_name ?? "");
  const [shopSlug, setShopSlug] = useState(profile?.shop_slug ?? "");
  const [creatingShop, setCreatingShop] = useState(false);

  useEffect(() => {
    if (profile?.is_seller) {
      setShopName(profile.shop_name ?? "");
      setShopSlug(profile.shop_slug ?? "");
    }
  }, [profile]);

  const pickPhotos = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.8,
    });
    if (res.canceled) return;
    const picked = (res.assets ?? []).map((a) => ({
      uri: a.uri,
      name: a.fileName ?? `photo-${Date.now()}.jpg`,
    }));
    setPhotos((prev) => [...prev, ...picked].slice(0, 6));
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled) return;
    const a = res.assets?.[0];
    if (!a) return;
    setPhotos((prev) => [...prev, { uri: a.uri, name: a.fileName ?? "camera.jpg" }].slice(0, 6));
  };

  const createShop = async () => {
    if (!user) return;
    if (!shopName.trim() || !shopSlug.trim()) {
      Alert.alert(t("titleRequired"));
      return;
    }
    setCreatingShop(true);
    try {
      await updateProfile(user.id, {
        is_seller: true,
        shop_name: shopName.trim(),
        shop_slug: shopSlug
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-"),
      });
      await refreshProfile();
    } catch {
      Alert.alert(t("oops"));
    } finally {
      setCreatingShop(false);
    }
  };

  const publish = async () => {
    if (!user || !profile?.is_seller) return;
    if (!title.trim()) {
      Alert.alert(t("titleRequired"));
      return;
    }
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) {
      Alert.alert(t("priceRequired"));
      return;
    }
    setPublishing(true);
    try {
      // Upload photos first (parallel), then insert the listing.
      const paths = await Promise.all(photos.map((p) => uploadListingImage(user.id, p)));
      let lat: number | null = null;
      let lon: number | null = null;
      const coords = coordsForSubCity(subCity.trim() || null);
      if (city === "Addis Ababa" && coords) {
        [lat, lon] = coords;
      } else {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
          }
        } catch {
          // location unavailable — leave coordinates null
        }
      }
      const discountExpiresAt = discountDays
        ? new Date(Date.now() + Number(discountDays) * 86_400_000).toISOString()
        : null;

      const id = await createListing({
        sellerId: user.id,
        title: title.trim(),
        description: desc.trim(),
        price: priceNum,
        originalPrice: originalPrice ? Number(originalPrice) : null,
        negotiable,
        condition,
        material: material.trim() || null,
        color: color.trim() || null,
        roomType,
        brand: brand.trim() || null,
        city,
        subCity: subCity.trim() || null,
        categoryId,
        deliveryOffered,
        deliveryFee: deliveryOffered && deliveryFee ? Number(deliveryFee) : null,
        discountExpiresAt,
        latitude: lat,
        longitude: lon,
        imagePaths: paths,
      });
      setPhotos([]);
      setTitle("");
      setDesc("");
      setPrice("");
      router.push(`/listing/${id}`);
    } catch {
      Alert.alert(t("oops"));
    } finally {
      setPublishing(false);
    }
  };

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

  if (!isSeller) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.xl }}>
        <View style={styles.gateCard}>
          <View style={styles.gateIcon}>
            <Ionicons name="storefront" size={34} color={colors.primary} />
          </View>
          <Text style={styles.gateTitle}>{t("sellGateTitle")}</Text>
          <Text style={styles.gateHint}>{t("sellGateHint")}</Text>
          <Field label={t("shopName")} value={shopName} onChange={setShopName} />
          <Field
            label={t("shopSlug")}
            value={shopSlug}
            onChange={setShopSlug}
            autoCapitalize="none"
          />
          <Button
            title={t("createShop")}
            onPress={createShop}
            loading={creatingShop}
            disabled={creatingShop}
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <Text style={styles.heading}>{t("listFurniture")}</Text>

        {/* Photos */}
        <View style={styles.card}>
          <Text style={styles.label}>{t("photos")}</Text>
          <View style={styles.photoRow}>
            {photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.photoThumb}>
                <Image source={{ uri: p.uri }} style={styles.photoThumbImg} />
                <Pressable
                  style={styles.photoRemove}
                  onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < 6 ? (
              <>
                <Pressable style={styles.photoAdd} onPress={pickPhotos}>
                  <Ionicons name="images" size={22} color={colors.primary} />
                  <Text style={styles.photoAddText}>{t("chooseGallery")}</Text>
                </Pressable>
                <Pressable style={styles.photoAdd} onPress={takePhoto}>
                  <Ionicons name="camera" size={22} color={colors.primary} />
                  <Text style={styles.photoAddText}>{t("takePhoto")}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>

        {/* Title / category */}
        <View style={styles.card}>
          <Field label={t("title")} value={title} onChange={setTitle} />
          <Text style={styles.label}>{t("category")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {(cats.data ?? []).map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, categoryId === c.id && styles.chipActive]}
                onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
              >
                <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>
                  {lang === "am" ? (c.name_am ?? c.name) : c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.label}>{t("condition")}</Text>
          <View style={styles.chipWrap}>
            {CONDITIONS.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, condition === c && styles.chipActive]}
                onPress={() => setCondition(c)}
              >
                <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Price */}
        <View style={styles.card}>
          <Text style={styles.label}>{t("price")}</Text>
          <View style={styles.priceRow}>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder={t("minPrice")}
              keyboardType="number-pad"
              placeholderTextColor={colors.textSoft}
              style={styles.priceInput}
            />
            <TextInput
              value={originalPrice}
              onChangeText={setOriginalPrice}
              placeholder={t("originalPrice")}
              keyboardType="number-pad"
              placeholderTextColor={colors.textSoft}
              style={styles.priceInput}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t("negotiable")}</Text>
            <Switch
              value={negotiable}
              onValueChange={setNegotiable}
              trackColor={{ true: colors.primary }}
            />
          </View>
          {originalPrice ? (
            <Field
              label={t("discountEnds") + " (" + t("discount") + ")"}
              value={discountDays}
              onChange={setDiscountDays}
            />
          ) : null}
        </View>

        {/* Location */}
        <View style={styles.card}>
          <Text style={styles.label}>{t("city")}</Text>
          <View style={styles.chipWrap}>
            {CITIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, city === c && styles.chipActive]}
                onPress={() => setCity(c)}
              >
                <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Field label={t("subCity")} value={subCity} onChange={setSubCity} />
        </View>

        {/* Attributes */}
        <View style={styles.card}>
          <Field label={t("material")} value={material} onChange={setMaterial} />
          <Field label={t("color")} value={color} onChange={setColor} />
          <Field label={t("brand")} value={brand} onChange={setBrand} />
          <Text style={styles.label}>{t("roomType")}</Text>
          <View style={styles.chipWrap}>
            {ROOM_TYPES.map((r) => (
              <Pressable
                key={r}
                style={[styles.chip, roomType === r && styles.chipActive]}
                onPress={() => setRoomType(r)}
              >
                <Text style={[styles.chipText, roomType === r && styles.chipTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Delivery */}
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t("deliveryOffered")}</Text>
            <Switch
              value={deliveryOffered}
              onValueChange={setDeliveryOffered}
              trackColor={{ true: colors.primary }}
            />
          </View>
          {deliveryOffered ? (
            <Field label={t("deliveryFee")} value={deliveryFee} onChange={setDeliveryFee} />
          ) : null}
        </View>

        {/* Description */}
        <View style={styles.card}>
          <Field label={t("description")} value={desc} onChange={setDesc} multiline />
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <Button
            title={publishing ? t("publishing") : t("publish")}
            onPress={publish}
            loading={publishing}
            disabled={publishing}
            size="lg"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  autoCapitalize?: "none";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={colors.textSoft}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={[styles.fieldInput, multiline && { minHeight: 80, textAlignVertical: "top" }]}
      />
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
    padding: 32,
  },
  heading: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    fontFamily: "Georgia, serif",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  gateCard: { alignItems: "stretch", marginTop: 20 },
  gateIcon: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },
  gateTitle: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  gateHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 18,
  },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 8, marginTop: 4 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 5, fontWeight: "600" },
  fieldInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoThumb: { width: 92, height: 92, borderRadius: radius.md, overflow: "hidden" },
  photoThumbImg: { width: 92, height: 92 },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: colors.overlay,
    borderRadius: radius.full,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  photoAdd: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.secondary,
  },
  photoAddText: {
    fontSize: 10.5,
    color: colors.primary,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 4,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12.5, color: colors.text },
  chipTextActive: { color: colors.onPrimary, fontWeight: "600" },
  priceRow: { flexDirection: "row", gap: 10 },
  priceInput: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  switchLabel: { fontSize: 14, color: colors.text, fontWeight: "600" },
});
