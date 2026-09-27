import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { useOnlineStatus } from "@/lib/use-online-status";
import { sendTestDigest } from "@/lib/digest.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Owner alerts and digests -- delivered as an in-app notification + email always,
 *  plus WhatsApp when the owner's own number is inside its 24h contact window (no
 *  Meta template-message support was found for this project -- see STEP 1.1). */
export function DigestSettings({ storeId, isAdmin }: { storeId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const runTestDigest = useServerFn(sendTestDigest);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"daily" | "weekly" | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [email, setEmail] = useState("");
  const [alertTransfer, setAlertTransfer] = useState(true);
  const [digestDaily, setDigestDaily] = useState(true);
  const [digestWeekly, setDigestWeekly] = useState(true);

  const { data: settings } = useQuery({
    queryKey: ["digest-settings", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("whatsapp_number, email, alert_transfer_received, digest_daily, digest_weekly")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!settings) return;
    setWhatsappNumber(settings.whatsapp_number ?? "");
    setEmail(settings.email ?? "");
    setAlertTransfer(settings.alert_transfer_received);
    setDigestDaily(settings.digest_daily);
    setDigestWeekly(settings.digest_weekly);
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("store_settings").upsert(
        {
          store_id: storeId,
          whatsapp_number: whatsappNumber.trim() || null,
          email: email.trim() || null,
          alert_transfer_received: alertTransfer,
          digest_daily: digestDaily,
          digest_weekly: digestWeekly,
        },
        { onConflict: "store_id" },
      );
      if (error) throw error;
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["digest-settings", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save these settings"));
    } finally {
      setSaving(false);
    }
  }

  async function runTest(kind: "daily" | "weekly") {
    setTesting(kind);
    try {
      const result = await runTestDigest({ data: { storeId, kind } });
      toast.success(
        `Test ${kind} digest sent — notification ${result.notification ? "✓" : "✗"}, email ${result.email ? "✓" : "✗"}, WhatsApp ${result.whatsapp ? "✓" : "✗ (outside 24h window)"}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not send the test digest"));
    } finally {
      setTesting(null);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-medium">Alerts &amp; digests</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily (8am) and weekly (Monday 8am) summaries, plus an alert whenever a bank transfer
            comes in. Always sent as an in-app notification and email; WhatsApp is sent too when
            you've messaged your shop's number in the last 24 hours.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="digest-whatsapp">Your WhatsApp number</Label>
            <Input
              id="digest-whatsapp"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="Defaults to your shop's number"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="digest-email">Alert email</Label>
            <Input
              id="digest-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Defaults to your shop's contact email"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="alert-transfer">Transfer received alert</Label>
            <Switch
              id="alert-transfer"
              checked={alertTransfer}
              onCheckedChange={setAlertTransfer}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="digest-daily">Daily digest</Label>
            <Switch id="digest-daily" checked={digestDaily} onCheckedChange={setDigestDaily} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="digest-weekly">Weekly digest</Label>
            <Switch id="digest-weekly" checked={digestWeekly} onCheckedChange={setDigestWeekly} />
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Saving..." : "Save"}
        </Button>

        {isAdmin && (
          <div className="flex gap-2 border-t border-border pt-3">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => runTest("daily")}
              disabled={!online || testing !== null}
            >
              {testing === "daily" ? "Sending..." : "Send test daily digest"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => runTest("weekly")}
              disabled={!online || testing !== null}
            >
              {testing === "weekly" ? "Sending..." : "Send test weekly digest"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
