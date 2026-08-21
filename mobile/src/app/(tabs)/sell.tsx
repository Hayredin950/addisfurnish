import { useEffect, useState } from "react";
import {
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
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import {
  createListing,
  deleteCloudinaryAssets,
  fetchCategories,
  fetchListingForEdit,
  replaceListingImages,
  updateListing,
  updateProfile,
  uploadListingImage,
  uploadListingVideo,
} from "../../lib/api";
import { Button } from "../../components/Button";
import { CalendarPicker } from "../../components/CalendarPicker";
import { DraggablePinMap } from "../../components/DraggablePinMap";
import { useToast } from "../../components/Toast";
import { EmptyState } from "../../components/EmptyState";
import { colors, radius, spacing, shadows } from "../../lib/theme";
import { coordsForSubCity } from "../../lib/format";
import { imageSource } from "../../lib/storage";
import { uniqueShopSlug } from "../../lib/slug";

const CONDITIONS = ["New", "Used - Like New", "Used - Good", "Used - Fair"];
const ROOM_TYPES = ["Living Room", "Bedroom", "Dining", "Office", "Outdoor", "Kitchen"];
const CITIES = ["Addis Ababa", "Dire Dawa", "Hawassa", "Bahir Dar", "Mekelle", "Adama", "Gondar"];
const MATERIALS = [
  "Wood",
  "Oak",
  "Mahogany",
  "Pine",
  "MDF",
  "Metal",
  "Iron",
  "Steel",
  "Leather",
  "Fabric",
  "Rattan",
  "Bamboo",
  "Glass",
  "Plastic",
];

type Photo = { uri: string; name: string; isExisting?: boolean };

export default function SellScreen() {
  const params = useLocalSearchParams<{ edit?: string }>();
  const editId = typeof params.edit === "string" && params.edit ? params.edit : undefined;
  const { user, profile, refreshProfile } = useAuth();
  const { t, lang } = useLang();
  const toast = useToast();
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
  // Discount expiry — picked from a calendar, not typed.
  const [discountDate, setDiscountDate] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  // One optional short showcase video (≤ ~60s). isExisting marks a video
  // already uploaded on this listing in edit mode — its uri is then a storage
  // path to keep, not a local file to upload.
  const [video, setVideo] = useState<{ uri: string; name: string; isExisting?: boolean } | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Listing location — defaults to the shop location; the seller can move the
  // pin or use their current location (web parity).
  const [lat, setLat] = useState<number | null>(profile?.latitude ?? null);
  const [lon, setLon] = useState<number | null>(profile?.longitude ?? null);
  // Category picker: a root category, then an optional child of it.
  const [rootCategoryId, setRootCategoryId] = useState<string | null>(null);
  // Material: pick from the list, or choose "Custom…" to type one.
  const [materialCustom, setMaterialCustom] = useState(false);

  const isSeller = !!profile?.is_seller;

  // Gate: "become a seller" needs shop fields; allow creating them inline here.
  const [shopName, setShopName] = useState(profile?.shop_name ?? "");
  const [creatingShop, setCreatingShop] = useState(false);

  useEffect(() => {
    if (profile?.is_seller) {
      setShopName(profile.shop_name ?? "");
    }
  }, [profile]);

  // Default the listing location to the shop's saved location.
  useEffect(() => {
    if (profile?.latitude != null && profile?.longitude != null) {
      setLat(profile.latitude);
      setLon(profile.longitude);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

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
    setDiscountDate(item.discount_expires_at ?? null);
    setLat(item.latitude ?? null);
    setLon(item.longitude ?? null);
    setVideo(
      item.video_url ? { uri: item.video_url, name: "existing-video.mp4", isExisting: true } : null,
    );
    if (item.material) setMaterialCustom(!MATERIALS.includes(item.material));
    const existing = [...(item.listing_images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((img) => ({ uri: img.url, name: `existing-${img.id}.jpg`, isExisting: true }));
    setPhotos(existing);
    // Seed the root/subcategory pickers from the listing's category.
    const catId = item.category_id;
    if (catId) {
      const cat = (cats.data ?? []).find((c) => c.id === catId);
      if (cat) {
        setRootCategoryId(cat.parent_id ?? cat.id);
        setCategoryId(cat.parent_id ? cat.id : null);
      }
    }
  }, [item, editId, cats.data]);

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

  const pickVideo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: false,
    });
    if (res.canceled) return;
    const a = res.assets?.[0];
    if (!a) return;
    // ImagePicker reports video length in seconds; cap at 60s so the listing
    // stays a quick showcase, not a full clip.
    if (a.duration != null && a.duration > 60) {
      toast.error(null, t("videoTooLong"));
      return;
    }
    setVideo({ uri: a.uri, name: a.fileName ?? `video-${Date.now()}.mp4` });
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
    if (!shopName.trim()) {
      toast.error(null, t("titleRequired"));
      return;
    }
    setCreatingShop(true);
    try {
      await updateProfile(user.id, {
        is_seller: true,
        shop_name: shopName.trim(),
        // The slug is derived from the name so the seller never has to think
        // about it (it only feeds shop URLs).
        shop_slug: await uniqueShopSlug(shopName),
      });
      await refreshProfile();
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setCreatingShop(false);
    }
  };

  const publish = async () => {
    if (!user || !profile?.is_seller) return;
    if (!title.trim()) {
      toast.error(null, t("titleRequired"));
      return;
    }
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) {
      toast.error(null, t("priceRequired"));
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

      // A newly picked video gets uploaded; an existing one keeps its stored
      // path; none means the field is cleared.
      let videoUrl: string | null = null;
      if (video) {
        videoUrl = video.isExisting
          ? video.uri
          : await uploadListingVideo(user.id, video);
      }

      const discountExpiresAt = discountDate;

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
        // A root-only pick is the category itself; when a child is chosen it
        // wins. Never null if the seller picked anything.
        category_id: categoryId ?? rootCategoryId,
        delivery_offered: deliveryOffered,
        delivery_fee: deliveryOffered && deliveryFee ? Number(deliveryFee) : null,
        discount_expires_at: discountExpiresAt,
        latitude: lat,
        longitude: lon,
        video_url: videoUrl,
      };
      // If the seller never touched the pin and the shop has no location,
      // fall back to the sub-city centre (Addis Ababa) so listings still map.
      if (lat == null && lon == null && subCity.trim()) {
        const c = coordsForSubCity(subCity.trim());
        if (c) {
          patch.latitude = c[0];
          patch.longitude = c[1];
        }
      }

      let id: string;
      if (editId && item) {
        id = editId;
        // Photos removed in edit mode leave their Cloudinary assets behind —
        // replaceListingImages only touches the DB rows. Delete them here.
        const removedPhotos = (item.listing_images ?? [])
          .map((img) => img.url)
          .filter((url) => !finalUrls.includes(url));
        // A replaced or removed video orphans its Cloudinary asset too.
        const removedVideo = item.video_url && !video?.isExisting ? item.video_url : null;
        await updateListing(id, patch);
        await replaceListingImages(id, finalUrls);
        if (removedPhotos.length) void deleteCloudinaryAssets(removedPhotos);
        if (removedVideo) void deleteCloudinaryAssets([removedVideo]);
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
          videoUrl,
        });
      }
      setPhotos([]);
      setVideo(null);
      setTitle("");
      setDesc("");
      setPrice("");
      if (editId) {
        router.back();
      } else {
        router.push(`/listing/${id}`);
      }
    } catch (err) {
      toast.error(err, t("oops"));
    } finally {
      setPublishing(false);
    }
  };

  const saveDraft = async () => {
    if (!user || !profile?.is_seller) return;
    if (!title.trim()) {
      toast.error(null, t("titleRequired"));
      return;
    }
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) {
      toast.error(null, t("priceRequired"));
      return;
    }
    setPublishing(true);
    try {
      const newPaths = await Promise.all(
        photos
          .filter((p) => !p.isExisting)
          .map((p) => uploadListingImage(user.id, p)),
      );
      const finalUrls = photos.map((p) => (p.isExisting ? p.uri : newPaths.shift()!));
      let videoUrl: string | null = null;
      if (video) {
        videoUrl = video.isExisting ? video.uri : await uploadListingVideo(user.id, video);
      }
      const discountExpiresAt = discountDate;
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
        category_id: categoryId ?? rootCategoryId,
        delivery_offered: deliveryOffered,
        delivery_fee: deliveryOffered && deliveryFee ? Number(deliveryFee) : null,
        discount_expires_at: discountExpiresAt,
        latitude: lat,
        longitude: lon,
        video_url: videoUrl,
      };
      if (lat == null && lon == null && subCity.trim()) {
        const c = coordsForSubCity(subCity.trim());
        if (c) {
          patch.latitude = c[0];
          patch.longitude = c[1];
        }
      }
      await createListing({
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
        videoUrl,
        status: "draft",
      });
      toast.success(t("draftSaved"));
      setPhotos([]);
      setVideo(null);
      setTitle("");
      setDesc("");
      setPrice("");
    } catch (err) {
      toast.error(err, t("oops"));
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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                <Image source={imageSource(p.uri)} style={styles.photoThumbImg} />
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

          {/* Optional short showcase video (≤ 60s). */}
          <View style={{ marginTop: 14 }}>
            <Text style={styles.label}>{t("videoLabel")}</Text>
            {video ? (
              <View style={styles.videoRow}>
                <View style={styles.videoInfo}>
                  <Ionicons name="videocam" size={18} color={colors.primary} />
                  <Text style={styles.videoName} numberOfLines={1}>
                    {video.isExisting ? t("videoCurrent") : video.name}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setVideo(null)}
                  hitSlop={8}
                  style={styles.videoRemove}
                >
                  <Ionicons name="close" size={15} color={colors.danger} />
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.videoAdd} onPress={pickVideo}>
                <Ionicons name="videocam-outline" size={18} color={colors.primary} />
                <Text style={styles.videoAddText}>{t("videoAdd")}</Text>
              </Pressable>
            )}
            <Text style={styles.videoHint}>{t("videoHint")}</Text>
          </View>
        </View>

        {/* Title / category / condition — dropdowns keep the form compact. */}
        <View style={styles.card}>
          <Field label={t("title")} value={title} onChange={setTitle} />

          <Text style={styles.label}>{t("category")}</Text>
          {(() => {
            const all = cats.data ?? [];
            const roots = all.filter((c) => !c.parent_id);
            const children = all.filter((c) => c.parent_id === rootCategoryId);
            const catName = (c: { id: string; name: string; name_am: string | null }) =>
              lang === "am" ? (c.name_am ?? c.name) : c.name;
            return (
              <>
                <SelectField
                  label=""
                  value={
                    rootCategoryId ? catName(roots.find((c) => c.id === rootCategoryId)!) : ""
                  }
                  placeholder={t("selectRootCategory")}
                  options={roots.map((c) => ({ value: c.id, label: catName(c) }))}
                  onChange={(id) => {
                    setRootCategoryId(id);
                    // A child was selected under the old root — reset it.
                    setCategoryId(null);
                  }}
                />
                {children.length > 0 ? (
                  <SelectField
                    label=""
                    value={categoryId ? catName(children.find((c) => c.id === categoryId)!) : ""}
                    placeholder={t("selectSubCategory")}
                    options={children.map((c) => ({ value: c.id, label: catName(c) }))}
                    onChange={setCategoryId}
                  />
                ) : null}
              </>
            );
          })()}

          <SelectField
            label={t("condition")}
            value={condition}
            placeholder={t("condition")}
            options={CONDITIONS.map((c) => ({ value: c, label: c }))}
            onChange={setCondition}
          />
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
            <>
              <Text style={styles.label}>{t("discountEnds")}</Text>
              {/* Past dates are disabled by the picker itself. */}
              <CalendarPicker value={discountDate} onChange={setDiscountDate} />
            </>
          ) : null}
        </View>

        {/* Location — defaults to the shop's location; pin it or use GPS. */}
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
          <Text style={styles.label}>{t("setLocation")}</Text>
          <DraggablePinMap
            value={lat != null && lon != null ? { latitude: lat, longitude: lon } : null}
            onChange={(c) => {
              setLat(c?.latitude ?? null);
              setLon(c?.longitude ?? null);
            }}
          />
        </View>

        {/* Attributes */}
        <View style={styles.card}>
          <SelectField
            label={t("material")}
            value={!materialCustom && MATERIALS.includes(material) ? material : ""}
            placeholder={t("selectMaterial")}
            options={[
              ...MATERIALS.map((m) => ({ value: m, label: m })),
              { value: "__custom__", label: t("materialCustom") },
            ]}
            onChange={(v) => {
              if (v === "__custom__") {
                setMaterialCustom(true);
              } else {
                setMaterialCustom(false);
                setMaterial(v);
              }
            }}
          />
          {materialCustom ? (
            <Field label={t("materialCustom")} value={material} onChange={setMaterial} />
          ) : null}
          <Field label={t("color")} value={color} onChange={setColor} />
          <Field label={t("brand")} value={brand} onChange={setBrand} />
          <SelectField
            label={t("roomType")}
            value={roomType}
            placeholder={t("roomType")}
            options={ROOM_TYPES.map((r) => ({ value: r, label: r }))}
            onChange={setRoomType}
          />
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

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: 10 }}>
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
          {!editId ? (
            <Button
              title={t("saveDraft")}
              variant="outline"
              onPress={saveDraft}
              loading={publishing}
              disabled={publishing}
            />
          ) : null}
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

