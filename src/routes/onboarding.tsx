import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { cn, getErrorMessage } from "@/lib/utils";
import { COMPANY_LINE, GARMENT_TYPES, PENDING_REFERRAL_KEY } from "@/lib/jaylor";

export const Route = createFileRoute("/onboarding")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [{ title: "Set up your store — Jaylor" }],
  }),
  component: Onboarding,
});

const STEPS = ["Your store", "Your look", "What you sew", "First win"] as const;

const ACCENT_COLORS = [
  { name: "Gold", value: "#B8902F" },
  { name: "Terracotta", value: "#B4532A" },
  { name: "Emerald", value: "#1F7A5A" },
  { name: "Ink", value: "#1B1A3A" },
  { name: "Plum", value: "#6B3F69" },
  { name: "Teal", value: "#1F6B6B" },
] as const;

const SEWS_FOR = [
  { value: "female", label: "Mostly women" },
  { value: "male", label: "Mostly men" },
  { value: "both", label: "Both" },
] as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function Onboarding() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [handleTaken, setHandleTaken] = useState(false);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  // Step 2
  const [accentColor, setAccentColor] = useState<string>(ACCENT_COLORS[0].value);

  // Step 3
  const [garmentTypes, setGarmentTypes] = useState<string[]>([]);
  const [sewsFor, setSewsFor] = useState<(typeof SEWS_FOR)[number]["value"]>("both");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: memberships } = await supabase
        .from("store_members")
        .select("store_id")
        .eq("user_id", data.user.id)
        .limit(1);
      if (cancelled) return;
      if (memberships && memberships.length > 0) {
        navigate({ to: "/dashboard" });
        return;
      }
      setUserId(data.user.id);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!handleTouched) setHandle(slugify(name));
  }, [name, handleTouched]);

  useEffect(() => {
    if (!handle) {
      setHandleTaken(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("stores").select("id").eq("slug", handle).maybeSingle();
      if (!cancelled) setHandleTaken(Boolean(data));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle]);

  async function handleCreateStore(event: React.FormEvent) {
    event.preventDefault();
    if (!userId || handleTaken) return;
    setBusy(true);
    try {
      let referredByStoreId: string | null = null;
      try {
        const pendingReferral = sessionStorage.getItem(PENDING_REFERRAL_KEY);
        if (pendingReferral) {
          const { data: resolved } = await supabase.rpc("resolve_referral_code", {
            p_code: pendingReferral,
          });
          referredByStoreId = resolved ?? null;
          sessionStorage.removeItem(PENDING_REFERRAL_KEY);
        }
      } catch {
        // referral is a bonus, never block store creation over it
      }

      const { data: store, error } = await supabase
        .from("stores")
        .insert({
          name: name.trim(),
          slug: handle,
          city: city.trim() || null,
          country_code: "NG",
          owner_id: userId,
          referred_by_store_id: referredByStoreId,
        })
        .select()
        .single();
      if (error) throw error;

      // A trigger already creates the owner's membership row when a store
      // is inserted; ignore a duplicate-key error either way.
      const { error: memberError } = await supabase
        .from("store_members")
        .insert({ store_id: store.id, user_id: userId, role: "owner" });
      if (memberError && memberError.code !== "23505") {
        throw memberError;
      }

      if (phone.trim()) {
        await supabase.from("store_settings").upsert({ store_id: store.id, phone: phone.trim() });
      }

      setStoreId(store.id);
      setStep(1);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create your store"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLook(event: React.FormEvent) {
    event.preventDefault();
    if (!storeId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("stores")
        .update({ accent_color: accentColor })
        .eq("id", storeId);
      if (error) throw error;
      setStep(2);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save your look"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveGarments(event: React.FormEvent) {
    event.preventDefault();
    if (!storeId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("stores")
        .update({ garment_types: garmentTypes.length ? garmentTypes : null, sews_for: sewsFor })
        .eq("id", storeId);
      if (error) throw error;
      setStep(3);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save what you sew"));
    } finally {
      setBusy(false);
    }
  }

  async function finish(destination: "/clients" | "/dashboard" | "/import", note?: string) {
    if (!storeId) return;
    setBusy(true);
    try {
      await supabase.from("stores").update({ onboarding_completed: true }).eq("id", storeId);
      if (note) toast(note);
      toast.success("Welcome to Jaylor. You're on Growth free for 14 days.");
      navigate({ to: destination });
    } finally {
      setBusy(false);
    }
  }

  function toggleGarment(type: string) {
    setGarmentTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  if (checking) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2">
          <LogoMark className="size-9" />
          <span className="font-display text-2xl">Jaylor</span>
        </div>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Let&apos;s set up your workroom.
        </p>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <StitchTrack steps={STEPS} currentIndex={step} compact className="mb-6" />

          {step === 0 && (
            <>
              <h1 className="text-xl">Your store</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You can add your logo and more once you&apos;re in.
              </p>
              <StitchDivider className="my-6" />
              <form onSubmit={handleCreateStore} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Store name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Bethjay Couture"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="handle">Handle</Label>
                  <div className="flex items-center gap-1 rounded-xl border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
                    <span className="text-sm text-muted-foreground">jaylor.ng/</span>
                    <input
                      id="handle"
                      value={handle}
                      onChange={(e) => {
                        setHandleTouched(true);
                        setHandle(slugify(e.target.value));
                      }}
                      className="min-h-11 flex-1 bg-transparent py-2 text-sm outline-none"
                      required
                    />
                  </div>
                  {handle && handleTaken && (
                    <p className="text-xs text-owed">That handle is taken. Try another.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+234 800 000 0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Abuja"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || !name || !handle || handleTaken}
                >
                  {busy ? "Setting up..." : "Continue"}
                </Button>
              </form>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-xl">Your look</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick an accent colour. You can add your logo any time from Settings.
              </p>
              <StitchDivider className="my-6" />
              <form onSubmit={handleSaveLook} className="space-y-6">
                <div className="grid grid-cols-6 gap-3">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      aria-label={c.name}
                      onClick={() => setAccentColor(c.value)}
                      className={cn(
                        "touch-target aspect-square rounded-full border-2 transition-transform",
                        accentColor === c.value
                          ? "scale-110 border-foreground"
                          : "border-transparent",
                      )}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(0)}
                    disabled={busy}
                  >
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={busy}>
                    Continue
                  </Button>
                </div>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-xl">What you sew</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ll set up measurement templates that fit what you make.
              </p>
              <StitchDivider className="my-6" />
              <form onSubmit={handleSaveGarments} className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  {GARMENT_TYPES.map((type) => {
                    const active = garmentTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleGarment(type)}
                        className={cn(
                          "touch-target rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                          active
                            ? "border-gold bg-accent text-gold"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <Label>Who do you mostly sew for?</Label>
                  <div className="flex gap-2">
                    {SEWS_FOR.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSewsFor(option.value)}
                        className={cn(
                          "touch-target flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                          sewsFor === option.value
                            ? "border-gold bg-accent text-gold"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                    disabled={busy}
                  >
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={busy}>
                    Continue
                  </Button>
                </div>
              </form>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-xl">First win</h1>
              <p className="mt-1 text-sm text-muted-foreground">What would you like to do first?</p>
              <StitchDivider className="my-6" />
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => finish("/clients")}
                  className="touch-target w-full rounded-2xl border border-border p-4 text-left transition-colors hover:border-gold hover:bg-accent/60"
                >
                  <p className="font-medium">Add my first client</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start your client book with someone you already sew for.
                  </p>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    finish(
                      "/dashboard",
                      "AI notebook scan is coming soon — for now, add clients one by one.",
                    )
                  }
                  className="touch-target w-full rounded-2xl border border-border p-4 text-left transition-colors hover:border-gold hover:bg-accent/60"
                >
                  <p className="font-medium">Scan a page of my notebook</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Coming soon: turn a photo of your notebook into clients and measurements.
                  </p>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => finish("/import")}
                  className="touch-target w-full rounded-2xl border border-border p-4 text-left transition-colors hover:border-gold hover:bg-accent/60"
                >
                  <p className="font-medium">Let us type it in for you</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Send us photos of your notebook and we&apos;ll enter your clients for you, for a
                    small one-off fee.
                  </p>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => finish("/dashboard")}
                  className="touch-target w-full rounded-2xl border border-border p-4 text-left transition-colors hover:border-gold hover:bg-accent/60"
                >
                  <p className="font-medium">Explore first</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Take a look around before you add anything.
                  </p>
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
