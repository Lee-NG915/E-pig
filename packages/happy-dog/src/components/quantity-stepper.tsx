"use client";

import * as React from "react";
import { MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "#lib/utils";

export type QuantityStepperProps = {
  /** Current quantity (controlled). */
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

function clamp(value: number, min: number, max: number | undefined) {
  return Math.min(Math.max(value, min), max ?? Number.POSITIVE_INFINITY);
}

/** Commerce stepper for cart/PDP quantities. Controlled; clamps to [min, max]. */
function QuantityStepper({ value, onValueChange, min = 1, max, step = 1, disabled = false, className, "aria-label": ariaLabel = "Quantity" }: QuantityStepperProps) {
  const clamped = clamp(value, min, max);
  const canDecrease = !disabled && clamped - step >= min;
  const canIncrease = !disabled && (max === undefined || clamped + step <= max);

  const buttonClass = "grid size-8 place-items-center rounded-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

  return (
    <div data-slot="quantity-stepper" aria-label={ariaLabel} className={cn("inline-flex h-10 items-center gap-1 rounded-md border border-input bg-background px-1 shadow-xs", className)}>
      <button type="button" aria-label="Decrease quantity" disabled={!canDecrease} className={buttonClass} onClick={() => onValueChange(clamp(clamped - step, min, max))}>
        <MinusIcon className="size-4" />
      </button>
      <output aria-live="polite" className="w-8 text-center text-sm font-medium tabular-nums">
        {clamped}
      </output>
      <button type="button" aria-label="Increase quantity" disabled={!canIncrease} className={buttonClass} onClick={() => onValueChange(clamp(clamped + step, min, max))}>
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}

export { QuantityStepper };
