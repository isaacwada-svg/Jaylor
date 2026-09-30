import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Send } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { whatsappLink } from "@/lib/whatsapp";
import { AiActionButton, naira, shortDate, useAiCredits, AiCreditsProvider } from "@/lib/ai-credits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/festive")({
  staticData: { sitemap: false },
  validateSearch: z.object({ occasion: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Festive messages · Jaylor" },
      { name: "description", content: "Remind last season's clients to book their Christmas, Sallah and Easter outfits early." },
      { property: "og:title", content: "Festive messages · Jaylor" },
      { property: "og:description", content: "Festive season reminders for tailors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FestivePage,
});

export type FestiveOccasion = { key: string; label: string; date: string; days_away: number; client_ids: string[] };

const LANGS = ["English", "Pidgin", "Yoruba", "Hausa", "Igbo"];
const templates = (label: string, shop: string) => [
  `Hello {first_name}, ${label} is coming! Book your outfit early with ${shop} so it's ready on time. Reply to this message to get started.`,
  `Hi {first_name}, thank you for sewing with ${shop} last season. ${label} is near. Send us your fabric this week and we'll sew your outfit without rush.`,
  `Good day {first_name}. ${shop} is taking ${label} orders now. Slots fill up fast, so let us know early. We look forward to sewing for you again.`,
];

function lagosHour(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
}

function FestivePage() {
  return <AiCreditsProvider><FestiveInner /></AiCreditsProvider>;
}

function FestiveInner() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const qc = useQueryClient();
  const { run } = useAiCredits();
  const { occasion: occasionKey } = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data: occasions } = useQuery({
    queryKey: ["festive-upcoming", storeId, 60],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db.rpc("festive_upcoming", { p_store_id: storeId, p_days: 60 });
      if (error) throw error;
      return ((data ?? []) as FestiveOccasion[]).sort((a, b) => a.days_away - b.days_away);
    },
  });
  const occasion = occasions?.find((o) => o.key === occasionKey);

  const { data: campaigns } = useQuery({
    queryKey: ["festive-campaigns", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await db
        .from("festive_campaigns")
        .select("id, occasion_label, occasion_date, sent_client_ids, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(10);
      const list = (data ?? []) as { id: string; occasion_label: string; sent_client_ids: string[]; created_at: string }[];
      return Promise.all(
        list.map(async (c) => {
          const { data: r } = await db.rpc("festive_campaign_results", { p_campaign_id: c.id });
          return { ...c, results: (r ?? { orders: 0, total: 0 }) as { orders: number; total: number } };
        }),
      );
    },
  });

  const [newLabel, setNewLabel] = useState("");
  const [newDate, setNewDate] = useState("");
  async function addOccasion() {
    if (!newLabel.trim() || !newDate) return void toast.error("Add a name and a date.");
    const { error } = await db.from("store_occasions").insert({ store_id: storeId, label: newLabel.trim(), event_date: newDate });
    if (error) return void toast.error("Couldn't add this occasion.");
    setNewLabel("");
    setNewDate("");
    void qc.invalidateQueries({ queryKey: ["festive-upcoming"] });
    toast.success("Occasion added. Tag clients with the same name to include them.");
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 lg:px-8 lg:py-10">
        <Link to="/ai-studio" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> AI Studio
        </Link>
        {occasion ? (
          <Campaign occasion={occasion} onDone={() => navigate({ search: {} })} run={run} />
        ) : (
          <>
            <div>
              <h1 className="text-3xl">Festive messages</h1>
              <p className="mt-1 text-sm text-muted-foreground">Clients who sewed with you around the same time last year, or clients you tagged with the occasion.</p>
            </div>
            <ul className="space-y-2">
              {(occasions ?? []).map((o) => (
                <li key={o.key}>
                  <button
                    type="button"
                    onClick={() => navigate({ search: { occasion: o.key } })}
                    className="flex min-h-16 w-full items-center justify-between gap-3 border border-border bg-card px-4 py-3 text-left hover:border-gold"
                  >
                    <span>
                      <span className="block font-medium">{o.label}</span>
                      <span className="block text-sm text-muted-foreground">
                        In {o.days_away} days · {shortDate(o.date)} · {o.client_ids.length} client{o.client_ids.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-gold">Open</span>
                  </button>
                </li>
              ))}
              {occasions && occasions.length === 0 && (
                <li className="text-sm text-muted-foreground">No occasions in the next 60 days.</li>
              )}
            </ul>

            <section className="border border-border p-4">
              <h2 className="text-lg">Add your own occasion</h2>
              <p className="text-sm text-muted-foreground">e.g. a wedding or church anniversary.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input className="h-12" placeholder="Name" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                <Input className="h-12" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                <Button className="h-12" onClick={addOccasion}>Add</Button>
              </div>
            </section>

            {campaigns && campaigns.length > 0 && (
              <section>
                <h2 className="text-xl">Past campaigns</h2>
                <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
                  {campaigns.map((c) => (
                    <li key={c.id} className="py-3">
                      <p className="font-medium">{c.occasion_label} · {shortDate(c.created_at)} · sent to {c.sent_client_ids.length}</p>
                      <p className="text-muted-foreground">
                        This campaign brought {c.results.orders} order{c.results.orders === 1 ? "" : "s"} worth {naira(Number(c.results.total))}.
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Campaign({
  occasion,
  onDone,
  run,
}: {
  occasion: FestiveOccasion;
  onDone: () => void;
  run: ReturnType<typeof useAiCredits>["run"];
}) {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const qc = useQueryClient();
  const shop = currentStore?.name ?? "our shop";
  const { data: clients } = useQuery({
    queryKey: ["festive-clients", storeId, occasion.key],
    enabled: !!storeId && occasion.client_ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, full_name, phone, whatsapp_phone")
        .eq("store_id", storeId!)
        .in("id", occasion.client_ids);
      return data ?? [];
    },
  });
  const [selected, setSelected] = useState<Set<string>>(new Set(occasion.client_ids));
  const [message, setMessage] = useState(templates(occasion.label, shop)[0]!);
  const [language, setLanguage] = useState("English");
  const [tone, setTone] = useState<"friendly" | "formal">("friendly");
  const [writing, setWriting] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [hour, setHour] = useState(12);
  useEffect(() => setHour(lagosHour()), []);
  const inWindow = hour >= 8 && hour < 20;
  const chosen = useMemo(() => (clients ?? []).filter((c) => selected.has(c.id)), [clients, selected]);

  async function writeWithAi() {
    setWriting(true);
    const res = await run("festive_message_ai", { occasionLabel: occasion.label, language, tone });
    setWriting(false);
    if (res.ok) setMessage(String((res.result as { message: string }).message));
  }

  async function start() {
    if (!message.includes("{first_name}") && !confirm("Your message has no {first_name}. Send anyway?")) return;
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await db
      .from("festive_campaigns")
      .insert({
        store_id: storeId,
        occasion_key: occasion.key,
        occasion_label: occasion.label,
        occasion_date: occasion.date,
        message,
        language,
        client_ids: chosen.map((c) => c.id),
        created_by: user.user?.id,
      })
      .select("id")
      .single();
    if (error) return void toast.error("Couldn't start the campaign.");
    setCampaignId(data.id);
  }

  async function sendTo(c: { id: string; full_name: string; phone: string | null; whatsapp_phone: string | null }) {
    const phone = c.whatsapp_phone || c.phone;
    if (!phone) return void toast.error("This client has no phone number.");
    const first = c.full_name.split(" ")[0] ?? c.full_name;
    window.open(whatsappLink(phone, message.replaceAll("{first_name}", first)), "_blank");
    const next = new Set(sent).add(c.id);
    setSent(next);
    await db.from("festive_campaigns").update({ sent_client_ids: [...next] }).eq("id", campaignId);
    void qc.invalidateQueries({ queryKey: ["festive-campaigns"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.1em] text-gold">In {occasion.days_away} days</p>
        <h1 className="mt-1 text-3xl">{occasion.label} message</h1>
      </div>

      {!campaignId ? (
        <>
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg">Clients ({selected.size})</h2>
              <Button size="sm" variant="ghost" onClick={() => setSelected(selected.size ? new Set() : new Set(occasion.client_ids))}>
                {selected.size ? "Clear all" : "Select all"}
              </Button>
            </div>
            <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto border border-border">
              {(clients ?? []).map((c) => (
                <li key={c.id}>
                  <label className="flex min-h-12 items-center gap-3 px-3 py-2">
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={(v) => {
                        const n = new Set(selected);
                        if (v) n.add(c.id);
                        else n.delete(c.id);
                        setSelected(n);
                      }}
                    />
                    <span>{c.full_name}</span>
                  </label>
                </li>
              ))}
              {occasion.client_ids.length === 0 && <li className="p-3 text-sm text-muted-foreground">No matching clients yet.</li>}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg">Message</h2>
            <div className="flex flex-wrap gap-2">
              {templates(occasion.label, shop).map((t, i) => (
                <Button key={i} size="sm" variant="outline" onClick={() => setMessage(t)}>Template {i + 1}</Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-12 border border-input bg-background px-3" aria-label="Language">
                {LANGS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <select value={tone} onChange={(e) => setTone(e.target.value as "friendly" | "formal")} className="h-12 border border-input bg-background px-3" aria-label="Tone">
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
              </select>
            </div>
            <AiActionButton feature="festive_message_ai" label="Write with AI" variant="outline" className="h-12 w-full" busy={writing} onRun={writeWithAi} />
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
            <p className="text-xs text-muted-foreground">{"{first_name}"} is replaced with each client's first name.</p>
          </section>

          <Button className="h-12 w-full" disabled={chosen.length === 0} onClick={start}>
            Continue to send ({chosen.length})
          </Button>
        </>
      ) : (
        <section className="space-y-3">
          {!inWindow && (
            <p className="border-l-2 border-gold pl-3 text-sm">Messages can only be sent between 8am and 8pm. Please come back later.</p>
          )}
          <p className="text-sm text-muted-foreground">Tap each client to open WhatsApp with the message ready. Sent {sent.size} of {chosen.length}.</p>
          <ul className="divide-y divide-border border border-border">
            {chosen.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>{c.full_name}</span>
                <Button size="sm" className="h-11" variant={sent.has(c.id) ? "outline" : "default"} disabled={!inWindow} onClick={() => sendTo(c)}>
                  <Send className="size-4" /> {sent.has(c.id) ? "Sent" : "Send"}
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="h-12 w-full" onClick={onDone}>Done</Button>
        </section>
      )}
    </div>
  );
}
