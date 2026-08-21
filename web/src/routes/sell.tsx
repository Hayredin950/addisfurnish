import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { RequireAuth } from "@/components/RequireAuth";
import { LocationPicker, type Coords } from "@/components/LocationPicker";
import { PhotoPicker, type ExistingPhoto } from "@/components/PhotoPicker";
import { deleteCloudinaryAssets, uploadListingImage, uploadListingVideo } from "@/lib/storage";
import { categoriesQuery } from "@/lib/marketplace";
import { CITIES, CONDITIONS, MATERIALS, ROOM_TYPES, SUB_CITY_COORDS } from "@/lib/format";
import { announceListing, syncListingChannel } from "@/lib/telegram";
import { ChevronDown, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/sell")({
  // `?edit=<listing-id>` turns this page into an editor for an existing listing.
  validateSearch: (search: Record<string, unknown>): { edit?: string } =>
    typeof search["edit"] === "string" && search["edit"] ? { edit: search["edit"] } : {},
  head: () => ({
    meta: [
      { title: "Post an Item — Sell Used Furniture | AddisHome" },
      {
        name: "description",
        content:
          "List your used furniture for free: add photos, set a price in Birr and reach buyers across Ethiopia.",
      },
      { property: "og:title", content: "Post an Item — AddisHome" },
      { property: "og:description", content: "Free listings for second-hand furniture sellers." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Sell />
    </RequireAuth>
  ),
});

function Sell() {
  const { user, profile, loading } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const { data: categories } = useQuery(categoriesQuery);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  // One optional short showcase video (≤ 60s). In edit mode the stored video
  // is kept unless the seller removes it.
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoRemove, setVideoRemove] = useState(false);
  // Edit mode: photos already on the listing, and pending changes to them.
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);

  // Edit mode: load the listing being edited. Restricted to the owner so the
  // form can't be used to view someone else's draft.
  const { data: editing, isLoading: loadingEdit } = useQuery({
    queryKey: ["listing-edit", editId],
    enabled: !!editId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*, listing_images(id,url,position)")
        .eq("id", editId!)
        .eq("seller_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  /** Existing photos minus pending removals, cover-first. */
  const existingPhotos = useMemo(() => {
    const rows = (editing?.listing_images ?? []) as ExistingPhoto[];
    const kept = rows
      .filter((p) => !removedPhotoIds.includes(p.id))
      .sort((a, b) => a.position - b.position);
    if (!coverPhotoId) return kept;
    const promoted = kept.find((p) => p.id === coverPhotoId);
    return promoted ? [promoted, ...kept.filter((p) => p.id !== coverPhotoId)] : kept;
  }, [editing, removedPhotoIds, coverPhotoId]);
  // Seed the pin from the shop location so sellers don't re-enter it per listing.
  // Memoised so the object identity is stable across renders (it's an effect dep).
  const shopLocation = useMemo(
    () =>
      profile?.latitude != null && profile?.longitude != null
        ? { latitude: profile.latitude, longitude: profile.longitude }
        : null,
    [profile?.latitude, profile?.longitude],
  );
  const [coords, setCoords] = useState<Coords | null>(null);
  // `profile`/`editing` arrive after the first render. Seed once, preferring the
  // listing's own pin over the shop default.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    if (editing?.latitude != null && editing?.longitude != null) {
      seeded.current = true;
      setCoords({ latitude: editing.latitude, longitude: editing.longitude });
    } else if (!editId && shopLocation) {
      seeded.current = true;
      setCoords(shopLocation);
    }
  }, [editing, editId, shopLocation]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const subCity = (form.get("sub_city") as string) || null;
      // An explicit map pin wins; otherwise fall back to the sub-city centroid.
      const fallback = subCity ? SUB_CITY_COORDS[subCity.trim()] : null;
      const picked = coords ?? fallback ?? null;
      const discountExpiry = (form.get("discount_expires_at") as string) || null;
      const deliveryFeeRaw = form.get("delivery_fee") as string;
      // Upload the showcase video first (it fails the whole submit, unlike a
      // photo miss which only warns). A removed video stays removed.
      let videoUrl: string | null = null;
      if (videoFile) {
        videoUrl = await uploadListingVideo(user!.id, videoFile);
      } else if (editId && editing?.video_url && !videoRemove) {
        videoUrl = editing.video_url;
      }
      // A removed or replaced video leaves its Cloudinary asset behind.
      if (editId && editing?.video_url && (videoRemove || videoFile)) {
        void deleteCloudinaryAssets([editing.video_url]);
      }
      const values = {
        title: String(form.get("title")),
        description: String(form.get("description")),
        price: Number(form.get("price")),
        original_price: form.get("original_price") ? Number(form.get("original_price")) : null,
        negotiable: form.get("negotiable") === "on",
        condition: String(form.get("condition")),
        material: (form.get("material") as string) || null,
        color: (form.get("color") as string) || null,
        room_type: (form.get("room_type") as string) || null,
        brand: (form.get("brand") as string) || null,
        city: String(form.get("city")),
        sub_city: subCity,
        category_id: (form.get("category_id") as string) || null,
        discount_expires_at: discountExpiry
          ? new Date(discountExpiry + "T23:59:59").toISOString()
          : null,
        delivery_offered: form.get("delivery_offered") === "on",
        delivery_fee: deliveryFeeRaw ? Number(deliveryFeeRaw) : null,
        latitude: picked?.latitude ?? null,
        longitude: picked?.longitude ?? null,
        video_url: videoUrl,
      };

      let listing: { id: string };
      if (editId) {
        const { data, error } = await supabase
          .from("listings")
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq("id", editId)
          .eq("seller_id", user!.id)
          .select("id")
          .single();
        if (error) throw error;
        listing = data;
      } else {
        const { data, error } = await supabase
          .from("listings")
          .insert({ ...values, seller_id: user!.id, status: "active" })
          .select("id")
          .single();
        if (error) throw error;
        listing = data;
      }

      // The listing row exists from here on, so an image failure must not be
      // reported as "could not publish" — warn instead and still navigate.
      let imagesFailed = false;

      if (editId) {
        // Apply photo removals first so positions below stay contiguous.
        if (removedPhotoIds.length) {
          const doomed = ((editing?.listing_images ?? []) as ExistingPhoto[]).filter((p) =>
            removedPhotoIds.includes(p.id),
          );
          await supabase.from("listing_images").delete().in("id", removedPhotoIds);
          const paths = doomed.map((p) => p.url).filter((u) => !u.startsWith("http"));
          // Best-effort: an orphaned file is harmless, a failed delete is not.
          if (paths.length) await supabase.storage.from("listing-images").remove(paths);
          // Cloudinary photos leave with the DB rows.
          void deleteCloudinaryAssets(doomed.map((p) => p.url));
        }
        // Re-number the survivors so the chosen cover really is position 0.
        for (let i = 0; i < existingPhotos.length; i++) {
          const photo = existingPhotos[i]!;
          if (photo.position !== i) {
            await supabase.from("listing_images").update({ position: i }).eq("id", photo.id);
          }
        }
      }

      if (files.length) {
        // Append after whatever survived, so new photos never collide.
        const position = editId ? existingPhotos.length : 0;
        for (let i = 0; i < files.length; i++) {
          try {
            const path = await uploadListingImage(user!.id, files[i]!);
            await supabase
              .from("listing_images")
              .insert({ listing_id: listing.id, url: path, position: position + i });
          } catch {
            imagesFailed = true;
          }
        }
      }

      // Only announce brand-new listings to the channel; edits shouldn't
      // re-post, but the existing post's caption is re-rendered (price drop,
      // title change…).
      if (editId) syncListingChannel(listing.id);
      else announceListing(listing.id);

      if (imagesFailed) toast.error(t("toast.imageUploadFailed"));
      else toast.success(t(editId ? "toast.listingUpdated" : "toast.listingLive"));
      navigate({ to: "/listing/$id", params: { id: listing.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.couldNotPublish"));
    } finally {
      setBusy(false);
    }
  };

  // Spec §3: sellers can list immediately after creating a shop profile.
  // Wait for the profile to load so returning sellers don't see a flash.
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center text-sm text-muted-foreground">
        {t("browse.loading")}
      </div>
    );
  }
  if (!profile?.is_seller) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold">{t("sell.setupTitle")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t("sell.setupBody")}</p>
        <Button asChild className="mt-6">
          <Link to="/profile">{t("sell.setupCta")}</Link>
        </Button>
      </div>
    );
  }

  // Wait for the listing before rendering, so defaultValue lands on first paint.
  if (editId && loadingEdit) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center text-sm text-muted-foreground">
        {t("browse.loading")}
      </div>
    );
  }
  if (editId && !editing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold">{t("listing.notFoundTitle")}</h1>
        <Button asChild className="mt-6">
          <Link to="/dashboard">{t("nav.myShop")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">
        {editId ? t("listing.editTitle") : t("sell.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("sell.subtitle")}</p>

      <form className="mt-8 space-y-4" onSubmit={onSubmit} onInvalid={openInvalidSection}>
        {/* Photos & showcase video — first, like the mobile app. */}
        <SectionCard title={t("sell.photos")}>
          <PhotoPicker
            files={files}
            onFilesChange={setFiles}
            existing={existingPhotos}
            onRemoveExisting={(id) => setRemovedPhotoIds((prev) => [...prev, id])}
            onReorderExisting={setCoverPhotoId}
          />

          <div className="space-y-2">
            <Label>{t("video.label")}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="video"
                type="file"
                accept="video/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0] ?? null;
                  setVideoFile(null);
                  if (!file) return;
                  // Reject anything longer than 60s before it gets uploaded.
                  const ok = await videoWithinLimit(file);
                  if (!ok) {
                    toast.error(t("video.tooLong"));
                    e.target.value = "";
                    return;
                  }
                  setVideoFile(file);
                }}
              />
              {videoFile ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setVideoFile(null);
                    const el = document.getElementById("video") as HTMLInputElement | null;
                    if (el) el.value = "";
                  }}
                >
                  {t("video.remove")}
                </Button>
              ) : null}
              {editId && editing?.video_url && !videoRemove && !videoFile ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Video className="h-3.5 w-3.5 text-primary" /> {t("video.attached")}
                  <button
                    type="button"
                    className="ml-1 text-xs font-medium text-destructive underline"
                    onClick={() => setVideoRemove(true)}
                  >
                    {t("video.remove")}
                  </button>
                </span>
              ) : null}
              {videoRemove ? (
                <span className="text-sm text-destructive">{t("video.willRemove")}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t("video.hint")}</p>
          </div>
        </SectionCard>

        {/* What is it — title + description. */}
        <SectionCard title={t("sell.whatIsIt")}>
          <Field
            label={t("sell.titleLabel")}
            name="title"
            required
            placeholder="3-seat leather sofa"
            defaultValue={editing?.title ?? ""}
          />
          <div className="space-y-2">
            <Label htmlFor="description">{t("sell.description")}</Label>
            <Textarea
              id="description"
              name="description"
              rows={5}
              required
              defaultValue={editing?.description ?? ""}
            />
          </div>
        </SectionCard>

        {/* Category & condition. */}
        <SectionCard title={t("sell.categoryCondition")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t("sell.category")}
              name="category_id"
              defaultValue={editing?.category_id ?? ""}
              options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <SelectField
              label={t("sell.condition")}
              name="condition"
              required
              defaultValue={editing?.condition ?? ""}
              options={CONDITIONS.map((c) => ({ value: c, label: c }))}
            />
          </div>
        </SectionCard>

        {/* Price & delivery. */}
        <SectionCard title={t("sell.priceDelivery")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("sell.price")}
              name="price"
              type="number"
              required
              defaultValue={editing?.price != null ? String(editing.price) : ""}
            />
            <Field
              label={t("sell.originalPrice")}
              name="original_price"
              type="number"
              defaultValue={editing?.original_price != null ? String(editing.original_price) : ""}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="negotiable"
              name="negotiable"
              defaultChecked={editing?.negotiable ?? false}
            />
            <Label htmlFor="negotiable">{t("sell.negotiable")}</Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="discount_expires_at">{t("sell.discountExpiry")}</Label>
              <Input
                id="discount_expires_at"
                name="discount_expires_at"
                type="date"
                defaultValue={editing?.discount_expires_at?.slice(0, 10) ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery_fee">{t("sell.deliveryFee")}</Label>
              <Input
                id="delivery_fee"
                name="delivery_fee"
                type="number"
                min={0}
                defaultValue={editing?.delivery_fee != null ? String(editing.delivery_fee) : ""}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="delivery_offered"
              name="delivery_offered"
              defaultChecked={editing?.delivery_offered ?? false}
            />
            <Label htmlFor="delivery_offered">{t("sell.delivery")}</Label>
          </div>
        </SectionCard>

        {/* Location — city, area and the map pin. */}
        <SectionCard title={t("sell.location")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Falls back to the seller's profile city so it isn't retyped. */}
            <SelectField
              label={t("sell.city")}
              name="city"
              required
              defaultValue={editing?.city ?? profile?.city ?? ""}
              options={CITIES.map((c) => ({ value: c, label: c }))}
            />
            <Field
              label={t("sell.subCity")}
              name="sub_city"
              defaultValue={editing?.sub_city ?? profile?.shop_address ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("loc.pin")}</Label>
            <LocationPicker value={coords} onChange={setCoords} shopLocation={shopLocation} />
          </div>
        </SectionCard>

        {/* Attributes — material, room, colour, brand. */}
        <SectionCard title={t("sell.attributes")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t("sell.material")}
              name="material"
              defaultValue={editing?.material ?? ""}
              options={MATERIALS.map((c) => ({ value: c, label: c }))}
            />
            <SelectField
              label={t("sell.room")}
              name="room_type"
              defaultValue={editing?.room_type ?? ""}
              options={ROOM_TYPES.map((c) => ({ value: c, label: c }))}
            />
            <Field label={t("sell.colour")} name="color" defaultValue={editing?.color ?? ""} />
            <Field label={t("sell.brand")} name="brand" defaultValue={editing?.brand ?? ""} />
          </div>
        </SectionCard>

        <div className="flex gap-2">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t("sell.publishing") : editId ? t("action.saveChanges") : t("sell.publish")}
          </Button>
          {editId ? (
            <Button asChild type="button" variant="outline" size="lg">
              <Link to="/dashboard">{t("action.cancel")}</Link>
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

/**
 * One collapsible card in the sell form — mirrors the mobile app's card
 * grouping (photos → details → category → price → location → attributes) so
 * the web form reads the same on both breakpoints.
 */
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border bg-card p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
        <span>{title}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4 space-y-5">{children}</div>
    </details>
  );
}

/**
 * Native validation only fires on the first invalid control; if that control
 * sits inside a collapsed <details> section the browser can't focus it. Open
 * the section that contains the invalid field so the error is actually seen.
 */
function openInvalidSection(e: React.FormEvent<HTMLFormElement>) {
  const target = e.target as HTMLElement;
  const details = target.closest("details");
  if (details) details.open = true;
}

/** Loads a video's metadata and resolves true when it's ≤ 60 seconds. */
async function videoWithinLimit(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(el.duration <= 60);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      // Unreadable metadata — let the upload proceed; the player handles it.
      resolve(true);
    };
    el.src = url;
  });
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  required,
  defaultValue = "",
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
      >
        <option value="">{t("sell.select")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
