import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { RequireAuth } from "@/components/RequireAuth";
import { uploadListingImage } from "@/lib/storage";
import { categoriesQuery } from "@/lib/marketplace";
import { CITIES, CONDITIONS, MATERIALS, ROOM_TYPES, SUB_CITY_COORDS } from "@/lib/format";
import { postListingToTelegram } from "@/lib/telegram";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/sell")({
  head: () => ({
    meta: [
      { title: "Post an Item — Sell Used Furniture | SuqBet" },
      {
        name: "description",
        content:
          "List your used furniture for free: add photos, set a price in Birr and reach buyers across Ethiopia.",
      },
      { property: "og:title", content: "Post an Item — SuqBet" },
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
  const { data: categories } = useQuery(categoriesQuery);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const subCity = (form.get("sub_city") as string) || null;
      const coords = subCity ? SUB_CITY_COORDS[subCity.trim()] : null;
      const discountExpiry = (form.get("discount_expires_at") as string) || null;
      const deliveryFeeRaw = form.get("delivery_fee") as string;
      const { data: listing, error } = await supabase
        .from("listings")
        .insert({
          seller_id: user!.id,
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
          status: "active",
          discount_expires_at: discountExpiry
            ? new Date(discountExpiry + "T23:59:59").toISOString()
            : null,
          delivery_offered: form.get("delivery_offered") === "on",
          delivery_fee: deliveryFeeRaw ? Number(deliveryFeeRaw) : null,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      for (let i = 0; i < files.length; i++) {
        const path = await uploadListingImage(user!.id, files[i]!);
        await supabase
          .from("listing_images")
          .insert({ listing_id: listing.id, url: path, position: i });
      }

      // Fire-and-forget: post to the public Telegram channel when configured.
      void postListingToTelegram({ data: { listingId: listing.id } });

      toast.success(t("toast.listingLive"));
      navigate({ to: "/listing/$id", params: { id: listing.id } });
    } catch {
      toast.error(t("toast.couldNotPublish"));
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{t("sell.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("sell.subtitle")}</p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <Field
          label={t("sell.titleLabel")}
          name="title"
          required
          placeholder="3-seat leather sofa"
        />
        <div className="space-y-2">
          <Label htmlFor="description">{t("sell.description")}</Label>
          <Textarea id="description" name="description" rows={5} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sell.price")} name="price" type="number" required />
          <Field label={t("sell.originalPrice")} name="original_price" type="number" />
        </div>
        <div className="flex items-center gap-3">
          <Switch id="negotiable" name="negotiable" />
          <Label htmlFor="negotiable">{t("sell.negotiable")}</Label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="discount_expires_at">{t("sell.discountExpiry")}</Label>
            <Input id="discount_expires_at" name="discount_expires_at" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delivery_fee">{t("sell.deliveryFee")}</Label>
            <Input id="delivery_fee" name="delivery_fee" type="number" min={0} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="delivery_offered" name="delivery_offered" />
          <Label htmlFor="delivery_offered">{t("sell.delivery")}</Label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("sell.category")}
            name="category_id"
            options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectField
            label={t("sell.condition")}
            name="condition"
            required
            options={CONDITIONS.map((c) => ({ value: c, label: c }))}
          />
          <SelectField
            label={t("sell.material")}
            name="material"
            options={MATERIALS.map((c) => ({ value: c, label: c }))}
          />
          <SelectField
            label={t("sell.room")}
            name="room_type"
            options={ROOM_TYPES.map((c) => ({ value: c, label: c }))}
          />
          <SelectField
            label={t("sell.city")}
            name="city"
            required
            options={CITIES.map((c) => ({ value: c, label: c }))}
          />
          <Field label={t("sell.subCity")} name="sub_city" />
          <Field label={t("sell.colour")} name="color" />
          <Field label={t("sell.brand")} name="brand" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="photos">{t("sell.photos")}</Label>
          <Input
            id="photos"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <p className="text-xs text-muted-foreground">
            {t("sell.photosSelected", { count: files.length })}
          </p>
        </div>

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t("sell.publishing") : t("sell.publish")}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} placeholder={placeholder} />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  required,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue=""
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
