import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/jaylor";

export function UncollectedCalculator() {
  const [orders, setOrders] = useState(30);
  const [avgValue, setAvgValue] = useState(25000);
  const [unpaidShare, setUnpaidShare] = useState(20);

  const uncollected = Math.round(orders * avgValue * (unpaidShare / 100) * 0.5);

  return (
    <section className="border-y border-border bg-card py-20 lg:py-28">
      <div className="mx-auto grid w-full max-w-7xl gap-14 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
        <div className="lg:pr-10">
          <p className="text-xs uppercase text-gold">The cost of loose records</p>
          <h2 className="mt-5 text-4xl leading-tight sm:text-5xl">How much is your notebook costing you?</h2>
          <p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">
            Match the figures to your workroom. The estimate shows how quickly small outstanding balances become serious money.
          </p>
          <p className="mt-12 border-t border-border pt-5 text-xs uppercase text-muted-foreground">
            Private by design · No card required
          </p>
        </div>

        <div className="border border-border bg-background p-6 sm:p-10">
          <div className="space-y-9">
            <div>
              <div className="flex items-end justify-between gap-4 text-sm">
                <span className="text-xs uppercase text-muted-foreground">Orders per month</span>
                <span className="figures font-heading text-2xl text-gold">{orders}</span>
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
              <div className="flex items-end justify-between gap-4 text-sm">
                <span className="text-xs uppercase text-muted-foreground">Average order value</span>
                <span className="figures font-heading text-2xl text-gold">{formatMoney(avgValue)}</span>
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
              <div className="flex items-end justify-between gap-4 text-sm">
                <span className="max-w-xs text-xs uppercase text-muted-foreground">
                  Share of orders with a balance left unpaid
                </span>
                <span className="figures font-heading text-2xl text-gold">{unpaidShare}%</span>
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

            <div className="border-t border-gold/60 pt-8 text-center">
              <p className="text-xs uppercase text-muted-foreground">Estimated uncollected balance</p>
              <p className="figures mt-3 font-heading text-5xl text-gold transition-all sm:text-6xl">
                {formatMoney(uncollected)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">carried through the workroom each month</p>
              <p className="mt-4 text-sm text-muted-foreground">
                Jaylor costs ₦6,000 a month. Recovering one balance pays for it.
              </p>
            </div>

            <Button asChild variant="premium" size="lg" className="mt-7 w-full rounded-none uppercase">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start free
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
