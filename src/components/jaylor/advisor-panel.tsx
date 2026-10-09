import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  FileText,
  ImagePlus,
  Mic,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { resizeImageFile } from "@/lib/image";
import { useAiCosts, useAiCredits } from "@/lib/ai-credits";
import { useOnlineStatus } from "@/lib/use-online-status";
import { isSpeechSynthesisSupported, speakText, stopSpeaking } from "@/lib/voice-recognition";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import type { OrderPrefill } from "@/components/jaylor/order-form";
import {
  useAdvisorThreads,
  useAdvisorMessages,
  useSendAdvisorMessage,
  useDeleteAdvisorThread,
  type AdvisorAttachment,
  type AdvisorDraftOrder,
} from "@/lib/advisor";

const TRIAL_DAYS = 30;
const TRIAL_NOTICE_KEY_PREFIX = "jaylor:advisor-trial-notice:";
const NEW_CONVERSATION_VALUE = "__new";
const ATTACHMENTS_BUCKET = "ask-jaylor-uploads";
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_RECORD_SECONDS = 120;

type AttachmentDraft = {
  id: string;
  file: File;
  previewUrl: string;
  mimeType: string;
  name: string;
  status: "uploading" | "done" | "error";
  path: string | null;
};

function isMediaRecorderSupported(): boolean {
  return typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices;
}

/** Reads a Blob to a base64 string (no data: prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the recording"));
    reader.readAsDataURL(blob);
  });
}

/** Attachments live in a private bucket, viewed through short-lived signed links, batched one call per message list. */
function useAttachmentUrls(paths: string[]) {
  const key = paths.join(",");
  return useQuery({
    queryKey: ["ask-jaylor-attachment-urls", key],
    enabled: paths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrls(paths, 3600);
      if (error) throw error;
      const map = new Map<string, string>();
      (data ?? []).forEach((item) => {
        if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
      });
      return map;
    },
  });
}