/**
 * Compact dropdown selector — one row showing the current value; tapping it
 * expands the options inline. Saves vertical space vs. always-on chip grids.
 */
function SelectField<T extends string>({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable style={styles.select} onPress={() => setOpen((o) => !o)}>
        <Text style={[styles.selectText, !value && { color: colors.textSoft }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>
      {open ? (
        <View style={styles.selectOptions}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              style={[styles.selectOption, value === o.value && styles.selectOptionActive]}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <Text
                style={[
                  styles.selectOptionText,
                  value === o.value && styles.selectOptionTextActive,
                ]}
              >
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectText: { fontSize: 14, color: colors.text, flex: 1 },
  selectOptions: {
    marginTop: 6,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  selectOption: { paddingHorizontal: 12, paddingVertical: 11 },
  selectOptionActive: { backgroundColor: colors.primaryLight },
  selectOptionText: { fontSize: 13.5, color: colors.text },
  selectOptionTextActive: { color: colors.primary, fontWeight: "700" },
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
  videoAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.secondary,
    alignSelf: "flex-start",
  },
  videoAddText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  videoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  videoInfo: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  videoName: { fontSize: 13, color: colors.text, fontWeight: "600", flex: 1 },
  videoRemove: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.dangerLight,
    alignItems: "center",
    justifyContent: "center",
  },
  videoHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 6 },
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
