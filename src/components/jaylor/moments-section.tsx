import { useState } from "react";
import {
  Cake,
  PartyPopper,
  PackageCheck,
  Scissors,
  Ruler,
  UserX,
  Gift,
  ImagePlus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { whatsappLink } from "@/lib/whatsapp";
import { useStore } from "@/lib/store-context";
import { usePendingMoments, useMarkMoment, type MomentType } from "@/lib/moments";
import { ShareCardDialog } from "@/components/jaylor/share-card-dialog";

const ICON_BY_TYPE: Record<MomentType, LucideIcon> = {
  birthday: Cake,
  anniversary: PartyPopper,
  ready: PackageCheck,
  progress: Scissors,
  fitcheck: Ruler,
  winback: UserX,
  festive: Gift,
};

export function MomentsSection({ storeId }: { storeId: string | undefined }) {
  const { currentStore } = useStore();
  const { data: moments, isLoading } = usePendingMoments(storeId);
  const mark = useMarkMoment(storeId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [cardMomentId, setCardMomentId] = useState<string | null>(null);

  if (isLoading || !moments || moments.length === 0) return null;

  const cardMoment = moments.find((m) => m.id === cardMomentId) ?? null;

  return (
    <section className="mb-6">
      <h2 className="text-xl">Moments</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Personal touchpoints ready to send — tap to review and send on WhatsApp.
      </p>
      <div className="mt-3 space-y-3">
        {moments.map((moment) => {
          const Icon = ICON_BY_TYPE[moment.type];
          const defaultMessage =
            moment.type === "fitcheck" && moment.order_id
              ? `${moment.message} ${window.location.origin}/fitcheck/${moment.order_id}/${moment.client_id}`
              : moment.message;
          const draft = drafts[moment.id] ?? defaultMessage;
          return (
            <Card key={moment.id} className="rounded-2xl border-gold/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-gold">
                    <Icon className="size-4" />
                  </span>
                  <p className="font-medium">{moment.client_name}</p>
                </div>
                <Textarea
                  value={draft}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [moment.id]: e.target.value }))}
                  rows={3}
                  className="mt-3"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!moment.client_phone}
                    onClick={() => mark.mutate({ id: moment.id, status: "sent", message: draft })}
                    asChild={!!moment.client_phone}
                  >
                    {moment.client_phone ? (
                      <a
                        href={whatsappLink(moment.client_phone, draft)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Send on WhatsApp
                      </a>
                    ) : (
                      <span>No WhatsApp number</span>
                    )}
                  </Button>
                  {moment.type === "ready" && (
                    <Button size="sm" variant="outline" onClick={() => setCardMomentId(moment.id)}>
                      <ImagePlus className="size-4" />
                      Share card
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => mark.mutate({ id: moment.id, status: "dismissed" })}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {cardMoment && (
        <ShareCardDialog
          open={!!cardMoment}
          onOpenChange={(open) => !open && setCardMomentId(null)}
          spec={{
            eyebrow: "Ready for collection",
            headline: `${cardMoment.client_name.split(" ")[0]}'s ${cardMoment.garment_type ?? "order"} is ready`,
            subline: "Come through whenever suits you.",
            storeName: currentStore?.name ?? "Jaylor",
          }}
          fileName="jaylor-ready.png"
        />
      )}
    </section>
  );
}
