import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "Orders — Jaylor" },
      {
        name: "description",
        content:
          "Track every garment from Received to Collected, with fittings, balances and delivery dates.",
      },
      { property: "og:title", content: "Orders — Jaylor" },
      {
        property: "og:description",
        content: "Track every garment from Received to Collected in one calm workroom view.",
      },
    ],
  }),
  component: Orders,
});

function Orders() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">Orders</h1>
        <EmptyState
          title="No orders yet"
          description="Create your first order and Jaylor will track it from cutting to collection."
          action={<Button>New order</Button>}
        />
      </div>
    </AppShell>
  );
}
