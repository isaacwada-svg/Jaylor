import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Mic, Ruler, Sparkles, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFeatureDiscovery } from "@/lib/feature-discovery";

const STEPS = [
  {
    title: "Meet your studio shortcuts",
    body: "Four tools can remove repetitive work from your day. Here is where to find each one.",
    icon: Sparkles,
  },
  {
    title: "AI Design",
    body: "Turn customer style requests into visual ideas, then follow up while their interest is fresh.",
    icon: Sparkles,
  },
  {
    title: "Voice Order",
    body: "Use New, then Voice order, to speak an order instead of typing every detail.",
    icon: Mic,
  },
  {
    title: "Measurement passport",
    body: "Open a client’s Measurements tab and send their reusable measurement card by WhatsApp.",
    icon: Ruler,
  },
  {
    title: "Group-order links",
    body: "Create one link for aso-ebi, uniforms, families, measurements and individual payments.",
    icon: Users2,
  },
] as const;

export function FeatureTour() {
  const discovery = useFeatureDiscovery();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const current = STEPS[step] ?? STEPS[0];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  async function dismiss() {
    await discovery.finishTour(false);
  }

  async function complete() {
    await discovery.finishTour(true);
    navigate({ to: "/events" });
  }

  return (
    <Dialog open={discovery.shouldShowTour} onOpenChange={(open) => !open && void dismiss()}>
      <DialogContent className="max-w-md rounded-none border-gold/30">
        <div className="flex items-center justify-between pr-8 text-[10px] font-bold uppercase text-gold">
          <span>Jaylor studio tour</span>
          <span>
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <div className="h-px bg-border">
          <div
            className="h-full bg-gold transition-[width] duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <DialogHeader className="pt-3 text-left">
          <span className="flex size-11 items-center justify-center border border-gold/40 bg-gold/10 text-gold">
            <Icon className="size-5" />
          </span>
          <DialogTitle className="pt-3 font-display text-2xl">{current.title}</DialogTitle>
          <DialogDescription className="leading-6">{current.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-3 flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => void dismiss()}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button variant="outline" onClick={() => setStep((value) => value - 1)}>
                Back
              </Button>
            ) : null}
            <Button variant="premium" onClick={() => (last ? void complete() : setStep(step + 1))}>
              {last ? "Explore group orders" : "Next"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
