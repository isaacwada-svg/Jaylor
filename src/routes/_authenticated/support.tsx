import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, FileText, Paperclip, X } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { SupportLink } from "@/components/jaylor/support-link";
import { SocialLinks } from "@/components/jaylor/social-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { resizeImageFile } from "@/lib/image";
import { useStore } from "@/lib/store-context";
import { SUPPORT_EMAIL } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/support")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Contact & support — Jaylor" },
      {
        name: "description",
        content: "Questions, a bug to report, or help with your store, send us a message.",
      },
    ],
  }),
  component: Support,
});

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt";

type PendingFile = { file: File; previewUrl: string | null };

function Support() {
  return (
    <AppShell>
      <SupportContent />
    </AppShell>
  );
}

function useUserContact() {
  return useQuery({
    queryKey: ["my-auth-user"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const fullName =
        (data.user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() ?? "";
      return { fullName, email: data.user?.email ?? "" };
    },
  });
}

function SupportContent() {
  const { currentStore } = useStore();
  const { data: profile } = useUserContact();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (profile?.fullName) setName((prev) => prev || profile.fullName);
    if (profile?.email) setEmail((prev) => prev || profile.email);
  }, [profile]);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const room = MAX_FILES - files.length;
    if (room <= 0) {
      toast(`Up to ${MAX_FILES} attachments per message.`);
      return;
    }
    const next = Array.from(list)
      .slice(0, room)
      .filter((f) => {
        if (f.size > MAX_BYTES) {
          toast.error(`${f.name} is bigger than 10 MB.`);
          return false;
        }
        return true;
      })
      .map((file) => ({
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      }));
    setFiles((prev) => [...prev, ...next]);
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!currentStore) return;
    setBusy(true);
    try {
      const attachmentPaths: string[] = [];
      for (const { file: original } of files) {
        const file = original.type.startsWith("image/")
          ? await resizeImageFile(original, 1600, 0.82)
          : original;
        const ext =
          (file.name.split(".").pop() ?? "bin")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 5) || "bin";
        const path = `${currentStore.id}/support/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage
          .from("attachments")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (up.error) throw new Error(`Couldn't upload ${original.name}.`);
        attachmentPaths.push(path);
      }

      const { error } = await supabase.from("leads").insert({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        message: message.trim() || null,
        source: "in_app_support",
        store_id: currentStore.id,
        attachment_paths: attachmentPaths,
      });
      if (error) throw error;
      setSent(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not send your message. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10 lg:px-8">
        <Card className="rounded-2xl">
          <CardContent className="p-6 text-center">
            <h1 className="text-xl">Thank you</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We&apos;ve received your message and will be in touch soon.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 lg:px-8 lg:py-10">
      <h1 className="text-3xl">Contact & support</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A question, a bug to report, or help with your store — send us a message and we&apos;ll get
        back to you.
      </p>

      <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-border bg-secondary/30 p-5">
        <SupportLink className="h-11 max-w-full px-4" />
        <p className="text-sm text-muted-foreground">
          Or email{" "}
          <a
            className="font-medium text-foreground hover:text-gold"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <SocialLinks showHandles className="flex flex-wrap items-center justify-center gap-6" />
      </div>

      <StitchDivider className="my-6" />

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="support-name">Your name</Label>
          <Input
            id="support-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="support-phone">Phone</Label>
            <Input
              id="support-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0803 123 4567"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-email">Email</Label>
            <Input
              id="support-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="support-message">How can we help?</Label>
          <Textarea
            id="support-message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="A question, a bug you've run into, or anything else"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Attachments</Label>
          <p className="text-xs text-muted-foreground">
            A screenshot of the problem helps a lot — up to {MAX_FILES} files, 10 MB each.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={files.length >= MAX_FILES}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-4" /> Attach file
            </Button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                if (cameraRef.current) cameraRef.current.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={files.length >= MAX_FILES}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="size-4" /> Take photo
            </Button>
          </div>

          {files.length > 0 && (
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <li key={i} className="relative border border-border">
                  {f.previewUrl ? (
                    <img
                      src={f.previewUrl}
                      alt={f.file.name}
                      className="h-20 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-20 flex-col items-center justify-center gap-1 p-1 text-center">
                      <FileText className="size-5 text-gold" />
                      <span className="truncate text-[10px]">{f.file.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${f.file.name}`}
                    onClick={() => removeFile(i)}
                    className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={busy || !name.trim() || !message.trim()}>
          {busy ? "Sending..." : "Send message"}
        </Button>
      </form>
    </div>
  );
}
