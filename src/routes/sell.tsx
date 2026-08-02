import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { uploadListingImage } from "@/lib/storage";
import { categoriesQuery } from "@/lib/marketplace";
import { CITIES, CONDITIONS, MATERIALS, ROOM_TYPES } from "@/lib/format";
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
        content: "List your used furniture for free: add photos, set a price in Birr and reach buyers across Ethiopia.",
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: categories } = useQuery(categoriesQuery);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
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
          sub_city: (form.get("sub_city") as string) || null,
          category_id: (form.get("category_id") as string) || null,
          status: "active",
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

      toast.success("Your listing is live");
      navigate({ to: "/listing/$id", params: { id: listing.id } });
    } catch {
      toast.error("Could not publish the listing");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">Post an item</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Free to list. Honest photos and condition notes sell fastest.
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <Field label="Title" name="title" required placeholder="3-seat leather sofa" />
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={5} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price (ETB)" name="price" type="number" required />
          <Field label="Original price (optional)" name="original_price" type="number" />
        </div>
        <div className="flex items-center gap-3">
          <Switch id="negotiable" name="negotiable" />
          <Label htmlFor="negotiable">Price is negotiable</Label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Category" name="category_id" options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <SelectField label="Condition" name="condition" required options={CONDITIONS.map((c) => ({ value: c, label: c }))} />
          <SelectField label="Material" name="material" options={MATERIALS.map((c) => ({ value: c, label: c }))} />
          <SelectField label="Room" name="room_type" options={ROOM_TYPES.map((c) => ({ value: c, label: c }))} />
          <SelectField label="City" name="city" required options={CITIES.map((c) => ({ value: c, label: c }))} />
          <Field label="Sub city / area" name="sub_city" />
          <Field label="Colour" name="color" />
          <Field label="Brand" name="brand" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="photos">Photos</Label>
          <Input
            id="photos"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <p className="text-xs text-muted-foreground">{files.length} selected</p>
        </div>

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Publishing…" : "Publish listing"}
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
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
