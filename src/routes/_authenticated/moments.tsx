import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "@/lib/store-context";
import { getErrorMessage } from "@/lib/utils";
import {
  MOMENT_TYPES,
  MOMENT_TYPE_LABELS,
  useMomentSettings,
  useSetMomentSetting,
} from "@/lib/moments";

const MOMENT_TYPE_HINTS: Record<(typeof MOMENT_TYPES)[number], string> = {
  birthday: "Fires 5 days before a client's birthday, if you have it on file.",
  anniversary: "Fires on the anniversary of a client's first order, when no birthday is known.",
  ready: "Fires the moment an order is marked ready for collection.",
  progress: "Fires when an order enters cutting or sewing. Off by default.",
  fitcheck: "Fires 2 days after collection, asking how the fit was.",
  winback: "Lists clients with no order in 90 days, once a week.",
  festive: "Fires 5 days before Christmas, New Year, Easter, Eid al-Fitr and Eid al-Adha.",
};

export const Route = createFileRoute("/_authenticated/moments")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Moments — Jaylor" },
      {
        name: "description",
        content: "Turn each moment on or off for your store.",
      },
    ],
  }),
  component: MomentsSettings,
});

function MomentsSettings() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const isOwner = currentRole === "owner";
  const { data: settings, isLoading } = useMomentSettings(storeId);
  const setSetting = useSetMomentSetting(storeId);

  const enabledFor = (type: (typeof MOMENT_TYPES)[number]) =>
    settings?.find((s) => s.type === type)?.enabled ?? true;

  async function toggle(type: (typeof MOMENT_TYPES)[number], next: boolean) {
    try {
      await setSetting.mutateAsync({ type, enabled: next });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this setting"));
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8 lg:py-10">
        <Link to="/more" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" />
          More
        </Link>
        <h1 className="mt-3 text-3xl">Moments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Automatic, personal touchpoints your shop can send with one tap. Every moment stays
          tap-to-send from your own WhatsApp — nothing here sends on its own.
        </p>
        <StitchDivider className="my-6" />

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {MOMENT_TYPES.map((type) => (
              <Card key={type} className="rounded-2xl">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Label htmlFor={`moment-${type}`} className="font-medium">
                      {MOMENT_TYPE_LABELS[type]}
                    </Label>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {MOMENT_TYPE_HINTS[type]}
                    </p>
                  </div>
                  <Switch
                    id={`moment-${type}`}
                    checked={enabledFor(type)}
                    disabled={!isOwner}
                    onCheckedChange={(checked) => toggle(type, checked)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
