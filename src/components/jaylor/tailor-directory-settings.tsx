import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { DIRECTORY_BIO_MAX_LENGTH, DIRECTORY_MAX_SPECIALTIES } from "@/lib/directory";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DirectoryListingCard } from "@/components/jaylor/directory-listing-card";
import type { Tables } from "@/integrations/supabase/types";

type Store = Tables<"stores">;

type Eligibility = {
  directory_listed: boolean;
  is_active: boolean;
  onboarding_completed: boolean;
  hidden_by_admin: boolean;
  has_recent_order: boolean;
  appears: boolean;
};

export function TailorDirectorySettings({ store }: { store: Store }) {
  const queryClient = useQueryClient();
  const storeId = store.id;
  const [saving, setSaving] = useState(false);
  const [listed, setListed] = useState(false);
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [showArea, setShowArea] = useState(true);
  const [remoteOrders, setRemoteOrders] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["tailor-directory-settings", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select(
          "directory_listed, directory_bio, directory_specialties, directory_show_area, directory_remote_orders, on_time_badge_enabled",
        )
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: eligibility } = useQuery({
    queryKey: ["directory-eligibility", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_directory_eligibility", {
        p_store_id: storeId,
      });
      if (error) throw error;
      return data as unknown as Eligibility;
    },
  });

  const { data: badge } = useQuery({
    queryKey: ["storefront-on-time-badge", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_storefront_on_time_badge", {
        p_store_id: storeId,
      });
      if (error) throw error;
      return data as unknown as { rate: number; orders_counted: number } | null;
    },
  });

  useEffect(() => {
    if (!settings) return;
    setListed(settings.directory_listed);
    setBio(settings.directory_bio ?? "");
    setSpecialties(settings.directory_specialties ?? []);
    setShowArea(settings.directory_show_area);
    setRemoteOrders(settings.directory_remote_orders);
  }, [settings]);

  const garmentTypeOptions = store.garment_types ?? [];
  const atMax = specialties.length >= DIRECTORY_MAX_SPECIALTIES;

  function toggleSpecialty(value: string) {
    setSpecialties((prev) =>
      prev.includes(value)
        ? prev.filter((s) => s !== value)
        : prev.length < DIRECTORY_MAX_SPECIALTIES
          ? [...prev, value]
          : prev,
    );
  }

  function addCustomSpecialty() {
    const trimmed = customSpecialty.trim();
    if (!trimmed || atMax || specialties.includes(trimmed)) return;
    setSpecialties((prev) => [...prev, trimmed]);
    setCustomSpecialty("");
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("store_settings").upsert(
        {
          store_id: storeId,
          directory_listed: listed,
          directory_bio: bio.trim() || null,
          directory_specialties: specialties,
          directory_show_area: showArea,
          directory_remote_orders: remoteOrders,
        },
        { onConflict: "store_id" },
      );
      if (error) throw error;
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["tailor-directory-settings", storeId] });
      queryClient.invalidateQueries({ queryKey: ["directory-eligibility", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save these settings"));
    } finally {
      setSaving(false);
    }
  }

  const previewListing = {
    store_id: storeId,
    name: store.name,
    slug: store.slug,
    logo_url: store.logo_url,
    whatsapp_phone: store.whatsapp_phone,
    area: showArea ? store.area : null,
    city: showArea ? store.city : null,
    bio: bio.trim() || null,
    specialties,
    remote_orders: remoteOrders,
    badge: badge ?? null,
  };

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Tailor directory</p>
            <p className="mt-1 text-sm text-muted-foreground">
              List your shop on jaylor.com.ng/tailors so new clients can find you.
            </p>
          </div>
          <Switch checked={listed} onCheckedChange={setListed} disabled={saving} />
        </div>

        {listed && eligibility && !eligibility.appears && (
          <p className="rounded-xl border border-owed/40 bg-owed/10 p-3 text-sm text-owed">
            {eligibility.hidden_by_admin
              ? "Your listing has been hidden by Jaylor. Contact support if you think this is a mistake."
              : !eligibility.is_active || !eligibility.onboarding_completed
                ? "Finish setting up your store to appear in the directory."
                : "You won't appear in the directory yet."}
          </p>
        )}

        {listed && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="space-y-2">
              <Label htmlFor="directory-bio">
                Bio ({bio.length}/{DIRECTORY_BIO_MAX_LENGTH})
              </Label>
              <Textarea
                id="directory-bio"
                rows={2}
                value={bio}
                maxLength={DIRECTORY_BIO_MAX_LENGTH}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short line about your shop"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Specialties ({specialties.length}/{DIRECTORY_MAX_SPECIALTIES})
              </Label>
              {garmentTypeOptions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {garmentTypeOptions.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleSpecialty(g)}
                      disabled={!specialties.includes(g) && atMax}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        specialties.includes(g)
                          ? "border-gold bg-gold/10 text-gold"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
              {specialties
                .filter((s) => !garmentTypeOptions.includes(s))
                .map((s) => (
                  <div
                    key={s}
                    className="mt-1 inline-flex items-center gap-1 rounded-full border border-gold bg-gold/10 px-3 py-1 text-xs text-gold"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => toggleSpecialty(s)}
                      aria-label={`Remove ${s}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              <div className="flex gap-2">
                <Input
                  value={customSpecialty}
                  onChange={(e) => setCustomSpecialty(e.target.value)}
                  placeholder="Add a custom specialty"
                  disabled={atMax}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCustomSpecialty}
                  disabled={atMax}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <div>
                <p className="text-sm font-medium">Show area/city</p>
                <p className="text-xs text-muted-foreground">
                  Never shows your full street address.
                </p>
              </div>
              <Switch checked={showArea} onCheckedChange={setShowArea} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Accepts remote orders</p>
                <p className="text-xs text-muted-foreground">
                  Clients abroad or in other cities can order from you.
                </p>
              </div>
              <Switch checked={remoteOrders} onCheckedChange={setRemoteOrders} />
            </div>

            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Preview
              </p>
              <DirectoryListingCard listing={previewListing} preview />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
