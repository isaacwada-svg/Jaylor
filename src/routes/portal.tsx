import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatMoney } from "@/lib/jaylor";
import { displayPhone, PORTAL_KEYWORD } from "@/lib/portal-phone";
import {
  endPortalSession,
  getPortalData,
  startPortalLogin,
  verifyPortalCode,
  type PortalData,
} from "@/lib/portal.functions";

const TOKEN_KEY = "jaylor:portal-token";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "My orders — Jaylor customer portal" },
      {
        name: "description",
        content:
          "Sign in with a WhatsApp code to see your tailoring orders, what you have paid, your measurement requests and your tailor's details.",
      },
      { property: "og:title", content: "Track your tailoring orders — Jaylor" },
      {
        property: "og:description",
        content:
          "Customers can check order progress, balances and measurement requests with a one-time WhatsApp code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalPage,
});

function PortalPage() {
  const start = useServerFn(startPortalLogin);
  const verify = useServerFn(verifyPortalCode);
  const load = useServerFn(getPortalData);
  const signOut = useServerFn(endPortalSession);

  const [token, setToken] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "whatsapp" | "code">("phone");
  const [waLink, setWaLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<PortalData | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    load({ data: { token } })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        if (!cancelled) {
          setToken(null);
          setData(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, load]);

  async function handleStart() {
    setBusy(true);
    try {
      const result = await start({ data: { phone: phoneInput } });
      setPhone(result.phone);
      if (result.status === "sent") {
        setStep("code");
        toast.success("Check WhatsApp for your code");
      } else {
        setWaLink(result.whatsappLink ?? null);
        setStep("whatsapp");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    try {
      const result = await verify({ data: { phone, code } });
      window.localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setCode("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    const current = token;
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setData(null);
    setStep("phone");
    setPhoneInput("");
    if (current) await signOut({ data: { token: current } }).catch(() => undefined);
  }

  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-3xl px-4 py-12 lg:px-8">
        {!token ? (
          <div className="mx-auto max-w-md">
            <h1 className="font-heading text-3xl sm:text-4xl">Your orders</h1>
            <p className="mt-3 text-muted-foreground">
              See what your tailor is making for you, what you have paid and what is left — no app
              to install. We send a one-time code to your WhatsApp.
            </p>

            {step === "phone" && (
              <div className="mt-8 space-y-4 rounded-2xl border border-border p-5">
                <div className="space-y-2">
                  <Label htmlFor="portal-phone">Your WhatsApp number</Label>
                  <Input
                    id="portal-phone"
                    inputMode="tel"
                    placeholder="0902 810 1389"
                    value={phoneInput}
                    onChange={(event) => setPhoneInput(event.target.value)}
                  />
                </div>
                <Button
                  variant="premium"
                  className="w-full"
                  disabled={busy || phoneInput.trim().length < 6}
                  onClick={handleStart}
                >
                  {busy ? "Please wait…" : "Send my code"}
                </Button>
              </div>
            )}

            {step === "whatsapp" && (
              <div className="mt-8 space-y-4 rounded-2xl border border-border p-5">
                <p className="text-sm text-muted-foreground">
                  To protect your details, WhatsApp asks you to message us first. Tap the button
                  below — it opens WhatsApp with the word <strong>{PORTAL_KEYWORD}</strong> ready to
                  send. Your code arrives in the same chat within seconds.
                </p>
                <Button variant="premium" className="w-full" asChild>
                  <a href={waLink ?? "#"} target="_blank" rel="noreferrer">
                    Open WhatsApp and send
                  </a>
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setStep("code")}>
                  I have my code
                </Button>
              </div>
            )}

            {step === "code" && (
              <div className="mt-8 space-y-4 rounded-2xl border border-border p-5">
                <div className="space-y-2">
                  <Label htmlFor="portal-code">6-digit code</Label>
                  <Input
                    id="portal-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sent to {phone ? displayPhone(phone) : "your WhatsApp"}
                  </p>
                </div>
                <Button
                  variant="premium"
                  className="w-full"
                  disabled={busy || code.length < 4}
                  onClick={handleVerify}
                >
                  {busy ? "Checking…" : "Sign in"}
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setStep("phone")}>
                  Use a different number
                </Button>
              </div>
            )}
          </div>
        ) : !data ? (
          <p className="text-muted-foreground">Loading your orders…</p>
        ) : (
          <div className="space-y-10">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-heading text-3xl sm:text-4xl">
                  {data.name ? `Hello ${data.name.split(" ")[0]}` : "Your orders"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">{displayPhone(data.phone)}</p>
              </div>
              <Button variant="outline" onClick={handleSignOut}>
                Sign out
              </Button>
            </header>

            <div>
              <h2 className="font-heading text-xl">Orders</h2>
              {data.orders.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nothing here yet. Orders appear as soon as your tailor records them against this
                  number.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {data.orders.map((order) => (
                    <li key={order.id} className="rounded-2xl border border-border p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-heading text-lg">{order.garment}</span>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {order.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {order.number} · {order.storeName}
                        {order.deliveryDate ? ` · due ${order.deliveryDate}` : ""}
                      </p>
                      <p className="mt-3 text-sm">
                        Paid {formatMoney(order.paid)} of {formatMoney(order.price)}
                        {order.balance > 0 ? (
                          <span className="font-medium"> · balance {formatMoney(order.balance)}</span>
                        ) : (
                          <span className="font-medium"> · fully paid</span>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h2 className="font-heading text-xl">Measurement requests</h2>
              {data.measureRequests.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No measurement requests are waiting for you.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {data.measureRequests.map((request) => (
                    <li key={request.id} className="rounded-2xl border border-border p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-heading text-lg">{request.eventLabel}</span>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {request.submitted ? "sent" : request.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{request.storeName}</p>
                      {!request.submitted && (
                        <Button variant="premium" className="mt-3" asChild>
                          <a href={`/e/${request.token}`}>Send my measurements</a>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {data.shops.length > 0 && (
              <div>
                <h2 className="font-heading text-xl">Your tailors</h2>
                <ul className="mt-4 space-y-3">
                  {data.shops.map((shop) => (
                    <li key={shop.id} className="rounded-2xl border border-border p-4">
                      <p className="font-heading text-lg">{shop.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[shop.area, shop.city].filter(Boolean).join(", ") || "Nigeria"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {shop.handle && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={`/${shop.handle}`}>View shop</a>
                          </Button>
                        )}
                        {shop.phone && (
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={`https://wa.me/${shop.phone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Message on WhatsApp
                            </a>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </MarketingLayout>
  );
}
