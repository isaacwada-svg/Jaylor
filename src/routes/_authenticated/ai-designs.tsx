import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, UserPlus } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { PhotoLightbox } from "@/components/jaylor/photo-lightbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useStore } from "@/lib/store-context";
import { formatPhoneNG, normalizePhoneNG } from "@/lib/phone";
import { whatsappLink } from "@/lib/whatsapp";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai-designs")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "AI style requests — Jaylor" }] }),
  component: AiDesigns,
});

type DesignRow = Tables<"ai_designs">;

/** Accepts either a bare storage path or a legacy full public URL. */
function toStoragePath(value: string): string {
  const marker = "/ai-design-photos/";
  const at = value.indexOf(marker);
  return at === -1 ? value.replace(/^\/+/, "") : value.slice(at + marker.length);
}

function AiDesigns() {
  const { currentStore } = useStore();
  const navigate = useNavigate();
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);

  const { data: designs, isLoading } = useQuery({
    queryKey: ["ai-designs", currentStore?.id],
    enabled: !!currentStore,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_designs")
        .select("*")
        .eq("store_id", currentStore?.id as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return [...data].sort((a, b) => {
        if (!!a.selected_at !== !!b.selected_at) return a.selected_at ? -1 : 1;
        return 0;
      });
    },
  });

  // Photos live in a private bucket, so they are viewed through short-lived signed links.
  const { data: signedPhotos } = useQuery({
    queryKey: ["ai-design-photo-urls", designs?.map((d) => d.id).join(",")],
    enabled: !!designs && designs.length > 0,
    queryFn: async () => {
      const paths = Array.from(
        new Set(
          (designs ?? [])
            .flatMap((d) => [d.image_url, d.selfie_url])
            .filter((p): p is string => !!p)
            .map(toStoragePath),
        ),
      );
      if (paths.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase.storage
        .from("ai-design-photos")
        .createSignedUrls(paths, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      }
      return map;
    },
  });

  const photoUrl = (value: string | null) =>
    (value && signedPhotos?.[toStoragePath(value)]) || undefined;

  async function addAsClient(design: DesignRow) {
    if (!currentStore) return;
    const phone = normalizePhoneNG(design.phone) ?? design.phone;
    try {
      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("store_id", currentStore.id)
        .eq("phone", phone)
        .maybeSingle();

      if (existing) {
        navigate({ to: "/clients/$clientId", params: { clientId: existing.id } });
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const { data: created, error } = await supabase
        .from("clients")
        .insert({
          store_id: currentStore.id,
          full_name: design.client_name,
          phone,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success(`${design.client_name} added as a client`);
      navigate({ to: "/clients/$clientId", params: { clientId: created.id } });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add this client"));
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <Link to="/more" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" />
          More
        </Link>
        <h1 className="mt-3 text-3xl">AI style requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Designs your customers generated on your shop page. Reach out and turn them into real
          orders.
        </p>

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <>
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </>
          ) : !designs || designs.length === 0 ? (
            <EmptyState
              title="No style requests yet"
              description="When a customer generates an AI design on your shop page, it will show up here."
            />
          ) : (
            designs.map((design) => {
              const photos = [photoUrl(design.image_url), photoUrl(design.selfie_url)].filter(
                (p): p is string => !!p,
              );
              const measurements = Object.entries(
                (design.measurements as Record<string, string>) ?? {},
              ).filter(([, v]) => v?.trim());

              return (
                <div key={design.id} className="flex gap-4 rounded-2xl border border-border p-4">
                  <button
                    type="button"
                    onClick={() => setLightbox({ photos, index: 0 })}
                    className="shrink-0"
                  >
                    <img
                      src={photoUrl(design.image_url)}
                      alt={design.description || "AI-generated style design"}
                      className="size-24 rounded-xl object-cover"
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{design.client_name}</p>
                      <div className="flex shrink-0 gap-1">
                        {design.selected_at && (
                          <Badge className="border-paid/40 bg-paid/10 text-paid">Selected</Badge>
                        )}
                        {design.was_paid && <Badge variant="outline">Paid</Badge>}
                      </div>
                    </div>
                    <p className="figures text-sm text-muted-foreground">
                      {formatPhoneNG(design.phone)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{design.description}</p>
                    {measurements.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {measurements.map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={whatsappLink(
                            design.phone,
                            `Hi ${design.client_name}, thanks for your style request! Let's talk about your design.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="size-4" />
                          Message
                        </a>
                      </Button>
                      <Button size="sm" onClick={() => addAsClient(design)}>
                        <UserPlus className="size-4" />
                        Add as client
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <PhotoLightbox
        photos={lightbox?.photos ?? []}
        index={lightbox?.index ?? null}
        onIndexChange={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))}
        onClose={() => setLightbox(null)}
      />
    </AppShell>
  );
}