export function AdvisorPanel({
  storeId,
  storeCreatedAt,
  onOrderDraft,
}: {
  storeId: string;
  storeCreatedAt: string;
  /** Called when the advisor reads a draft order off a photo (e.g. a notebook page) that the user chooses to create. Never saved automatically. */
  onOrderDraft?: (prefill: OrderPrefill) => void;
}) {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [draftsForReplyText, setDraftsForReplyText] = useState<string | null>(null);
  const [draftsForLastReply, setDraftsForLastReply] = useState<AdvisorDraftOrder[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const freshConversationKey = useRef(crypto.randomUUID());

  const online = useOnlineStatus();
  const { run } = useAiCredits();
  const { data: costs } = useAiCosts();
  const { data: threads } = useAdvisorThreads(storeId);
  const { data: messages } = useAdvisorMessages(threadId);
  const send = useSendAdvisorMessage(storeId);
  const deleteThread = useDeleteAdvisorThread(storeId);
  const speechSupported = isSpeechSynthesisSupported();
  const micSupported = isMediaRecorderSupported();

  const attachmentPaths = (messages ?? []).flatMap((m) => (m.attachments ?? []).map((a) => a.path));
  const { data: attachmentUrls } = useAttachmentUrls(attachmentPaths);

  // Voice recording for the mic button.
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, send.isPending]);

  useEffect(() => {
    if (!open) return;
    const trialEnd = new Date(storeCreatedAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() < trialEnd) return;
    const key = `${TRIAL_NOTICE_KEY_PREFIX}${storeId}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      return;
    }
    toast("Your workroom's advisor is now on the Free plan's allowance.", {
      description: "Upgrade any time for a higher monthly limit and a stronger model.",
    });
  }, [open, storeCreatedAt, storeId]);

  useEffect(() => {
    if (!open) {
      stopSpeaking();
      setSpeakingId(null);
    }
  }, [open]);

  function startNewConversation() {
    setThreadId(null);
    setInput("");
    setAttachments([]);
    setDraftsForReplyText(null);
    setDraftsForLastReply([]);
    freshConversationKey.current = crypto.randomUUID();
  }

  // ----- attachments -----

  async function uploadAttachment(draft: AttachmentDraft) {
    try {
      const folder = threadId ?? freshConversationKey.current;
      const ext = draft.mimeType === "application/pdf" ? "pdf" : "jpg";
      const path = `${storeId}/${folder}/${draft.id}.${ext}`;
      const { error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(path, draft.file, { contentType: draft.mimeType });
      if (error) throw error;
      setAttachments((prev) =>
        prev.map((a) => (a.id === draft.id ? { ...a, status: "done", path } : a)),
      );
    } catch {
      setAttachments((prev) =>
        prev.map((a) => (a.id === draft.id ? { ...a, status: "error" } : a)),
      );
    }
  }

  async function addAttachment(file: File | undefined) {
    if (!file) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} photos or files per message.`);
      return;
    }
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      toast.error("Only photos and PDF files are supported.");
      return;
    }
    if (isPdf && file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("Files must be 10MB or smaller.");
      return;
    }
    let outFile = file;
    let mimeType = file.type;
    if (isImage) {
      outFile = await resizeImageFile(file, 1600, 0.8);
      mimeType = outFile.type || "image/jpeg";
      if (outFile.size > MAX_ATTACHMENT_BYTES) {
        toast.error("That photo is too large even after compressing. Please try a smaller photo.");
        return;
      }
    }
    const id = crypto.randomUUID();
    const draft: AttachmentDraft = {
      id,
      file: outFile,
      previewUrl: isImage ? URL.createObjectURL(outFile) : "",
      mimeType,
      name: file.name || (isPdf ? "file.pdf" : "photo.jpg"),
      status: "uploading",
      path: null,
    };
    setAttachments((prev) => [...prev, draft]);
    await uploadAttachment(draft);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function retryAttachment(id: string) {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "uploading" } : a)));
    const draft = attachments.find((a) => a.id === id);
    if (draft) void uploadAttachment({ ...draft, status: "uploading" });
  }

  // ----- voice input -----

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setRecording(false);
  }

  async function startRecording() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        void transcribe(blob, mimeType);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s + 1 >= MAX_RECORD_SECONDS) {
            stopRecording();
            return MAX_RECORD_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      const name = (e as DOMException)?.name;
      setMicError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was blocked. Allow it for this site in your browser's settings, then try again."
          : "Could not access the microphone.",
      );
    }
  }

  async function transcribe(blob: Blob, mimeType: string) {
    setTranscribing(true);
    const audioBase64 = await blobToBase64(blob);
    const format = mimeType.includes("mp4") ? "mp4" : "webm";
    const res = await run("voice_transcribe", {
      audioBase64,
      audioFormat: format,
      audioDurationSeconds: recordSeconds || 1,
    });
    setTranscribing(false);
    if (res.ok) {
      const transcript = ((res.result as { transcript?: string }).transcript ?? "").trim();
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    }
  }

  function toggleListen(messageId: string, text: string) {
    if (speakingId === messageId) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    speakText(text);
    setSpeakingId(messageId);
  }

  // ----- sending -----

  const readyAttachments = attachments.filter((a) => a.status === "done" && a.path);
  const hasAttachments = attachments.length > 0;
  const previewCost = hasAttachments
    ? costs?.["advisor_chat_vision"]?.credits
    : costs?.["advisor_chat"]?.credits;

  async function handleSend() {
    const text = input.trim();
    if (send.isPending || recording || transcribing) return;
    if (attachments.some((a) => a.status === "uploading")) {
      toast.error("Please wait for attachments to finish uploading.");
      return;
    }
    if (attachments.some((a) => a.status === "error")) {
      toast.error("One of your attachments failed to upload. Remove it or retry before sending.");
      return;
    }
    if (!text && readyAttachments.length === 0) return;
    const sentAttachments: AdvisorAttachment[] = readyAttachments.map((a) => ({
      path: a.path!,
      mimeType: a.mimeType,
      name: a.name,
    }));
    const restoreAttachments = attachments;
    setInput("");
    setAttachments([]);
    try {
      const result = await send.mutateAsync({
        threadId,
        message: text,
        attachments: sentAttachments,
      });
      setThreadId(result.threadId);
      if (result.drafts && result.drafts.length > 0) {
        setDraftsForReplyText(result.reply);
        setDraftsForLastReply(result.drafts);
      } else {
        setDraftsForReplyText(null);
        setDraftsForLastReply([]);
      }
    } catch {
      // useAiCredits().run() already showed the right toast or credit sheet.
      // Never lose what the tailor typed or attached.
      setInput(text);
      setAttachments(restoreAttachments);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this conversation?")) return;
    await deleteThread.mutateAsync(id);
    if (threadId === id) setThreadId(null);
  }

  function createOrderFromDraft(draft: AdvisorDraftOrder) {
    onOrderDraft?.({
      garment_type: draft.garment_type,
      quantity: draft.quantity,
      style_notes: draft.style_notes,
      price: draft.price,
      delivery_date: draft.delivery_date,
      rush: draft.rush,
    });
    setDraftsForLastReply((prev) => prev.filter((d) => d !== draft));
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        aria-label="Ask Jaylor"
        data-tour="ask-jaylor"
        className="fixed bottom-36 right-4 z-40 gap-2 rounded-none shadow-float lg:bottom-8 lg:right-8"
      >
        <Sparkles className="size-4" />
        Ask Jaylor
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader className="text-left">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="text-xl">Ask Jaylor</SheetTitle>
              <Button variant="outline" size="sm" onClick={startNewConversation}>
                <Plus className="size-4" />
                New
              </Button>
            </div>
            {threads && threads.length > 0 && (
              <Select
                value={threadId ?? NEW_CONVERSATION_VALUE}
                onValueChange={(value) =>
                  setThreadId(value === NEW_CONVERSATION_VALUE ? null : value)
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="New conversation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_CONVERSATION_VALUE}>New conversation</SelectItem>
                  {threads.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </SheetHeader>

          <ScrollArea className="mt-2 flex-1 pr-2">
            <div className="space-y-3 pb-2">
              {!threadId || !messages || messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ask about a client, a price, cash flow, or how to use any feature. Jaylor knows
                  your shop&apos;s own orders, payments and balances. You can also talk, or show it
                  a photo of a notebook page, a style, a fabric or a receipt.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(m.role === "user" ? "flex justify-end" : "flex justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] space-y-2 whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                        m.role === "user"
                          ? "bg-accent text-accent-foreground"
                          : "border border-border bg-card",
                      )}
                    >
                      {m.content}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {m.attachments.map((a) =>
                            a.mimeType === "application/pdf" ? (
                              <a
                                key={a.path}
                                href={attachmentUrls?.get(a.path) ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 rounded border border-border/60 bg-background/60 px-2 py-1 text-xs"
                              >
                                <FileText className="size-3.5" />
                                {a.name}
                              </a>
                            ) : (
                              <a
                                key={a.path}
                                href={attachmentUrls?.get(a.path) ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <img
                                  src={attachmentUrls?.get(a.path) ?? ""}
                                  alt={a.name}
                                  className="size-14 rounded border border-border/60 object-cover"
                                />
                              </a>
                            ),
                          )}
                        </div>
                      )}
                      {m.role === "assistant" && speechSupported && m.content && (
                        <button
                          type="button"
                          onClick={() => toggleListen(m.id, m.content)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {speakingId === m.id ? (
                            <>
                              <VolumeX className="size-3.5" /> Stop
                            </>
                          ) : (
                            <>
                              <Volume2 className="size-3.5" /> Listen
                            </>
                          )}
                        </button>
                      )}
                      {m.role === "assistant" &&
                        m.content === draftsForReplyText &&
                        draftsForLastReply.length > 0 && (
                          <div className="space-y-2 border-t border-border/60 pt-2">
                            {draftsForLastReply.map((d, i) => (
                              <div
                                key={i}
                                className="rounded-lg border border-gold/50 bg-background/60 p-2 text-xs"
                              >
                                <p className="font-medium">{d.garment_type ?? "Order"}</p>
                                {d.style_notes && (
                                  <p className="text-muted-foreground">{d.style_notes}</p>
                                )}
                                <p className="text-muted-foreground">
                                  {d.quantity > 1 ? `${d.quantity}x · ` : ""}
                                  {d.price ? `₦${d.price.toLocaleString()}` : "Price not given"}
                                  {d.delivery_date ? ` · due ${d.delivery_date}` : ""}
                                  {d.rush ? " · rush" : ""}
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="mt-1.5 h-7"
                                  onClick={() => createOrderFromDraft(d)}
                                >
                                  Create order
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                ))
              )}
              {send.isPending && (
                <div className="max-w-[85%] rounded-2xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                  Thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {threadId && (
            <button
              type="button"
              onClick={() => handleDelete(threadId)}
              className="mt-1 self-end text-xs text-muted-foreground hover:text-owed"
            >
              <Trash2 className="mr-1 inline size-3" />
              Delete conversation
            </button>
          )}

          <div className="mt-2 space-y-2 border-t border-border pt-3">
            {!online && (
              <OfflineNotice label="Voice, photos and files need an internet connection." />
            )}
            {micError && <p className="text-xs text-owed">{micError}</p>}

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <div key={a.id} className="relative">
                    {a.mimeType === "application/pdf" ? (
                      <div className="flex size-14 flex-col items-center justify-center gap-0.5 rounded border border-border bg-card text-center text-[10px]">
                        <FileText className="size-4" />
                        <span className="w-12 truncate px-0.5">{a.name}</span>
                      </div>
                    ) : (
                      <img
                        src={a.previewUrl}
                        alt={a.name}
                        className="size-14 rounded border border-border object-cover"
                      />
                    )}
                    {a.status === "uploading" && (
                      <div className="absolute inset-0 flex items-center justify-center rounded bg-background/70 text-[10px]">
                        Uploading…
                      </div>
                    )}
                    {a.status === "error" && (
                      <button
                        type="button"
                        onClick={() => retryAttachment(a.id)}
                        className="absolute inset-0 flex items-center justify-center rounded bg-owed/80 text-white"
                        aria-label="Retry upload"
                      >
                        <RefreshCw className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background"
                      aria-label="Remove attachment"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {recording && (
              <p className="text-xs text-muted-foreground">
                Recording… {recordSeconds}s / {MAX_RECORD_SECONDS}s
              </p>
            )}
            {transcribing && <p className="text-xs text-muted-foreground">Listening to that…</p>}

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                void addAttachment(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void addAttachment(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              hidden
              onChange={(e) => {
                void addAttachment(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            <div className="flex items-end gap-2">
              {micSupported && (
                <Button
                  type="button"
                  size="icon"
                  variant={recording ? "default" : "outline"}
                  disabled={!online || transcribing || send.isPending}
                  onClick={recording ? stopRecording : startRecording}
                  aria-label={recording ? "Stop recording" : "Record a question"}
                >
                  {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!online || attachments.length >= MAX_ATTACHMENTS}
                onClick={() => cameraRef.current?.click()}
                aria-label="Take a photo"
              >
                <Camera className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!online || attachments.length >= MAX_ATTACHMENTS}
                onClick={() => galleryRef.current?.click()}
                aria-label="Add a photo from your gallery"
              >
                <ImagePlus className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!online || attachments.length >= MAX_ATTACHMENTS}
                onClick={() => fileRef.current?.click()}
                aria-label="Attach a file"
              >
                <Paperclip className="size-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Ask a question…"
                rows={2}
                className="min-h-0 flex-1 resize-none"
                disabled={send.isPending}
              />
              <Button
                size="icon"
                onClick={() => void handleSend()}
                disabled={
                  send.isPending ||
                  recording ||
                  transcribing ||
                  (!input.trim() && readyAttachments.length === 0)
                }
              >
                <Send className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Photos and files are kept for 30 days, then deleted automatically.
              {previewCost != null && (input.trim() || attachments.length > 0)
                ? ` This will use ${previewCost} AI credit${previewCost === 1 ? "" : "s"}.`
                : ""}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
