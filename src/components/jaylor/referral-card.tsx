import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ReferralCard({
  storeId,
  referralCode,
}: {
  storeId: string;
  referralCode: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["referral-stats", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_referral_stats", { p_store_id: storeId });
      if (error) throw error;
      return data as { referred_count: number; reward_count: number };
    },
  });

  const link = referralCode ? `${window.location.origin}/auth?mode=signup&ref=${referralCode}` : "";

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link");
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <p className="font-medium">Refer a fellow tailor</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your link. When a shop you referred subscribes to a paid plan, you get one month
          free.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-accent/30 p-3">
          <p className="min-w-0 flex-1 truncate text-sm">{link || "Generating your link..."}</p>
          <Button size="sm" variant="outline" onClick={copyLink} disabled={!link}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {stats
            ? `${stats.referred_count} friend${stats.referred_count === 1 ? "" : "s"} joined, ${stats.reward_count} free month${stats.reward_count === 1 ? "" : "s"} earned`
            : "Loading your stats..."}
        </p>
      </CardContent>
    </Card>
  );
}
