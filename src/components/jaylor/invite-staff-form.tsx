import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function InviteStaffForm({
  open,
  onOpenChange,
  storeId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"manager" | "tailor">("tailor");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPhone("");
    setRole("tailor");
    setInviteLink(null);
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: invite, error } = await supabase
        .from("store_invites")
        .insert({
          store_id: storeId,
          email: email.trim() || null,
          phone: phone.trim() || null,
          role,
          invited_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      setInviteLink(`${window.location.origin}/join/${invite.token}`);
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create this invite"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
        </DialogHeader>
        {inviteLink ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Share this link — it expires in 7 days.</p>
            <div className="rounded-xl border border-border bg-accent/30 p-3 text-sm break-all">
              {inviteLink}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  navigator.clipboard
                    .writeText(inviteLink)
                    .then(() => toast.success("Link copied"))
                    .catch(() => toast.error("Could not copy link"));
                }}
              >
                Copy link
              </Button>
              {phone.trim() && (
                <Button asChild className="flex-1">
                  <a
                    href={`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(`You're invited to join us on Jaylor: ${inviteLink}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" />
                    Send on WhatsApp
                  </a>
                </Button>
              )}
            </div>
            <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "manager" | "tailor")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tailor">Tailor</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email (optional)</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-phone">Phone (optional)</Label>
              <Input
                id="invite-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0803 123 4567"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating..." : "Create invite link"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
