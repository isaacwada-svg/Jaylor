import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { ClientForm } from "@/components/jaylor/client-form";
import { MeasurementsTab } from "@/components/jaylor/measurements-tab";
import { SendMeasureLinkButton } from "@/components/jaylor/send-measure-link-button";
import { PaymentReliabilityBadge } from "@/components/jaylor/payment-reliability-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { formatPhoneNG } from "@/lib/phone";
import { getFunctionErrorMessage } from "@/lib/utils";
import { useClientMoments, MOMENT_TYPE_LABELS } from "@/lib/moments";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [{ title: "Client — Jaylor" }],
  }),
  component: ClientProfile,
});

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function ClientProfile() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentRole } = useStore();
  const canDelete = currentRole === "owner" || currentRole === "manager";

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  async function handleDelete() {
    if (!client) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-client", {
        body: { storeId: client.store_id, clientId: client.id },
      });
      if (error) throw error;
      toast.success("Client deleted");
      navigate({ to: "/clients" });
    } catch (error) {
      toast.error(await getFunctionErrorMessage(error, "Could not delete this client"));
      setDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="mt-4 h-64 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!client) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <EmptyState
            title="Client not found"
            description="This client may have been deleted, or belongs to a different store."
            action={
              <Button asChild>
                <Link to="/clients">Back to clients</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  const whatsappNumber = (client.whatsapp_phone ?? client.phone).replace(/\D/g, "");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <Link
          to="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Clients
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarFallback className="text-lg">{initials(client.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl">{client.full_name}</h1>
              <p className="figures text-sm text-muted-foreground">{formatPhoneNG(client.phone)}</p>
              <div className="mt-2">
                <PaymentReliabilityBadge clientId={client.id} showDepositHint />
              </div>
              {client.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {client.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" asChild aria-label="Message on WhatsApp">
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noreferrer"
                className={!client.consent_whatsapp ? "pointer-events-none opacity-40" : undefined}
              >
                <MessageCircle className="size-4" />
              </a>
            </Button>
            <SendMeasureLinkButton
              storeId={client.store_id}
              clientId={client.id}
              clientName={client.full_name}
              clientPhone={client.phone}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Edit client"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-4" />
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="icon"
                aria-label="Delete client"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4 text-owed" />
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="overview" className="mt-8">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow
                label="Gender"
                value={
                  client.gender
                    ? client.gender.charAt(0).toUpperCase() + client.gender.slice(1)
                    : "Not set"
                }
              />
              <InfoRow label="Address" value={client.address || "Not recorded"} />
              <InfoRow
                label="Birthday"
                value={
                  client.birthday ? new Date(client.birthday).toLocaleDateString() : "Not recorded"
                }
              />
              <InfoRow label="Notes" value={client.notes || "None"} />
              <InfoRow
                label="Guardian"
                value={
                  client.guardian_name
                    ? `${client.guardian_name} · ${client.guardian_phone ?? ""}`
                    : "Not applicable"
                }
              />
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Total spent, balance owed and last visit will show here once orders and payments are
              tracked.
            </p>
          </TabsContent>

          <TabsContent value="measurements" className="mt-6">
            <MeasurementsTab client={client} />
          </TabsContent>
          <TabsContent value="orders" className="mt-6">
            <EmptyState
              title="No orders yet"
              description="Orders you create for this client will appear here."
            />
          </TabsContent>
          <TabsContent value="payments" className="mt-6">
            <EmptyState
              title="No payments yet"
              description="Payments recorded against this client's orders will appear here."
            />
          </TabsContent>
          <TabsContent value="messages" className="mt-6 space-y-6">
            <StyleBookCard clientId={clientId} />
            <ClientMomentsLog clientId={clientId} />
          </TabsContent>
        </Tabs>
      </div>

      <ClientForm
        open={editOpen}
        onOpenChange={setEditOpen}
        storeId={client.store_id}
        client={client}
        onSaved={(updated) => {
          queryClient.setQueryData(["client", clientId], updated);
          queryClient.invalidateQueries({ queryKey: ["clients", client.store_id] });
        }}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {client.full_name}?</DialogTitle>
            <DialogDescription>
              This permanently removes their record. Type their name to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-name">Full name</Label>
            <Input
              id="confirm-name"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== client.full_name || deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Delete client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

// clients.style_book_token/style_book_revoked are new columns generated
// Supabase types won't know about until types.ts is regenerated -- same
// drift as every other freshly-migrated column this session.
type StyleBookClient = { style_book_token: string; style_book_revoked: boolean };
const styleBookDb = supabase as unknown as {
  from(table: "clients"): {
    select(cols: string): {
      eq(
        col: string,
        value: string,
      ): {
        single(): Promise<{ data: StyleBookClient | null; error: { message: string } | null }>;
      };
    };
  };
};
const styleBookRpc = supabase.rpc as unknown as (
  fn: "set_style_book_revoked",
  args: { p_client_id: string; p_revoked: boolean },
) => Promise<{ error: { message: string } | null }>;

function StyleBookCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["style-book-token", clientId],
    queryFn: async () => {
      const { data, error } = await styleBookDb
        .from("clients")
        .select("style_book_token, style_book_revoked")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  async function handleToggle(revoked: boolean) {
    setBusy(true);
    try {
      const { error } = await styleBookRpc("set_style_book_revoked", {
        p_client_id: clientId,
        p_revoked: revoked,
      });
      if (error) throw new Error(error.message);
      await queryClient.invalidateQueries({ queryKey: ["style-book-token", clientId] });
      toast.success(revoked ? "Style Book link turned off" : "Style Book link turned on");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the link");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!data || data.style_book_revoked) return;
    const url = `${window.location.origin}/style/${data.style_book_token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  if (!data) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-medium">Style Book</p>
      <p className="mt-1 text-sm text-muted-foreground">
        A private link showing every garment made for this client, with photos and dates. No prices.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={data.style_book_revoked} onClick={handleCopy}>
          Copy link
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => handleToggle(!data.style_book_revoked)}
        >
          {data.style_book_revoked ? "Turn on" : "Turn off"}
        </Button>
      </div>
    </div>
  );
}

function ClientMomentsLog({ clientId }: { clientId: string }) {
  const { data: moments, isLoading } = useClientMoments(clientId);

  if (isLoading) return <Skeleton className="h-24 rounded-2xl" />;

  if (!moments || moments.length === 0) {
    return (
      <EmptyState
        title="No moments yet"
        description="Birthdays, festive greetings and check-ins you send this client will be logged here."
      />
    );
  }

  return (
    <div className="space-y-2">
      {moments.map((moment) => (
        <div
          key={moment.id}
          className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium">{MOMENT_TYPE_LABELS[moment.type]}</p>
            <p className="mt-0.5 truncate text-muted-foreground">{moment.message}</p>
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <p className="capitalize">{moment.status}</p>
            <p>{new Date(moment.sent_at ?? moment.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
