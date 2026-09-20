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

export function VoiceOrderDialog({
  open,
  onOpenChange,
  onParsed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (prefill: OrderPrefill) => void;
}) {
  const online = useOnlineStatus();
  const supported = isSpeechRecognitionSupported();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsing, setParsing] = useState(false);
  const handleRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    if (!open) {
      handleRef.current?.stop();
      setListening(false);
      setTranscript("");
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

  async function parse() {
    if (!transcript.trim()) {
      toast.error("Say or type the order details first");
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-order", {
        body: {
          transcript: transcript.trim(),
          garmentTypes: GARMENT_TYPES,
          today: new Date().toISOString().slice(0, 10),
        },
      });
      if (error) throw error;
      const result = (data as { result: OrderPrefill }).result;
      onParsed(result);
      onOpenChange(false);
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
                disabled={parsing || !transcript.trim()}
              >
                {parsing ? "Understanding..." : "Fill order form with AI"}
              </Button>
              <p className="text-xs text-muted-foreground">
                AI reads this into the order form for you to review before saving — nothing is
                created automatically.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
