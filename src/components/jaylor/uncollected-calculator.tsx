import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/jaylor";

export function UncollectedCalculator() {
  const [orders, setOrders] = useState(30);
  const [avgValue, setAvgValue] = useState(25000);
  const [unpaidShare, setUnpaidShare] = useState(20);

  const uncollected = Math.round(orders * avgValue * (unpaidShare / 100) * 0.5);

  return (
    <section className="border-t border-border/60 py-16 lg:py-20">
      <div className="mx-auto w-full max-w-3xl px-4 lg:px-8">
        <h2 className="text-center text-2xl lg:text-3xl">How much is your notebook costing you?</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Move the sliders to match your shop.
        </p>

        <Card className="mt-8 rounded-2xl">
          <CardContent className="space-y-6 p-6">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Orders per month</span>
                <span className="figures font-medium">{orders}</span>
              </div>
              <Slider
                className="mt-3"
                min={5}
                max={100}
                step={1}
                value={[orders]}
                onValueChange={([v]) => setOrders(v ?? orders)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Average order value</span>
                <span className="figures font-medium">{formatMoney(avgValue)}</span>
              </div>
              <Slider
                className="mt-3"
                min={5000}
                max={150000}
                step={1000}
                value={[avgValue]}
                onValueChange={([v]) => setAvgValue(v ?? avgValue)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Share of orders with a balance left unpaid
                </span>
                <span className="figures font-medium">{unpaidShare}%</span>
              </div>
              <Slider
                className="mt-3"
                min={5}
                max={40}
                step={1}
                value={[unpaidShare]}
                onValueChange={([v]) => setUnpaidShare(v ?? unpaidShare)}
              />
            </div>

            <div className="rounded-xl border border-gold/40 bg-accent/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">You could be carrying about</p>
              <p className="figures mt-1 text-3xl text-owed transition-all">
                {formatMoney(uncollected)}
              </p>
              <p className="text-sm text-muted-foreground">in uncollected balances every month</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Jaylor costs ₦6,000 a month. Recovering one balance pays for it.
              </p>
            </div>

            <Button asChild className="w-full">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start free
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
