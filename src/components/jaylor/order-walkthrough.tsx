import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Link2, Package, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STEPS = ["Create an order", "Record a deposit", "Share tracking"];

/** Illustrative, local-only example: never writes orders, payments, or tracking links. */
export function OrderWalkthrough() {
  const [step, setStep] = useState(0);
  return (
    <section id="how-it-works" className="scroll-mt-8 border-b border-border bg-secondary/40 py-12 lg:py-16">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:px-10">
        <div>
          <p className="text-sm uppercase text-gold">From order to collection</p>
          <h2 className="mt-4 text-4xl leading-tight sm:text-5xl">One order. A clear record.</h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">Keep the garment details, payment record and client updates together.</p>
          <p className="mt-4 text-sm text-muted-foreground">Illustrative sample, not a real customer order. Nothing is saved or sent.</p>
        </div>
        <div className="min-w-0">
          <Tabs value={String(step)} onValueChange={(value) => setStep(Number(value))}>
            <TabsList aria-label="Sample order stages" className="grid h-auto w-full grid-cols-3 rounded-none bg-background p-1">
              {STEPS.map((label, index) => <TabsTrigger key={label} value={String(index)} className="min-h-14 whitespace-normal rounded-none px-2 text-sm">{index + 1}. {label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div role="region" aria-label={STEPS[step]} aria-live="polite" className="mt-5 flex min-h-72 flex-col border border-border bg-background p-5 sm:p-7">
            <div className="flex items-center gap-3 text-gold">
              {step === 0 ? <Package /> : step === 1 ? <Wallet /> : <Link2 />}
              <h3 className="text-2xl text-foreground">{STEPS[step]}</h3>
            </div>
            {step === 0 ? <>
              <dl className="mt-6 grid grid-cols-2 gap-y-3 text-sm"><dt className="text-muted-foreground">Client</dt><dd>Sample client</dd><dt className="text-muted-foreground">Garment</dt><dd>Senator set</dd><dt className="text-muted-foreground">Order total</dt><dd>₦30,000</dd><dt className="text-muted-foreground">Measurements</dt><dd>Attached to the order</dd></dl>
              <p className="mt-auto pt-5 text-sm text-muted-foreground">Fabric, style and measurements stay with the job.</p>
            </> : step === 1 ? <>
              <dl className="mt-6 grid grid-cols-2 gap-y-3 text-sm"><dt className="text-muted-foreground">Order total</dt><dd>₦30,000</dd><dt className="text-muted-foreground">Deposit recorded</dt><dd>₦15,000</dd><dt className="text-muted-foreground">Balance remaining</dt><dd className="font-semibold text-gold">₦15,000</dd></dl>
              <p className="mt-auto pt-5 text-sm text-muted-foreground">The payment is linked to this order, not a loose notebook entry.</p>
            </> : <>
              <p className="mt-5 text-sm text-muted-foreground">Client tracking preview · Sample order</p>
              <p className="mt-3 text-lg">Senator set</p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span className="inline-flex items-center gap-1 text-gold"><Check className="size-4" /> Received</span><ArrowRight className="size-4 text-muted-foreground" /><span>Cutting</span><ArrowRight className="size-4 text-muted-foreground" /><span className="text-muted-foreground">Sewing</span></div>
              <p className="mt-auto pt-5 text-sm text-muted-foreground">Your client opens their own tracking link in a browser. No app download needed.</p>
            </>}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}><ArrowLeft /> Back</Button>
            <span className="text-sm text-muted-foreground">{step + 1} of 3</span>
            <Button variant="outline" onClick={() => setStep(step === 2 ? 0 : step + 1)}>{step === 2 ? "Start again" : "Next"}<ArrowRight /></Button>
          </div>
        </div>
      </div>
    </section>
  );
}