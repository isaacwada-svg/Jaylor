import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Mic, Paperclip, Square, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resizeImageFile } from "@/lib/image";
import { recordWav } from "@/lib/record-wav";
import { getVoiceAllowance, saveVoiceNote } from "@/lib/voice.functions";
import { Button } from "@/components/ui/button";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_SECONDS = 60;
const ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt";

type Attachment = {
  id: string;
  kind: "file" | "voice";
  path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  transcript: string | null;
  transcript_english: string | null;
  language: string | null;
  created_at: string;
  url?: string | null;
};

const kb = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Free voice notes (written down in any Nigerian language) and file attachments for one order. */
export function OrderNotesFiles({ storeId, orderId, clientId }: { storeId: string; orderId: string; clientId?: string | null }) {
  const qc = useQueryClient();
  const saveVoice = useServerFn(saveVoiceNote);
  const allowanceFn = useServerFn(getVoiceAllowance);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<Awaited<ReturnType<typeof recordWav>> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const key = ["order-attachments", orderId];
  const { data: items } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await db
        .from("order_attachments")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      const list = (data ?? []) as Attachment[];
      if (list.length === 0) return list;
      const { data: signed } = await supabase.storage.from("attachments").createSignedUrls(list.map((a) => a.path), 3600);
      return list.map((a, i) => ({ ...a, url: signed?.[i]?.signedUrl ?? null }));
    },
  });
  const { data: allowance } = useQuery({
    queryKey: ["voice-allowance", storeId],
    queryFn: () => allowanceFn({ data: { storeId } }),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["voice-allowance", storeId] });
  };
  const full = (items?.length ?? 0) >= MAX_FILES;

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  async function startRecording() {
    if (full) return void toast.error(`An order can have up to ${MAX_FILES} notes and files.`);
    try {
      recRef.current = await recordWav();
    } catch {
      return void toast.error("Please allow the microphone to record a voice note.");
    }
    setElapsed(0);
    setRecording(true);
    const started = Date.now();
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (s >= MAX_SECONDS) void stopRecording();
    }, 250);
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const rec = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (!rec) return;
    setBusy("voice");
    try {
      const { file, seconds } = await rec.stop();
      const path = `${storeId}/voice/${crypto.randomUUID()}.wav`;
      const up = await supabase.storage.from("attachments").upload(path, file, { contentType: "audio/wav" });
      if (up.error) throw new Error("Couldn't upload the voice note. Please try again.");
      const res = await saveVoice({
        data: { storeId, path, orderId, seconds: Math.min(seconds, 120), sizeBytes: file.size, ...(clientId ? { clientId } : {}) },
      });
      if (res.notice) toast(res.notice);
      else toast.success("Voice note saved and written down");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the voice note.");
    } finally {
      setBusy(null);
    }
  }

  async function attach(fileList: FileList | null) {
    if (!fileList?.length) return;
    const room = MAX_FILES - (items?.length ?? 0);
    const files = Array.from(fileList).slice(0, Math.max(0, room));
    if (files.length < fileList.length) toast(`Only ${MAX_FILES} notes and files per order.`);
    setBusy("file");
    for (const original of files) {
      const file = original.type.startsWith("image/") ? await resizeImageFile(original, 1600, 0.82) : original;
      if (file.size > MAX_BYTES) {
        toast.error(`${original.name} is bigger than 10 MB.`);
        continue;
      }
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
      const path = `${storeId}/files/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (up.error) {
        toast.error(`Couldn't upload ${original.name}.`);
        continue;
      }
      const { data: user } = await supabase.auth.getUser();
      const { error } = await db.from("order_attachments").insert({
        store_id: storeId,
        order_id: orderId,
        client_id: clientId ?? null,
        kind: "file",
        path,
        file_name: original.name.slice(0, 120),
        mime_type: file.type || null,
        size_bytes: file.size,
        created_by: user.user?.id,
      });
      if (error) toast.error(`Couldn't save ${original.name}.`);
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }

  async function remove(a: Attachment) {
    if (!confirm(`Delete ${a.file_name}?`)) return;
    await supabase.storage.from("attachments").remove([a.path]);
    const { error } = await db.from("order_attachments").delete().eq("id", a.id);
    if (error) return void toast.error("Couldn't delete. Please try again.");
    refresh();
  }

  return (
    <section className="mt-8">
      <h2 className="text-xl">Notes and files</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Record a voice note in English, Pidgin, Yoruba, Hausa, Igbo or any language. We write it down for free
        {allowance ? ` (${allowance.left} of ${allowance.limit} left today)` : ""}. Attach photos or documents up to 10 MB.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {recording ? (
          <Button className="h-12" variant="destructive" onClick={stopRecording}>
            <Square className="size-4" /> Stop · {elapsed}s / {MAX_SECONDS}s
          </Button>
        ) : (
          <Button className="h-12" onClick={startRecording} disabled={!!busy}>
            <Mic className="size-4" /> {busy === "voice" ? "Saving…" : "Voice note"}
          </Button>
        )}
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => attach(e.target.files)} />
        <Button className="h-12" variant="outline" disabled={!!busy || recording || full} onClick={() => fileRef.current?.click()}>
          <Paperclip className="size-4" /> {busy === "file" ? "Uploading…" : "Attach file"}
        </Button>
      </div>

      <ul className="mt-4 space-y-3">
        {(items ?? []).map((a) => (
          <li key={a.id} className="border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {a.kind === "voice" ? (
                  <>
                    <p className="text-sm font-medium">
                      {a.file_name}
                      {a.language ? ` · ${a.language}` : ""}
                    </p>
                    {a.url && <audio controls src={a.url} className="mt-2 w-full" preload="none" />}
                    {a.transcript && <p className="mt-2 whitespace-pre-wrap text-sm">{a.transcript}</p>}
                    {a.transcript_english && a.transcript_english !== a.transcript && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">English: {a.transcript_english}</p>
                    )}
                  </>
                ) : a.mime_type?.startsWith("image/") && a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-3">
                    <img src={a.url} alt={a.file_name} className="h-16 w-16 border border-border object-cover" loading="lazy" />
                    <span className="truncate text-sm">{a.file_name} · {kb(a.size_bytes)}</span>
                  </a>
                ) : (
                  <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline-offset-2 hover:underline">
                    <FileText className="size-5 shrink-0 text-gold" />
                    <span className="truncate">{a.file_name} · {kb(a.size_bytes)}</span>
                  </a>
                )}
              </div>
              <Button size="icon" variant="ghost" aria-label={`Delete ${a.file_name}`} onClick={() => remove(a)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
