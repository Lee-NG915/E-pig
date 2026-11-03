"use client";

import { Check, Columns2 } from "lucide-react";
import { Button } from "@e-pig/happy-dog/components/button";
import type { CompareItem } from "../../lib/compare-query";
import { addCompareItem, useCompareSelection } from "../../lib/compare-store";
import { announceComparison } from "../comparison-dock/comparison-feedback";

export function AddToComparison({ marketId, item, productName, className }: {
  marketId: string;
  item: CompareItem;
  productName: string;
  className?: string;
}) {
  const { items, hydrated } = useCompareSelection(marketId);
  const existing = items.find(selected => selected.productId === item.productId);
  const selected = !!existing && existing.variantId === item.variantId;
  const action = selected ? `${productName} is in comparison` : existing ? `Update ${productName} in comparison` : `Add ${productName} to comparison`;

  function add() {
    const result = addCompareItem(marketId, item);
    const message = {
      added: `${productName} added to comparison.`,
      updated: `${productName}'s option updated in comparison.`,
      exists: `${productName} is already in your comparison.`,
      full: "Your comparison is full. Remove a product from your list to add another (maximum 3).",
    }[result];
    announceComparison(marketId, message);
  }

  return <Button type="button" variant="ghost" className={className} disabled={!hydrated}
    data-compare-product={item.productId} data-compare-market={marketId}
    aria-label={action} aria-pressed={selected} onClick={add}>
    {selected ? <Check aria-hidden="true" /> : <Columns2 aria-hidden="true" />}
    {selected ? "Added to compare" : existing ? "Update comparison" : "Compare"}
  </Button>;
}
