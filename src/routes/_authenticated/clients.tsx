import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Jaylor" },
      {
        name: "description",
        content:
          "Keep client details, versioned measurements and order history together, ready for the next fitting.",
      },
      { property: "og:title", content: "Clients — Jaylor" },
      {
        property: "og:description",
        content: "Client details, versioned measurements and order history in one place.",
      },
    ],
  }),
  component: Clients,
});

function Clients() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">Clients</h1>
        <EmptyState
          title="Your client book is empty"
          description="Add a client once, and their measurements stay ready for every future order."
          action={<Button>New client</Button>}
        />
      </div>
    </AppShell>
  );
}
