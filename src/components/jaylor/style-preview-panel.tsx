import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ImagePlus, Mic, RefreshCw, Save, Share2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { resizeImageFile } from "@/lib/image";
import { AiActionButton, useAiCredits } from "@/lib/ai-credits";
import { isSpeechRecognitionSupported, startSpeechRecognition } from "@/lib/voice-recognition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const STYLE_GARMENTS = [
  "Agbada", "Kaftan", "Senator", "Iro and buba", "Boubou", "Gown", "Ball gown", "Peplum top",
  "Wrapper and blouse", "Suit", "Native trouser set", "Jumpsuit", "Skirt and blouse", "Other",
];

export type StyleInputs = {
  fabricPath: string;
  referencePath?: string;
  garmentType: string;
  description: string;
  occasion: string;
  gender: "male" | "female";
  orderId?: string;
};

type Preview = { previewId: string; imageUrl: string | null; orderId: string | null };
type Idea = { name: string; description: string; why: string };

async function uploadInput(storeId: string, file: File): Promise<{ path: string; url: string }> {
  const small = await resizeImageFile(file, 1024, 0.8);
  const path = `${storeId}/inputs/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("ai-studio").upload(path, small, { contentType: "image/jpeg" });
  if (error) throw error;
  return { path, url: URL.createObjectURL(small) };
}

/** Burns the "AI preview" label and "Made with Jaylor" mark into the image for sharing. */
async function labelledImage(url: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const s = Math.max(14, Math.round(bmp.width / 40));
  ctx.font = `600 ${s}px Montserrat, sans-serif`;
  const label = "AI preview. Final garment may differ";
  const pad = s * 0.6;
  const w = ctx.measureText(label).width + pad * 2;
  ctx.fillStyle = "rgba(17,31,57,0.8)";
  ctx.fillRect(pad, bmp.height - s * 2.4 - pad, w, s * 2);
  ctx.fillStyle = "#F8F4E9";
  ctx.fillText(label, pad * 2, bmp.height - s * 1.05 - pad);
  ctx.font = `600 ${Math.round(s * 0.8)}px Montserrat, sans-serif`;
  const mark = "Made with Jaylor";
  const mw = ctx.measureText(mark).width;
  ctx.fillStyle = "rgba(212,175,55,0.95)";
  ctx.fillText(mark, bmp.width - mw - pad, pad + s);
  const out = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.88));
  return new File([out], "jaylor-style-preview.jpg", { type: "image/jpeg" });
}

export function StylePreviewPanel({
  orderId,
  defaultGarment,
  initial,
  autoRunPreview,
}: {
  orderId?: string;
  defaultGarment?: string;
  initial?: Partial<StyleInputs>;
  autoRunPreview?: boolean;
}) {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const { run } = useAiCredits();
  const qc = useQueryClient();
  const matchGarment = STYLE_GARMENTS.find((g) => g.toLowerCase() === (defaultGarment ?? "").toLowerCase());
  const [fabric, setFabric] = useState<{ path: string; url: string } | null>(
    initial?.fabricPath ? { path: initial.fabricPath, url: "" } : null,
  );
  const [reference, setReference] = useState<{ path: string; url: string } | null>(null);
  const [garment, setGarment] = useState(initial?.garmentType ?? matchGarment ?? "Gown");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [occasion, setOccasion] = useState(initial?.occasion ?? "");
  const [gender, setGender] = useState<"male" | "female">(initial?.gender ?? "female");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [tweak, setTweak] = useState("");
  const [listening, setListening] = useState(false);
  const [saveOrderId, setSaveOrderId] = useState(orderId ?? "");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  const { data: recentOrders } = useQuery({
    queryKey: ["style-orders", storeId],
    enabled: !!storeId && !orderId,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, number, garment_type")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  async function pick(file: File | undefined, kind: "fabric" | "reference") {
    if (!file || !storeId) return;
    setUploading(true);
    try {
      const up = await uploadInput(storeId, file);
      if (kind === "fabric") setFabric(up);
      else setReference(up);
    } catch {
      toast.error("We couldn't upload that photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const inputs = (extra: Record<string, unknown> = {}) => ({
    fabricPath: fabric?.path,
    referencePath: reference?.path,
    garmentType: garment,
    description,
    occasion,
    gender,
    orderId: orderId || undefined,
    ...extra,
  });

  async function doPreview(extra: Record<string, unknown> = {}) {
    if (!fabric) return void toast.error("Please add a fabric photo first.");
    setBusy("preview");
    const res = await run("style_preview", inputs(extra));
    setBusy(null);
    if (res.ok) {
      setPreview(res.result as Preview);
      setTweak("");
      void qc.invalidateQueries({ queryKey: ["style-previews"] });
    }
  }

  async function doIdeas() {
    if (!fabric) return void toast.error("Please add a fabric photo first.");
    setBusy("ideas");
    const res = await run("style_suggestions", inputs());
    setBusy(null);
    if (res.ok) setIdeas((res.result as { ideas: Idea[] }).ideas);
  }

  useEffect(() => {
    if (autoRunPreview && fabric && !autoRan.current) {
      autoRan.current = true;
      void doPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunPreview, fabric]);

  const recRef = useRef<{ stop: () => void } | null>(null);
  function speak() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (!isSpeechRecognitionSupported()) return void toast("Voice typing isn't supported on this phone. Please type instead.");
    const base = description;
    setListening(true);
    recRef.current = startSpeechRecognition({
      onInterim: (t) => setDescription(base ? `${base} ${t}` : t),
      onFinal: (t) => setDescription(base ? `${base} ${t}` : t),
      onEnd: () => setListening(false),
      onError: () => {
        setListening(false);
        toast.error("Voice typing stopped. Please allow the microphone or type instead.");
      },
    });
  }

  async function saveToOrder() {
    if (!preview || !saveOrderId) return void toast.error("Pick an order first.");
    const { error } = await db.from("ai_style_previews").update({ order_id: saveOrderId }).eq("id", preview.previewId);
    if (error) return void toast.error("Couldn't save. Please try again.");
    setPreview({ ...preview, orderId: saveOrderId });
    void qc.invalidateQueries({ queryKey: ["style-previews"] });
    toast.success("Saved to order");
  }

  async function share() {
    if (!preview?.imageUrl) return;
    const text = `Here's a preview of your ${garment.toLowerCase()} in your fabric. Final garment may differ slightly. – ${currentStore?.name ?? ""}`;
    try {
      const file = await labelledImage(preview.imageUrl);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
      toast("Picture saved. Attach it in WhatsApp.");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Couldn't share. Please try again.");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Label>Fabric photo</Label>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0], "fabric")} />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0], "fabric")} />
        {fabric?.url ? (
          <img src={fabric.url} alt="Fabric" className="mt-2 h-32 w-32 border border-border object-cover" />
        ) : fabric ? (
          <p className="mt-2 text-sm text-muted-foreground">Fabric photo added.</p>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-12" disabled={uploading} onClick={() => cameraRef.current?.click()}>
            <Camera className="size-4" /> Camera
          </Button>
          <Button type="button" variant="outline" className="h-12" disabled={uploading} onClick={() => galleryRef.current?.click()}>
            <ImagePlus className="size-4" /> Gallery
          </Button>
        </div>
        {uploading && <p className="mt-1 text-sm text-muted-foreground">Uploading photo…</p>}
        <p className="mt-1 text-xs text-muted-foreground">Fabric only. Please don't upload photos of people.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="sp-garment">Garment</Label>
          <select id="sp-garment" value={garment} onChange={(e) => setGarment(e.target.value)} className="mt-1 h-12 w-full border border-input bg-background px-3">
            {STYLE_GARMENTS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <Label>For</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["female", "male"] as const).map((g) => (
              <Button key={g} type="button" className="h-12" variant={gender === g ? "default" : "outline"} onClick={() => setGender(g)}>
                {g === "female" ? "Woman" : "Man"}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="sp-occasion">Occasion</Label>
        <Input id="sp-occasion" className="mt-1 h-12" placeholder="e.g. wedding, church, Sallah" value={occasion} onChange={(e) => setOccasion(e.target.value)} />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="sp-desc">Style description</Label>
          <Button type="button" size="sm" variant="ghost" onClick={speak}>
            <Mic className="size-4" /> {listening ? "Stop" : "Speak"}
          </Button>
        </div>
        <Textarea id="sp-desc" className="mt-1" rows={3} placeholder="e.g. mermaid gown with off-shoulder neckline and puff sleeves" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div>
        <Label>Style reference (optional)</Label>
        <input ref={refRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0], "reference")} />
        <div className="mt-2 flex items-center gap-3">
          {reference?.url && <img src={reference.url} alt="Reference" className="h-16 w-16 border border-border object-cover" />}
          <Button type="button" variant="outline" className="h-11" onClick={() => refRef.current?.click()}>
            {reference ? "Change reference" : "Add from your gallery"}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <AiActionButton feature="style_suggestions" label="Get 5 style ideas" variant="outline" className="h-12" busy={busy === "ideas"} disabled={!!busy || !fabric} onRun={doIdeas} />
        <AiActionButton feature="style_preview" label="Preview style" className="h-12" busy={busy === "preview"} disabled={!!busy || !fabric} onRun={() => doPreview()} />
      </div>
      {busy === "preview" && <p className="text-sm text-muted-foreground">Making your preview. This can take up to a minute…</p>}

      {ideas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg">Style ideas</h3>
          {ideas.map((i) => (
            <div key={i.name} className="border border-border p-3">
              <p className="font-medium">{i.name}</p>
              <p className="text-sm">{i.description}</p>
              <p className="text-sm text-muted-foreground">{i.why}</p>
              <AiActionButton
                feature="style_preview"
                label="Preview this"
                size="sm"
                className="mt-2"
                busy={busy === "preview"}
                disabled={!!busy}
                onRun={() => {
                  setDescription(`${i.name}: ${i.description}`);
                  void doPreview({ description: `${i.name}: ${i.description}` });
                }}
              />
            </div>
          ))}
        </div>
      )}

      {preview?.imageUrl && (
        <div className="space-y-3">
          <div className="relative mx-auto max-w-sm">
            <img src={preview.imageUrl} alt="AI style preview" className="w-full border border-border" />
            <span className="absolute bottom-2 left-2 bg-primary/85 px-2 py-1 text-[11px] font-semibold text-primary-foreground">
              AI preview. Final garment may differ
            </span>
            <span className="absolute right-2 top-2 text-[10px] font-semibold text-gold">Made with Jaylor</span>
          </div>
          {!orderId && (
            <select value={saveOrderId} onChange={(e) => setSaveOrderId(e.target.value)} className="h-12 w-full border border-input bg-background px-3">
              <option value="">Choose an order to save to…</option>
              {(recentOrders ?? []).map((o) => <option key={o.id} value={o.id}>{o.number} · {o.garment_type}</option>)}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12" variant="outline" onClick={saveToOrder} disabled={!!preview.orderId && preview.orderId === saveOrderId}>
              <Save className="size-4" /> {preview.orderId && preview.orderId === saveOrderId ? "Saved" : "Save to order"}
            </Button>
            <Button className="h-12" variant="outline" onClick={share}>
              <Share2 className="size-4" /> Share on WhatsApp
            </Button>
          </div>
          <div className="flex gap-2">
            <Input className="h-12" placeholder="Change something, e.g. longer sleeves" value={tweak} onChange={(e) => setTweak(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <AiActionButton feature="style_preview" label="Adjust" variant="outline" className="h-12" busy={busy === "preview"} disabled={!!busy || !tweak.trim()} onRun={() => doPreview({ adjustFromPreviewId: preview.previewId, tweak })} />
            <AiActionButton feature="style_preview" label="Regenerate" variant="outline" className="h-12" busy={busy === "preview"} disabled={!!busy} onRun={() => doPreview()} />
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Wand2 className="size-3" /><RefreshCw className="hidden" />Adjust and Regenerate each make a new picture.</p>
        </div>
      )}
    </div>
  );
}

/** Saved previews for an order, or the whole shop, with fresh signed links. */
export function StylePreviewGallery({ orderId, limit = 12 }: { orderId?: string; limit?: number }) {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const { data } = useQuery({
    queryKey: ["style-previews", storeId, orderId],
    enabled: !!storeId,
    queryFn: async () => {
      let q = db.from("ai_style_previews").select("id, image_path, garment_type, created_at").eq("store_id", storeId).order("created_at", { ascending: false }).limit(limit);
      if (orderId) q = q.eq("order_id", orderId);
      const { data: rows } = await q;
      const list = (rows ?? []) as { id: string; image_path: string; garment_type: string | null }[];
      if (list.length === 0) return [];
      const { data: signed } = await supabase.storage.from("ai-studio").createSignedUrls(list.map((r) => r.image_path), 3600);
      return list.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }));
    },
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {data.map((p) => p.url && (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="relative block">
          <img src={p.url} alt={p.garment_type ?? "Style preview"} className="aspect-[3/4] w-full border border-border object-cover" loading="lazy" />
          <span className="absolute bottom-1 left-1 bg-primary/80 px-1 text-[9px] text-primary-foreground">AI preview</span>
        </a>
      ))}
    </div>
  );
}
