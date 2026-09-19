import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Jaylor" },
      {
        name: "description",
        content:
          "Your own storefront: show styles, take deposits and let clients order straight from WhatsApp.",
      },
      { property: "og:title", content: "Shop — Jaylor" },
      {
        property: "og:description",
        content: "Show your styles, take deposits and receive orders from WhatsApp.",
      },
    ],
  }),
  component: Shop,
});

function Shop() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">Shop</h1>
        <EmptyState
          title="Your storefront is waiting"
          description="Add your first style with a photo and price, and share one beautiful link."
          action={<Button>Add a style</Button>}
        />
      </div>
    </AppShell>
  );
}
