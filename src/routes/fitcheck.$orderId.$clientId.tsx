import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_LINE } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";

// get_fitcheck_context/record_fit_feedback aren't in the generated
// Database types yet, same drift as every other freshly-migrated RPC.
const rpc = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export const Route = createFileRoute("/fitcheck/$orderId/$clientId")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "How was the fit? — Jaylor" },
      { name: "description", content: "Let your tailor know how the fit was." },
    ],
  }),
  component: FitCheckPage,
});

const RESULTS = [
  { value: "perfect", label: "Perfect fit" },
  { value: "too_tight", label: "Too tight" },
  { value: "too_loose", label: "Too loose" },
  { value: "too_short", label: "Too short" },
  { value: "too_long", label: "Too long" },
] as const;

const AREAS = ["Waist", "Chest", "Hip", "Shoulder", "Sleeve", "Length", "Neck"] as const;

type FitContext = {
  garment_type: string;
  client_first_name: string;
  store_name: string;
  already_submitted: boolean;
};

function FitCheckPage() {
  const { orderId, clientId } = Route.useParams();
  const [result, setResult] = useState<(typeof RESULTS)[number]["value"] | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: context, isLoading } = useQuery({
    queryKey: ["fitcheck-context", orderId, clientId],
    queryFn: async () => {
      const { data, error } = await rpc("get_fitcheck_context", {
        p_order_id: orderId,
        p_client_id: clientId,
      });
      if (error) throw error;
      return data as unknown as FitContext;
    },
    retry: false,
  });

  async function submit() {
    if (!result) return;
    setBusy(true);
    try {
      const { error } = await rpc("record_fit_feedback", {
        p_order_id: orderId,
        p_client_id: clientId,
        p_area: result === "perfect" ? "overall" : (area ?? "overall"),
        p_result: result,
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not send your answer"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="linen flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8">
          {isLoading ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : !context ? (
            <div className="rounded-2xl border bg-card p-6 text-center">
              <h1 className="text-xl">We couldn&apos;t find this order</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The link may be wrong or out of date.
              </p>
            </div>
          ) : submitted || context.already_submitted ? (
            <div className="rounded-2xl border bg-card p-6 text-center">
              <CheckCircle2 className="mx-auto size-8 text-paid" />
              <h1 className="mt-3 text-xl">Thank you</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {context.store_name} has your answer.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-6">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                How was the fit?
              </p>
              <h1 className="mt-1 text-xl">
                Hi {context.client_first_name}, how is your {context.garment_type}?
              </h1>

              <div className="mt-5 grid gap-2">
                {RESULTS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => {
                      setResult(r.value);
                      setArea(null);
                    }}
                    className={`touch-target rounded-xl border p-3 text-left text-sm font-medium transition-colors ${
                      result === r.value
                        ? "border-gold bg-accent/60 text-gold"
                        : "border-border hover:bg-accent/30"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {result && result !== "perfect" && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">Which area?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {AREAS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setArea(a)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          area === a
                            ? "border-gold bg-accent/60 text-gold"
                            : "border-border hover:bg-accent/30"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button
                className="mt-6 w-full"
                disabled={!result || (result !== "perfect" && !area) || busy}
                onClick={submit}
              >
                {busy ? "Sending..." : "Send"}
              </Button>
            </div>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
