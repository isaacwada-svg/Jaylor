import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

type Reliability = {
  level: "new" | "on_time" | "sometimes_late" | "often_late";
  completed_orders: number;
  suggested_deposit_percent: number;
};

const LEVEL_LABEL: Record<Reliability["level"], string> = {
  new: "New client",
  on_time: "Usually pays on time",
  sometimes_late: "Sometimes pays late",
  often_late: "Often needs reminders",
};

const LEVEL_CLASS: Record<Reliability["level"], string | undefined> = {
  new: undefined,
  on_time: "border-paid/40 text-paid",
  sometimes_late: "border-gold/40 text-gold",
  often_late: "border-owed/40 text-owed",
};

/**
 * Payment reliability indicator, rule-based (no AI): computed only from
 * this store's own orders for this client — never shared across stores,
 * never shown to the client. See client_payment_reliability RPC.
 */
export function PaymentReliabilityBadge({
  clientId,
  showDepositHint = false,
}: {
  clientId: string;
  showDepositHint?: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["client-payment-reliability", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_payment_reliability", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return data as unknown as Reliability;
    },
  });

  if (!data) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className={LEVEL_CLASS[data.level]}>
        {LEVEL_LABEL[data.level]}
      </Badge>
      {showDepositHint && data.level === "often_late" && (
        <p className="text-xs text-muted-foreground">
          This client often pays late. Consider a {data.suggested_deposit_percent}% deposit.
        </p>
      )}
    </div>
  );
}
