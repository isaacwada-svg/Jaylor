import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function MessageTopupButton({ storeId }: { storeId: string }) {
  const [busy, setBusy] = useState(false);

  async function buy() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-message-topup", {
        body: { storeId, callbackUrl: window.location.href },
      });
      if (error) throw error;
      const { authorization_url } = data as { authorization_url: string };
      window.location.href = authorization_url;
    } catch (error) {
      toast.error(await getFunctionErrorMessage(error, "Could not start this payment"));
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={buy} disabled={busy}>
      {busy ? "Starting..." : "Buy 100 more messages · ₦2,000"}
    </Button>
  );
}
