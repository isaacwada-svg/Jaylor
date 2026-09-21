import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { useOnlineStatus } from "@/lib/use-online-status";
import { isSpeechRecognitionSupported, startSpeechRecognition } from "@/lib/voice-recognition";
import { GARMENT_TYPES } from "@/lib/jaylor";
import type { OrderPrefill } from "@/components/jaylor/order-form";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MAX_RECORD_SECONDS = 60;

type ParsedOrderResult = OrderPrefill & { confidence?: "high" | "low" };

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

export function VoiceOrderDialog({
  open,
  onOpenChange,
  onParsed,
  storeId,
  canRecordAudio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (prefill: OrderPrefill) => void;
  storeId: string;
  /** Paid-plan-only: upload a short recording for server transcription, instead of device voice-typing. */
  canRecordAudio: boolean;
}) {
  const online = useOnlineStatus();
  const supported = isSpeechRecognitionSupported();
  const audioSupported = canRecordAudio && isMediaRecorderSupported();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsing, setParsing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const handleRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      handleRef.current?.stop();
      setListening(false);
      setTranscript("");
      stopRecording();
    }
  }, [open]);

  function toggleListening() {
    if (listening) {
      handleRef.current?.stop();
      setListening(false);
      return;
    }
    const handle = startSpeechRecognition({
      onInterim: setTranscript,
      onFinal: setTranscript,
      onEnd: () => setListening(false),
      onError: (message) => {
        toast.error(`Voice input stopped: ${message}`);
        setListening(false);
      },
    });
    if (!handle) {
      toast.error("Voice input isn't supported in this browser");
      return;
    }
    handleRef.current = handle;
    setListening(true);
  }

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
    setRecordSeconds(0);
  }

  async function startRecording() {
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
        void parseAudio(blob, mimeType);
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
    } catch {
      toast.error("Could not access the microphone");
    }
  }

  function handleParsed(result: ParsedOrderResult) {
    if (result.confidence === "low") {
      toast.message("Could only partly make that out — please check and fill in the details.");
    }
    onParsed(result);
    onOpenChange(false);
  }

  async function parseAudio(blob: Blob, mimeType: string) {
    setParsing(true);
    try {
      const audioBase64 = await blobToBase64(blob);
      const format = mimeType.includes("mp4") ? "mp4" : "webm";
      const { data, error } = await supabase.functions.invoke("voice-order", {
        body: {
          storeId,
          audioBase64,
          audioFormat: format,
          audioDurationSeconds: recordSeconds || 1,
          garmentTypes: GARMENT_TYPES,
          today: new Date().toISOString().slice(0, 10),
          triggeredByUserAction: true,
        },
      });
      if (error) throw error;
      handleParsed((data as { result: ParsedOrderResult }).result);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not understand this recording"));
    } finally {
      setParsing(false);
    }
  }

  async function parse() {
    if (!transcript.trim()) {
      toast.error("Say or type the order details first");
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-order", {
        body: {
          storeId,
          transcript: transcript.trim(),
          garmentTypes: GARMENT_TYPES,
          today: new Date().toISOString().slice(0, 10),
          triggeredByUserAction: true,
        },
      });
      if (error) throw error;
      handleParsed((data as { result: ParsedOrderResult }).result);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not understand this order"));
    } finally {
      setParsing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Voice order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!online ? (
            <OfflineNotice label="Voice orders need an internet connection." />
          ) : (
            <>
              {supported && (
                <Button
                  type="button"
                  variant={listening ? "default" : "outline"}
                  className="w-full"
                  onClick={toggleListening}
                  disabled={recording || parsing}
                >
                  {listening ? <Square className="size-4" /> : <Mic className="size-4" />}
                  {listening ? "Stop listening" : "Start speaking"}
                </Button>
              )}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {supported
                    ? "Speak the order, or edit/type below, then let AI fill in the details."
                    : "Voice input isn't supported in this browser — type the order details instead."}
                </p>
                <Textarea
                  rows={4}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="e.g. Ankara gown for Aisha, rush order, forty thousand naira, ready in one week"
                />
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={parse}
                disabled={parsing || recording || !transcript.trim()}
              >
                {parsing ? "Understanding..." : "Fill order form with AI"}
              </Button>
              <p className="text-xs text-muted-foreground">
                AI reads this into the order form for you to review before saving — nothing is
                created automatically.
              </p>

              {audioSupported && (
                <div className="space-y-2 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant={recording ? "default" : "outline"}
                    className="w-full"
                    disabled={parsing}
                    onClick={recording ? stopRecording : startRecording}
                  >
                    {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
                    {recording
                      ? `Stop recording (${MAX_RECORD_SECONDS - recordSeconds}s left)`
                      : "Or record audio instead"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Records up to {MAX_RECORD_SECONDS} seconds and sends it for transcription — a
                    paid-plan feature.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
