import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useCapacityForecast } from "@/lib/use-capacity";
import { useOnlineStatus } from "@/lib/use-online-status";

/** Growth+ dashboard chart: garments due per week vs capacity, next 6 weeks,
 *  overloaded weeks highlighted. Hidden if capacity isn't known yet (no
 *  measured throughput and no manual estimate set). */
export function CapacityLoadChart({ storeId }: { storeId: string }) {
  const online = useOnlineStatus();
  const { data } = useCapacityForecast(storeId, 6);

  if (!online) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Capacity this week
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Capacity check unavailable offline</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.capacity == null) return null;

  const chartData = data.weeks.map((w) => ({
    week: new Date(w.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    garments_due: w.garments_due,
    overloaded: w.overloaded,
  }));

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Load vs capacity (next 6 weeks)
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Capacity is about {data.capacity} garments/week
          {data.capacity_source === "estimate" ? " (your estimate)" : ""}.
        </p>
        <ChartContainer
          config={{ garments_due: { label: "Garments due", color: "var(--color-gold)" } }}
          className="mt-4 h-56 w-full"
        >
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ReferenceLine y={data.capacity} stroke="var(--color-owed)" strokeDasharray="4 4" />
            <Bar dataKey="garments_due" radius={4}>
              {chartData.map((w, i) => (
                <Cell key={i} fill={w.overloaded ? "var(--color-owed)" : "var(--color-gold)"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
