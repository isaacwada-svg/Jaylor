import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { MoneyText } from "@/components/jaylor/money-text";
import { LockedFeature } from "@/components/jaylor/locked-feature";
import { ORDER_STATUSES } from "@/lib/jaylor";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jaylor — Every order tracked. Every naira collected." },
      {
        name: "description",
        content:
          "Jaylor is the premium business app for tailors and fashion houses: orders, measurements, payments and reminders in one calm place.",
      },
      { property: "og:title", content: "Jaylor — Every order tracked. Every naira collected." },
      {
        property: "og:description",
        content:
          "Orders, measurements, payments and client reminders for tailors and fashion houses in Nigeria.",
      },
    ],
  }),
  component: Home,
});

const DUE = [
  { client: "Mama Blessing", item: "Aso-oke gown", status: "Fitting" as const, due: "Fri, 26 Sep" },
  {
    client: "Chief Adeyemi",
    item: "Agbada, 3-piece",
    status: "Sewing" as const,
    due: "Sat, 27 Sep",
  },
  { client: "Ngozi O.", item: "Ankara two-piece", status: "Ready" as const, due: "Mon, 29 Sep" },
];

function Home() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">Abuja, Nigeria</p>
        <h1 className="mt-2 text-3xl leading-tight lg:text-4xl">Good afternoon, Isaac</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every order tracked. Every naira collected.
        </p>

        <StitchDivider className="my-6" />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Money owed"
            value={<MoneyText amount={412500} variant="owed" />}
            hint="9 clients"
          />
          <Stat
            label="Collected this month"
            value={<MoneyText amount={1285000} variant="paid" />}
            hint="24 orders"
          />
          <Stat
            label="Due this week"
            value={<span className="figures text-2xl">7</span>}
            hint="2 overdue"
          />
          <Stat
            label="In the workroom"
            value={<span className="figures text-2xl">18</span>}
            hint="Active jobs"
          />
        </div>

        <section className="mt-8">
          <div className="flex items-end justify-between">
            <h2 className="text-xl">Due soon</h2>
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {DUE.map((o) => (
              <Card key={o.client} className="rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{o.client}</p>
                      <p className="truncate text-sm text-muted-foreground">{o.item}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-gold text-gold">
                      {o.due}
                    </Badge>
                  </div>
                  <StitchTrack
                    steps={ORDER_STATUSES}
                    currentIndex={ORDER_STATUSES.indexOf(o.status)}
                    className="mt-5"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl">Grow with Business</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Locked features stay visible, so you always know what is next.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <LockedFeature
              tier="Business"
              title="Staff job board"
              value="Assign jobs to tailors and see each person's workload at a glance."
            >
              <Card className="rounded-2xl">
                <CardContent className="p-5">
                  <p className="font-medium">Staff job board</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    3 tailors · 18 active jobs · 2 overdue
                  </p>
                </CardContent>
              </Card>
            </LockedFeature>
            <LockedFeature
              tier="Business"
              title="Expenses and net profit"
              value="Track fabric, transport and staff costs to see what you really keep."
            >
              <Card className="rounded-2xl">
                <CardContent className="p-5">
                  <p className="font-medium">Expenses and net profit</p>
                  <p className="mt-1 text-sm text-muted-foreground">Last month: net ₦486,000</p>
                </CardContent>
              </Card>
            </LockedFeature>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
