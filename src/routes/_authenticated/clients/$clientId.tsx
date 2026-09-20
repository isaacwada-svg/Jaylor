import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { ClientForm } from "@/components/jaylor/client-form";
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
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
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
      const { error } = await supabase.from("clients").delete().eq("id", client.id);
      if (error) throw error;
      toast.success("Client deleted");
      navigate({ to: "/clients" });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete this client"));
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
            <EmptyState
              title="No measurements yet"
              description="Take this client's first set of measurements when you create their next order."
            />
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
          <TabsContent value="messages" className="mt-6">
            <EmptyState
              title="No messages yet"
              description="WhatsApp reminders you send to this client will be logged here."
            />
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
