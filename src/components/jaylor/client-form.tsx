import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { normalizePhoneNG } from "@/lib/phone";
import { isMinor } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";
import { enqueue, isNetworkFailure } from "@/lib/offline/outbox";
import { useOnlineStatus } from "@/lib/use-online-status";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClientRow = Tables<"clients">;

export function ClientForm({
  open,
  onOpenChange,
  storeId,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  client?: ClientRow | null;
  onSaved: (client: ClientRow) => void;
}) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const isEdit = !!client;

  const [fullName, setFullName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [whatsappRaw, setWhatsappRaw] = useState("");
  const [gender, setGender] = useState<string>("");
  const [birthday, setBirthday] = useState("");
  const [address, setAddress] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [consentWhatsapp, setConsentWhatsapp] = useState(false);
  const [consentPhotos, setConsentPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; full_name: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setFullName(client?.full_name ?? "");
    setPhoneRaw(client?.phone ?? "");
    setWhatsappRaw(client?.whatsapp_phone ?? "");
    setGender(client?.gender ?? "");
    setBirthday(client?.birthday ?? "");
    setAddress(client?.address ?? "");
    setTagsRaw((client?.tags ?? []).join(", "));
    setGuardianName(client?.guardian_name ?? "");
    setGuardianPhone(client?.guardian_phone ?? "");
    setConsentWhatsapp(client?.consent_whatsapp ?? false);
    setConsentPhotos(client?.consent_photos ?? false);
    setPhoneError(null);
    setDuplicate(null);
  }, [open, client]);

  const minor = isMinor(birthday);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPhoneError(null);
    setDuplicate(null);

    const phone = normalizePhoneNG(phoneRaw);
    if (!phone) {
      setPhoneError("Enter a valid Nigerian phone number");
      return;
    }
    let whatsapp: string | null = null;
    if (whatsappRaw.trim()) {
      whatsapp = normalizePhoneNG(whatsappRaw);
      if (!whatsapp) {
        toast.error("Enter a valid WhatsApp number, or leave it blank");
        return;
      }
    }
    if (minor && (!guardianName.trim() || !guardianPhone.trim())) {
      toast.error("Guardian name and phone are required for clients under 18");
      return;
    }

    setBusy(true);
    try {
      if (online && (!isEdit || phone !== client?.phone)) {
        const { data: existing } = await supabase
          .from("clients")
          .select("id, full_name")
          .eq("store_id", storeId)
          .eq("phone", phone)
          .maybeSingle();
        if (existing) {
          setDuplicate(existing);
          setBusy(false);
          return;
        }
      }

      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const now = new Date().toISOString();

      const payload = {
        store_id: storeId,
        full_name: fullName.trim(),
        phone,
        whatsapp_phone: whatsapp,
        gender: gender || null,
        birthday: birthday || null,
        address: address.trim() || null,
        tags,
        guardian_name: minor ? guardianName.trim() : null,
        guardian_phone: minor ? guardianPhone.trim() : null,
        consent_whatsapp: consentWhatsapp,
        consent_whatsapp_at: consentWhatsapp
          ? client?.consent_whatsapp
            ? client.consent_whatsapp_at
            : now
          : null,
        consent_photos: consentPhotos,
        consent_photos_at: consentPhotos
          ? client?.consent_photos
            ? client.consent_photos_at
            : now
          : null,
      };

      if (isEdit && client) {
        const { data, error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", client.id)
          .select()
          .single();
        if (error) throw error;
        toast.success("Client updated");
        onSaved(data);
        onOpenChange(false);
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const insertPayload = { ...payload, created_by: userData.user?.id ?? null };
        if (!online) {
          await enqueue({
            kind: "client.create",
            storeId,
            label: `New client: ${payload.full_name}`,
            payload: insertPayload,
          });
          toast.success("Saved offline — will sync when you're back online");
          onOpenChange(false);
          return;
        }
        try {
          const { data, error } = await supabase
            .from("clients")
            .insert(insertPayload)
            .select()
            .single();
          if (error) throw error;
          toast.success("Client added");
          onSaved(data);
        } catch (error) {
          if (!isNetworkFailure(error)) throw error;
          await enqueue({
            kind: "client.create",
            storeId,
            label: `New client: ${payload.full_name}`,
            payload: insertPayload,
          });
          toast.success("Saved offline — will sync when you're back online");
        }
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save this client"));
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <form onSubmit={handleSubmit} className="space-y-4 px-1">
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input
          id="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={phoneRaw}
            onChange={(e) => setPhoneRaw(e.target.value)}
            placeholder="0803 123 4567"
            required
          />
          {phoneError && <p className="text-xs text-owed">{phoneError}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp (if different)</Label>
          <Input
            id="whatsapp"
            type="tel"
            value={whatsappRaw}
            onChange={(e) => setWhatsappRaw(e.target.value)}
            placeholder="Same as phone"
          />
        </div>
      </div>

      {duplicate && (
        <div className="rounded-xl border border-owed/40 bg-owed/10 p-3 text-sm">
          <p>
            <span className="font-medium">{duplicate.full_name}</span> already uses this phone
            number.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              onOpenChange(false);
              navigate({ to: "/clients/$clientId", params: { clientId: duplicate.id } });
            }}
          >
            View existing client
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger id="gender">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="birthday">Birthday</Label>
          <Input
            id="birthday"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </div>
      </div>

      {minor && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">
            This client is under 18. A guardian&apos;s details are required.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="guardian_name">Guardian name</Label>
              <Input
                id="guardian_name"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                required={minor}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guardian_phone">Guardian phone</Label>
              <Input
                id="guardian_phone"
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                required={minor}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="VIP, wedding, regular"
        />
      </div>

      <div className="space-y-3 rounded-xl border border-border p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">
            OK to send WhatsApp updates
            <span className="block text-xs text-muted-foreground">
              Order ready, balance due and reminder messages.
            </span>
          </span>
          <Switch checked={consentWhatsapp} onCheckedChange={setConsentWhatsapp} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">
            OK to show photos of their outfits
            <span className="block text-xs text-muted-foreground">
              In your storefront and shared galleries.
            </span>
          </span>
          <Switch checked={consentPhotos} onCheckedChange={setConsentPhotos} />
        </label>
      </div>

      {isEdit && !online && (
        <OfflineNotice label="Editing a client needs an internet connection." />
      )}

      <Button type="submit" className="w-full" disabled={busy || (isEdit && !online)}>
        {busy ? "Saving..." : isEdit ? "Save changes" : "Add client"}
      </Button>
    </form>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">{isEdit ? "Edit client" : "New client"}</SheetTitle>
          </SheetHeader>
          <div className="mt-2 pb-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client" : "New client"}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
