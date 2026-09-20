import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, ImagePlus, MessageCircle, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneNG } from "@/lib/phone";
import { resizeImageFile } from "@/lib/image";
import { getErrorMessage } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";
import { uploadDesignSelfie } from "@/lib/design-photos.functions";
import {
  clearDesignDraft,
  loadDesignDraft,
  saveDesignDraft,
  type AiDesignDraft,
} from "@/lib/ai-design-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PhotoLightbox } from "@/components/jaylor/photo-lightbox";

type Step = "form" | "generating" | "result" | "payment";

const MEASUREMENT_FIELDS = [
  { key: "chest", label: "Chest / bust" },
  { key: "waist", label: "Waist" },
  { key: "hip", label: "Hip" },
  { key: "height", label: "Height" },
] as const;

export function AiDesignGenerator({
  storeId,
  storeName,
  whatsappNumber,
}: {
  storeId: string;
  storeName: string;
  whatsappNumber: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("form");

  const [clientName, setClientName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [description, setDescription] = useState("");
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [selfieConsent, setSelfieConsent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultToken, setResultToken] = useState<string | null>(null);
  const [resultDesignId, setResultDesignId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selected, setSelected] = useState(false);

  // Resume after returning from a Paystack redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference) return;

    const draft = loadDesignDraft();
    if (!draft || draft.storeId !== storeId) return;

    window.history.replaceState({}, "", window.location.pathname);
    setClientName(draft.clientName);
    setPhoneRaw(draft.phone);
    setDescription(draft.description);
    setMeasurements(draft.measurements);
    setSelfiePath(draft.selfiePath);
    setOpen(true);
    setStep("generating");

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-design-payment", {
          body: { reference },
        });
        if (error) throw error;
        if ((data as { status: string }).status !== "success") {
          toast.error("Payment wasn't confirmed. You can try again.");
          setStep("form");
          return;
        }
        await runGenerate({
          storeId,
          clientName: draft.clientName,
          phone: draft.phone,
          description: draft.description,
          measurements: draft.measurements,
          selfiePath: draft.selfiePath,
        });
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not confirm your payment"));
        setStep("form");
      } finally {
        clearDesignDraft();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelfie(file: File | null) {
    if (!file) return;
    if (!selfieConsent) {
      toast.error("Please agree to share your photo first");
      return;
    }
    setUploadingSelfie(true);
    try {
      const resized = await resizeImageFile(file, 1000, 0.8);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that photo"));
        reader.readAsDataURL(resized);
      });
      if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
        throw new Error("Please choose a photo in JPG format");
      }
      // Uploaded server-side so the photo lands in a private bucket.
      const { path } = await uploadDesignSelfie({ data: { storeId, dataUrl } });
      setSelfiePath(path);
      setSelfiePreview(dataUrl);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not upload your photo"));
    } finally {
      setUploadingSelfie(false);
    }
  }

  async function runGenerate(input: {
    storeId: string;
    clientName: string;
    phone: string;
    description: string;
    measurements: Record<string, string>;
    selfiePath: string | null;
  }) {
    setStep("generating");
    try {
      const { data, error } = await supabase.functions.invoke("generate-design", { body: input });
      if (error) throw error;
      const body = data as {
        payment_required?: boolean;
        amount?: number;
        result?: { id: string; image_url: string; share_token: string };
      };
      if (body.payment_required) {
        setPaymentAmount(body.amount ?? 0);
        setStep("payment");
        return;
      }
      if (body.result) {
        setResultImage(body.result.image_url);
        setResultToken(body.result.share_token);
        setResultDesignId(body.result.id);
        setStep("result");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not generate your design"));
      setStep("form");
    }
  }

  async function handleSubmit() {
    const phone = normalizePhoneNG(phoneRaw);
    if (!clientName.trim() || !phone || !description.trim()) {
      toast.error("Fill in your name, phone and describe the style you want");
      return;
    }
    await runGenerate({
      storeId,
      clientName: clientName.trim(),
      phone,
      description: description.trim(),
      measurements,
      selfiePath,
    });
  }

  async function payViaBankTransfer() {
    const phone = normalizePhoneNG(phoneRaw);
    if (!phone) return;
    setBusy(true);
    try {
      const draft: AiDesignDraft = {
        storeId,
        clientName: clientName.trim(),
        phone,
        description: description.trim(),
        measurements,
        selfiePath,
      };
      const callbackUrl = `${window.location.origin}${window.location.pathname}`;
      const { data, error } = await supabase.functions.invoke("create-design-payment", {
        body: { storeId, phone, callbackUrl },
      });
      if (error) throw error;
      const { authorization_url, reference } = data as {
        authorization_url: string;
        reference: string;
      };
      saveDesignDraft({ ...draft, paymentReference: reference });
      window.location.href = authorization_url;
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not start payment"));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("form");
    setClientName("");
    setPhoneRaw("");
    setDescription("");
    setMeasurements({});
    setSelfiePath(null);
    setSelfiePreview(null);
    setSelfieConsent(false);
    setResultImage(null);
    setResultToken(null);
    setResultDesignId(null);
    setPaymentAmount(null);
    setSelected(false);
  }

  async function markSelected() {
    if (!resultDesignId || selected) return;
    const phone = normalizePhoneNG(phoneRaw);
    if (!phone) return;
    setSelected(true);
    try {
      await supabase.functions.invoke("select-ai-design", {
        body: { designId: resultDesignId, phone },
      });
    } catch {
      // Best-effort — the store owner already sees every generated design either way.
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="mt-4 border-gold/50"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Sparkles className="size-4 text-gold" />
        Try an AI style preview
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">AI style preview</SheetTitle>
          </SheetHeader>

          <div className="mt-2 space-y-4 pb-4">
            {step === "form" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Describe the style you want and see a preview before you commit. Your first
                  preview is free.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="design-name">Your name</Label>
                  <Input
                    id="design-name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="design-phone">WhatsApp number</Label>
                  <Input
                    id="design-phone"
                    value={phoneRaw}
                    onChange={(e) => setPhoneRaw(e.target.value)}
                    placeholder="0803 123 4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="design-description">Describe the style</Label>
                  <Textarea
                    id="design-description"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Ankara gown, off-shoulder, fitted waist, knee-length, gold and navy"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {MEASUREMENT_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-2">
                      <Label htmlFor={`m-${f.key}`}>{f.label} (optional)</Label>
                      <Input
                        id={`m-${f.key}`}
                        value={measurements[f.key] ?? ""}
                        onChange={(e) =>
                          setMeasurements((m) => ({ ...m, [f.key]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-2 rounded-xl border border-border p-3">
                  <p className="text-sm font-medium">Add your photo (optional)</p>
                  <p className="text-xs text-muted-foreground">
                    So the preview can put a face to the design. Not required.
                  </p>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={selfieConsent}
                      onCheckedChange={(v) => setSelfieConsent(v === true)}
                    />
                    I agree to share my photo to generate this preview.
                  </label>
                  {selfiePreview ? (
                    <div className="relative w-24">
                      <img src={selfiePreview} alt="" className="size-24 rounded-xl object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setSelfiePath(null);
                          setSelfiePreview(null);
                        }}
                        aria-label="Remove photo"
                        className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-background shadow-sm"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selfieConsent || uploadingSelfie}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadingSelfie ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ImagePlus className="size-4" />
                      )}
                      Add photo
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handleSelfie(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </div>

                <Button className="w-full" onClick={handleSubmit}>
                  Generate my style preview
                </Button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  Prefer to choose from {storeName}&apos;s own designs instead?
                </button>
              </>
            )}

            {step === "generating" && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 className="size-8 animate-spin text-gold" />
                <p className="text-sm text-muted-foreground">
                  Creating your style preview — this can take a moment.
                </p>
              </div>
            )}

            {step === "result" && resultImage && (
              <div className="space-y-3 text-center">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="block w-full cursor-zoom-in"
                  aria-label="View full size"
                >
                  <img src={resultImage} alt="Your style preview" className="mx-auto rounded-2xl" />
                </button>
                <p className="text-xs text-muted-foreground">Tap the photo to view full size</p>
                <p className="text-sm text-muted-foreground">
                  Show this to {storeName} to have it made for you.
                </p>
                {resultToken && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        const url = `${window.location.origin}/design/${resultToken}`;
                        navigator.clipboard
                          .writeText(url)
                          .then(() =>
                            toast.success("Link copied — save it to see this design again"),
                          )
                          .catch(() => toast.error("Could not copy the link"));
                      }}
                    >
                      Save / copy link
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        const url = `${window.location.origin}/design/${resultToken}`;
                        if (navigator.share) {
                          navigator
                            .share({ url, text: "My style preview from Jaylor" })
                            .catch(() => {});
                          return;
                        }
                        navigator.clipboard
                          .writeText(url)
                          .then(() => toast.success("Link copied to share"))
                          .catch(() => toast.error("Could not copy the link"));
                      }}
                    >
                      Share
                    </Button>
                  </div>
                )}
                {whatsappNumber && (
                  <Button asChild className="w-full" onClick={markSelected}>
                    <a
                      href={whatsappLink(
                        whatsappNumber,
                        `Hi, I made an AI style preview on your shop page: "${description}". Please sew this for me.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-4" />
                      Use this design — send to {storeName}
                    </a>
                  </Button>
                )}
                {selected && (
                  <p className="text-xs text-paid">
                    {storeName} has been notified about this design.
                  </p>
                )}
              </div>
            )}

            {step === "payment" && (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Your free preview is used. A small fee of{" "}
                  {paymentAmount ? `₦${(paymentAmount / 100).toLocaleString()}` : "a small amount"}{" "}
                  covers this one — pay by bank transfer to continue.
                </p>
                <Button className="w-full" onClick={payViaBankTransfer} disabled={busy}>
                  {busy ? "Starting..." : "Pay by bank transfer"}
                </Button>
                {whatsappNumber && (
                  <Button variant="outline" className="w-full" asChild>
                    <a
                      href={whatsappLink(
                        whatsappNumber,
                        `Hi, I'd like a style like this: "${description}". Can you help without the AI preview?`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-4" />
                      Message {storeName} instead
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Rendered as a sibling of Sheet, not nested inside it: SheetContent
          animates with a CSS transform, which would create a new containing
          block and break this lightbox's position:fixed full-screen sizing. */}
      <PhotoLightbox
        photos={resultImage ? [resultImage] : []}
        index={lightboxOpen && resultImage ? 0 : null}
        onIndexChange={() => {}}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
