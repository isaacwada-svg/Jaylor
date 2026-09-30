import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BrandLogo } from "@/components/jaylor/logo";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { useOnlineStatus } from "@/lib/use-online-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPANY_LINE } from "@/lib/jaylor";
import { displayPhone } from "@/lib/portal-phone";
import { requestPassportCode, verifyPassportCode } from "@/lib/passport-claim.functions";
import { savePassportSession } from "@/lib/passport-session";

export const Route = createFileRoute("/passport/claim")({
  staticData: { sitemap: false },
  validateSearch: (
    search: Record<string, unknown>,
  ): { shareTo?: string; shareToName?: string; shareToWhatsapp?: string } => ({
    ...(typeof search["shareTo"] === "string" ? { shareTo: search["shareTo"] } : {}),
    ...(typeof search["shareToName"] === "string" ? { shareToName: search["shareToName"] } : {}),
    ...(typeof search["shareToWhatsapp"] === "string"
      ? { shareToWhatsapp: search["shareToWhatsapp"] }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Claim your Passport — Jaylor" },
      { name: "description", content: "Verify your phone number to see your measurements." },
    ],
  }),
  component: ClaimPassportPage,
});

function ClaimPassportPage() {
  const navigate = useNavigate();
  const { shareToName, shareToWhatsapp } = Route.useSearch();
  const online = useOnlineStatus();
  const requestCode = useServerFn(requestPassportCode);
  const verifyCode = useServerFn(verifyPassportCode);

  const [step, setStep] = useState<"phone" | "whatsapp" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [waLink, setWaLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRequestCode() {
    setBusy(true);
    try {
      const result = await requestCode({ data: { phone: phoneInput } });
      if (result.status === "error") {
        toast.error(result.error);
        return;
      }
      setPhone(phoneInput);
      if (result.status === "sent") {
        setStep("code");
        toast.success("Check WhatsApp for your code");
      } else {
        setWaLink(result.whatsappLink);
        setStep("whatsapp");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    try {
      const result = await verifyCode({ data: { phone, code } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      savePassportSession(result.sessionToken);
      navigate({
        to: "/passport/me",
        search: shareToName && shareToWhatsapp ? { shareToName, shareToWhatsapp } : {},
      });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl">Claim your Passport</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your phone number and we&apos;ll send a one-time code on WhatsApp to confirm
            it&apos;s you.
          </p>

          {!online ? (
            <div className="mt-6">
              <OfflineNotice label="Connect to the internet to claim your Passport." />
            </div>
          ) : step === "phone" ? (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="claim-phone">Your phone number</Label>
                <Input
                  id="claim-phone"
                  type="tel"
                  inputMode="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="0800 000 0000"
                  autoComplete="tel"
                />
              </div>
              <Button
                className="w-full"
                disabled={busy || phoneInput.trim().length < 6}
                onClick={handleRequestCode}
              >
                {busy ? "Sending..." : "Send my code"}
              </Button>
            </div>
          ) : step === "whatsapp" ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                To protect your details, WhatsApp needs you to message us first. Tap below — it
                opens WhatsApp with a message ready to send. Your code arrives in the same chat
                within seconds.
              </p>
              <Button className="w-full" asChild>
                <a href={waLink ?? "#"} target="_blank" rel="noopener noreferrer">
                  Open WhatsApp and send
                </a>
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setStep("code")}>
                I have my code
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="claim-code">6-digit code</Label>
                <Input
                  id="claim-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                />
                <p className="text-xs text-muted-foreground">
                  Sent to {phone ? displayPhone(phone) : "your WhatsApp"}
                </p>
              </div>
              <Button className="w-full" disabled={busy || code.length < 4} onClick={handleVerify}>
                {busy ? "Checking..." : "Verify and continue"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep("phone")}>
                Use a different number
              </Button>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
