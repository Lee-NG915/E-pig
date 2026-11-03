"use client";

import { useId, useState } from "react";
import { Button } from "@e-pig/happy-dog/components/button";
import { Input } from "@e-pig/happy-dog/components/input";
import { estimateDemoDelivery } from "@/modules/checkout/lib/demo-delivery";

export function DeliveryEstimate({ marketId, postalCode }: { marketId: string; postalCode?: string }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [checked, setChecked] = useState<string>();
  const controlled = postalCode !== undefined;
  const estimate = estimateDemoDelivery(marketId, controlled ? postalCode : checked ?? "");
  const message = estimate.status === "estimated" ? `Demo estimate: ${estimate.minDays}–${estimate.maxDays} business days.`
    : estimate.status === "unsupported" ? "Demo delivery estimates are available for AU only."
    : estimate.status === "invalid" ? "Enter a four-digit postcode to check the demo estimate."
    : estimate.status === "unknown" ? "No demo estimate is configured for this postcode. This does not indicate actual delivery coverage."
    : "Try test postcodes 2000, 3000 or 4000.";
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 border-t py-6">
      <h2 id={`${id}-title`} className="font-medium">Demo delivery estimate</h2>
      <p className="text-sm leading-6 text-foreground/80">Sample timing only, not a delivery promise. Sandbox shipping and tax remain $0.</p>
      {!controlled && marketId === "au" ? <div className="space-y-2">
        <label htmlFor={`${id}-postcode`} className="text-sm">Demo delivery postcode</label>
        <div className="flex flex-wrap items-center gap-3">
          <Input id={`${id}-postcode`} value={draft} inputMode="numeric" maxLength={4} autoComplete="off" className="w-32"
            onChange={event => { setDraft(event.target.value); setChecked(undefined); }}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setChecked(draft); } }} aria-describedby={`${id}-result`} />
          <Button type="button" variant="outline" onClick={() => setChecked(draft)}>Check estimate</Button>
        </div>
      </div> : null}
      <p id={`${id}-result`} role="status" className="text-sm leading-6 text-foreground/80">{message}</p>
    </section>
  );
}
