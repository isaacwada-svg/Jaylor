import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage, getFunctionErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRICE_TIERS } from "@/lib/pricing-content";
import type { Tier } from "@/lib/jaylor";

export function PaymentAccountSettings({ storeId, tier }: { storeId: string; tier: Tier }) {
  const feePercent = PRICE_TIERS.find((p) => p.tier === tier)?.jaylorPayFee ?? "1%";
  const queryClient = useQueryClient();
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [reauthed, setReauthed] = useState(false);

  const { data: account } = useQuery({
    queryKey: ["payment-account", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_accounts")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: banks } = useQuery({
    queryKey: ["paystack-banks"],
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-paystack-banks");
      if (error) throw error;
      return (data as { result: { name: string; code: string }[] }).result;
    },
  });

  async function reauthenticate() {
    if (!password) {
      toast.error("Enter your password");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) throw new Error("Could not confirm your account");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Incorrect password");
      setReauthed(true);
      setReauthOpen(false);
      setPassword("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not confirm your password"));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!bankCode || accountNumber.trim().length < 10) {
      toast.error("Choose a bank and enter a valid 10-digit account number");
      return;
    }
    setBusy(true);
    try {
      const bankName = banks?.find((b) => b.code === bankCode)?.name ?? "";
      const { data, error } = await supabase.functions.invoke("connect-payment-account", {
        body: { storeId, bankCode, bankName, accountNumber: accountNumber.trim() },
      });
      if (error) throw error;
      const result = data as { result: { account_name: string } };
      toast.success(`Connected — ${result.result.account_name}`);
      setReauthed(false);
      queryClient.invalidateQueries({ queryKey: ["payment-account", storeId] });
    } catch (error) {
      toast.error(await getFunctionErrorMessage(error, "Could not connect this account"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="font-medium">Jaylor Pay</p>
          {account?.status === "active" ? (
            <Badge className="border-paid/40 bg-paid/10 text-paid">Connected</Badge>
          ) : (
            <Badge variant="outline">Not connected</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Send clients a secure payment link on their orders. Money settles straight to your own
          bank account. Jaylor never holds it. Your rate: {feePercent} per collection, based on your
          plan.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Clients abroad can pay by card in their own currency, and it still settles to you in
          naira.
        </p>

        {account?.status === "active" && (
          <p className="mt-4 rounded-xl border border-border p-3 text-sm">
            {account.account_name} · {account.bank_name} ····{account.account_number?.slice(-4)}
          </p>
        )}

        {reauthed ? (
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label>Bank</Label>
              <Select value={bankCode} onValueChange={setBankCode}>
                <SelectTrigger>
                  <SelectValue placeholder={banks ? "Choose your bank" : "Loading banks..."} />
                </SelectTrigger>
                <SelectContent>
                  {(banks ?? []).map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-number">
                {account?.status === "active" ? "New account number" : "Account number"}
              </Label>
              <Input
                id="account-number"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="0123456789"
                maxLength={10}
              />
            </div>
            <Button onClick={connect} disabled={busy} className="w-full">
              {busy
                ? "Saving..."
                : account?.status === "active"
                  ? "Save new account"
                  : "Connect account"}
            </Button>
          </div>
        ) : (
          <Button
            variant={account?.status === "active" ? "outline" : "default"}
            className="mt-3 w-full"
            onClick={() => setReauthOpen(true)}
          >
            {account?.status === "active" ? "Change payout account" : "Connect account"}
          </Button>
        )}

        <Dialog open={reauthOpen} onOpenChange={setReauthOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm your password</DialogTitle>
              <DialogDescription>
                For your security, re-enter your password before changing where your money settles.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reauth-password">Password</Label>
              <Input
                id="reauth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reauthenticate()}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button onClick={reauthenticate} disabled={busy} className="w-full">
                {busy ? "Confirming..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
