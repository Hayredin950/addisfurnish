import { useEffect, useMemo, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import {
  createListing,
  fetchCategories,
  fetchListingForEdit,
  replaceListingImages,
  updateListing,
  updateProfile,
  uploadListingImage,
} from "../../lib/api";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { colors, radius, spacing, shadows } from "../../lib/theme";
import { coordsForSubCity } from "../../lib/format";

const CONDITIONS = ["New", "Used - Like New", "Used - Good", "Used - Fair"];
const ROOM_TYPES = ["Living Room", "Bedroom", "Dining", "Office", "Outdoor", "Kitchen"];
const CITIES = ["Addis Ababa", "Dire Dawa", "Hawassa", "Bahir Dar", "Mekelle", "Adama", "Gondar"];

type Photo = { uri: string; name: string; isExisting?: boolean };

export default function SellScreen() {
  const params = useLocalSearchParams<{ edit?: string }>();
  const editId = typeof params.edit === "string" && params.edit ? params.edit : undefined;
  const { user, profile, refreshProfile } = useAuth();
  const { t, lang } = useLang();
  const cats = useAsync(fetchCategories, []);
  const editing = useAsync(
    () => (editId ? fetchListingForEdit(editId) : Promise.resolve(null)),
    [editId],
  );

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
  const [photos, setPhotos] = useState<Photo[]>([]);
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

  // Edit mode: seed the form once the listing (and categories) load.
  const item = editing.data;
  useEffect(() => {
    if (!item || !editId) return;
    setTitle(item.title);
    setDesc(item.description);
    setPrice(String(item.price));
    setOriginalPrice(item.original_price ? String(item.original_price) : "");
    setNegotiable(item.negotiable);
    setCondition(item.condition);
    setCategoryId(item.category_id);
    setCity(item.city);
    setSubCity(item.sub_city ?? "");
    setMaterial(item.material ?? "");
    setColor(item.color ?? "");
    setRoomType(item.room_type ?? ROOM_TYPES[0]!);
    setBrand(item.brand ?? "");
    setDeliveryOffered(item.delivery_offered);
    setDeliveryFee(item.delivery_fee != null ? String(item.delivery_fee) : "");
    const expires = item.discount_expires_at ? new Date(item.discount_expires_at).getTime() : null;
    setDiscountDays(
      expires && expires > Date.now()
        ? String(Math.max(1, Math.round((expires - Date.now()) / 86_400_000)))
        : "",
    );
    const existing = [...(item.listing_images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((img) => ({ uri: img.url, name: `existing-${img.id}.jpg`, isExisting: true }));
    setPhotos(existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, editId]);

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
      // Upload only the newly picked photos (existing ones are already stored).
      const newPaths = await Promise.all(
        photos
          .filter((p) => !p.isExisting)
          .map((p) => uploadListingImage(user.id, p)),
      );
      const finalUrls = photos.map((p) => (p.isExisting ? p.uri : newPaths.shift()!));

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

      const patch = {
        title: title.trim(),
        description: desc.trim(),
        price: priceNum,
        original_price: originalPrice ? Number(originalPrice) : null,
        negotiable,
        condition,
        material: material.trim() || null,
        color: color.trim() || null,
        room_type: roomType,
        brand: brand.trim() || null,
        city,
        sub_city: subCity.trim() || null,
        category_id: categoryId,
        delivery_offered: deliveryOffered,
        delivery_fee: deliveryOffered && deliveryFee ? Number(deliveryFee) : null,
        discount_expires_at: discountExpiresAt,
        latitude: lat,
        longitude: lon,
      };

      let id: string;
      if (editId && item) {
        id = editId;
        await updateListing(id, patch);
        await replaceListingImages(id, finalUrls);
      } else {
        id = await createListing({
          sellerId: user.id,
          title: patch.title,
          description: patch.description,
          price: patch.price,
          originalPrice: patch.original_price,
          negotiable: patch.negotiable,
          condition: patch.condition,
          material: patch.material,
          color: patch.color,
          roomType: patch.room_type,
          brand: patch.brand,
          city: patch.city,
          subCity: patch.sub_city,
          categoryId: patch.category_id,
          deliveryOffered: patch.delivery_offered,
          deliveryFee: patch.delivery_fee,
          discountExpiresAt: patch.discount_expires_at,
          latitude: patch.latitude,
          longitude: patch.longitude,
          imagePaths: finalUrls,
        });
      }
      setPhotos([]);
      setTitle("");
      setDesc("");
      setPrice("");
      if (editId) {
        router.back();
      } else {
        router.push(`/listing/${id}`);
      }
    } catch {
      Alert.alert(t("oops"));
    } finally {
      setPublishing(false);
    }
  };

  const removePhoto = (index: number) => setPhotos((prev) => prev.filter((_, j) => j !== index));

  const isEditLoading = !!editId && editing.loading && !item;

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

  if (isEditLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{t("loading")}</Text>
      </View>
    );
  }

  if (editId && !item) {
    return (
      <View style={styles.center}>
        <Text style={styles.oops}>{t("oops")}</Text>
        <Button title={t("back")} variant="outline" onPress={() => router.back()} style={{ marginTop: 16 }} />
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
        <Text style={styles.heading}>
          {editId ? `${t("edit")} · ${item?.title ?? ""}` : t("listFurniture")}
        </Text>

        {/* Photos */}
        <View style={styles.card}>
          <Text style={styles.label}>{t("photos")}</Text>
          <View style={styles.photoRow}>
            {photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.photoThumb}>
                <Image source={{ uri: p.uri }} style={styles.photoThumbImg} />
                <Pressable
                  style={styles.photoRemove}
                  onPress={() => removePhoto(i)}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </Pressable>
                {p.isExisting ? (
                  <View style={styles.photoBadge}>
                    <Ionicons name="cloud-done" size={10} color="#fff" />
                  </View>
                ) : null}
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
            title={
              publishing
                ? t("publishing")
                : editId
                  ? t("save")
                  : t("publish")
            }
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
  loadingText: { fontSize: 14, color: colors.textMuted },
  oops: { fontSize: 16, color: colors.textMuted },
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
  photoBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    width: 18,
    height: 18,
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
