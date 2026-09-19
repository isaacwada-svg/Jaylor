import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { COMPANY_LINE } from "@/lib/jaylor";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Set up your store — Jaylor" }],
  }),
  component: Onboarding,
});

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

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [handleTaken, setHandleTaken] = useState(false);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!userId || handleTaken) return;
    setBusy(true);
    try {
      const { data: store, error } = await supabase
        .from("stores")
        .insert({
          name: name.trim(),
          slug: handle,
          city: city.trim() || null,
          country_code: "NG",
          owner_id: userId,
        })
        .select()
        .single();
      if (error) throw error;

      // A trigger may already create the owner's membership row when a
      // store is inserted; ignore a duplicate-key error either way.
      const { error: memberError } = await supabase
        .from("store_members")
        .insert({ store_id: store.id, user_id: userId, role: "owner" });
      if (memberError && memberError.code !== "23505") {
        throw memberError;
      }

      if (phone.trim()) {
        await supabase.from("store_settings").upsert({ store_id: store.id, phone: phone.trim() });
      }

      toast.success(`Welcome to Jaylor. You're on Growth free for 14 days.`);
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create your store");
      setBusy(false);
    }
  }

  if (checking) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-display text-primary-foreground">
            J
          </span>
          <span className="font-display text-2xl">Jaylor</span>
        </div>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Let&apos;s set up your workroom.
        </p>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl">Your store</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You can add your logo, garment types and more once you&apos;re in.
          </p>

          <StitchDivider className="my-6" />

          <form onSubmit={handleSubmit} className="space-y-4">
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
              {busy ? "Setting up..." : "Create my store"}
            </Button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
