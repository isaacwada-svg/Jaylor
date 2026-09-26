import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { QuoteForm } from "@/components/jaylor/quote-form";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { formatMoney } from "@/lib/jaylor";
import { computeQuoteTotal, quoteStatusLabel } from "@/lib/quote-totals";

export const Route = createFileRoute("/_authenticated/quotations")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Quotations — Jaylor" },
      {
        name: "description",
        content: "Build a quote for a customer, share it on WhatsApp, and convert it to an order.",
      },
    ],
  }),
  component: Quotations,
});

function statusBadgeClass(label: string) {
  if (label === "Accepted" || label === "Converted to order") return "border-paid/40 text-paid";
  if (label === "Expired") return "border-owed/40 text-owed";
  return "border-gold text-gold";
}

function Quotations() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);

  const { data: canManage } = useQuery({
    queryKey: ["can-manage-quotations", storeId, currentRole],
    enabled: !!storeId,
    queryFn: async () => {
      if (currentRole === "owner" || currentRole === "manager") return true;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return false;
      const { data } = await supabase
        .from("store_members")
        .select("can_manage_quotations")
        .eq("store_id", storeId as string)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      return data?.can_manage_quotations ?? false;
    },
  });

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["quotes", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("store_id", storeId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const clientIds = useMemo(() => [...new Set((quotes ?? []).map((q) => q.client_id))], [quotes]);
  const { data: clients } = useQuery({
    queryKey: ["quotes-clients", clientIds],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .in("id", clientIds);
      if (error) throw error;
      return data;
    },
  });
  const clientName = (id: string) => clients?.find((c) => c.id === id)?.full_name ?? "—";

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">Quotations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Build a quote, share it on WhatsApp, and convert it to an order in one tap.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setFormOpen(true)} className="shrink-0">
              <Plus className="size-4" />
              New quote
            </Button>
          )}
        </div>
        <StitchDivider className="my-6" />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : !quotes || quotes.length === 0 ? (
          <EmptyState
            title="No quotes yet"
            description="Quotes you build for customers will show up here."
            action={
              canManage ? <Button onClick={() => setFormOpen(true)}>New quote</Button> : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {quotes.map((quote) => {
              const expired = new Date(quote.valid_until) < new Date();
              const label = quoteStatusLabel(quote.status, expired);
              const { total } = computeQuoteTotal(
                quote.quantity,
                quote.unit_price,
                quote.discount_percent,
              );
              return (
                <Link
                  key={quote.id}
                  to="/quotations/$quoteId"
                  params={{ quoteId: quote.id }}
                  className="block rounded-2xl border border-border p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{clientName(quote.client_id)}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {quote.quote_number ? `${quote.quote_number} · ` : ""}
                        {quote.quantity > 1 ? `${quote.quantity}× ` : ""}
                        {quote.garment_type}
                      </p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 ${statusBadgeClass(label)}`}>
                      {label}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="figures font-medium">{formatMoney(total)}</span>
                    <span className="text-xs text-muted-foreground">
                      Valid until {new Date(quote.valid_until).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {storeId && (
        <QuoteForm
          open={formOpen}
          onOpenChange={setFormOpen}
          storeId={storeId}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["quotes", storeId] });
          }}
        />
      )}
    </AppShell>
  );
}
