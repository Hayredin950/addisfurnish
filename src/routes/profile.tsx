import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { CITIES } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile & Shop — SuqBet" },
      { name: "description", content: "Update your contact details and shop information." },
      { property: "og:title", content: "Your Profile — SuqBet" },
      { property: "og:description", content: "Manage your SuqBet account and shop page." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ProfilePage />
    </RequireAuth>
  ),
});

function ProfilePage() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const shopName = (form.get("shop_name") as string) || null;
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: String(form.get("full_name")),
        phone: (form.get("phone") as string) || null,
        city: (form.get("city") as string) || null,
        shop_name: shopName,
        shop_slug: shopName
          ? shopName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
          : null,
        shop_description: (form.get("shop_description") as string) || null,
        shop_address: (form.get("shop_address") as string) || null,
        is_seller: !!shopName,
      })
      .eq("id", user!.id);
    if (error) {
      toast.error("Could not save");
      return;
    }
    toast.success("Profile updated");
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">Your profile</h1>
      <form className="mt-8 space-y-5" onSubmit={save}>
        <div className="space-y-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={profile?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <select
            id="city"
            name="city"
            defaultValue={profile?.city ?? ""}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select…</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <h2 className="pt-4 font-display text-xl font-semibold">Shop details (optional)</h2>
        <div className="space-y-2">
          <Label htmlFor="shop_name">Shop name</Label>
          <Input id="shop_name" name="shop_name" defaultValue={profile?.shop_name ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shop_description">About the shop</Label>
          <Textarea
            id="shop_description"
            name="shop_description"
            rows={4}
            defaultValue={profile?.shop_description ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shop_address">Shop address</Label>
          <Input id="shop_address" name="shop_address" defaultValue={profile?.shop_address ?? ""} />
        </div>
        <Button type="submit">Save changes</Button>
      </form>
    </div>
  );
}
