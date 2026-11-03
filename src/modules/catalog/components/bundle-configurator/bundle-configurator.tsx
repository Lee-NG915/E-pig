"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@e-pig/happy-dog/components/button";
import type { ProductDetail, ProductVariant } from "@/core/contracts/commerce/catalog";
import type { AddCartLineInput } from "@/core/contracts/commerce/cart";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import { withMarketPrefix } from "@/platform/config/market-path";
import { useCartMarket } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { CartMutationNotSentError, StorefrontHttpError, useCartActions } from "@/modules/cart/lib/cart-store";

type SetRequest = { items: AddCartLineInput[]; main: ProductVariant; companion: ProductVariant };
export function BundleConfigurator({ product, selectedVariantId, companion, onSelectionLockChange }: {
  product: ProductDetail; selectedVariantId?: string; companion: ProductDetail; onSelectionLockChange?: (locked: boolean) => void;
}) {
  const market = useCartMarket();
  const id = useId();
  const { addItems, pending } = useCartActions(market);
  const [companionId, setCompanionId] = useState(companion.variants[0]?.id);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [retryRequest, setRetryRequest] = useState<SetRequest | null>(null);
  const [error, setError] = useState("");
  const [successfulRequest, setSuccessfulRequest] = useState<SetRequest | null>(null);
  const main = retryRequest?.main ?? product.variants.find(variant => variant.id === selectedVariantId);
  const extra = retryRequest?.companion ?? companion.variants.find(variant => variant.id === companionId);
  const available = [main, extra].every(variant => variant?.availability === "in-stock" && variant.maxQuantity >= 1 && variant.price.currency === market.currency);
  const total = main && extra && main.price.currency === extra.price.currency
    ? { amount: (Math.round(main.price.amount * 100) + Math.round(extra.price.amount * 100)) / 100, currency: main.price.currency } : null;
  const busy = pending || submitting;
  const success = successfulRequest !== null && successfulRequest.main.id === main?.id && successfulRequest.companion.id === extra?.id
    && successfulRequest.items[0].productId === product.id && successfulRequest.items[1].productId === companion.id;
  async function addSet() {
    if (inFlight.current || pending || !main || !extra || (!available && !retryRequest)) return;
    const request = retryRequest ?? { items: [{ productId: product.id, variantId: main.id, quantity: 1 }, { productId: companion.id, variantId: extra.id, quantity: 1 }], main, companion: extra };
    inFlight.current = true; setSubmitting(true); setError(""); setSuccessfulRequest(null); onSelectionLockChange?.(true);
    try {
      await addItems(request.items);
      setRetryRequest(null); setSuccessfulRequest(request); onSelectionLockChange?.(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not confirm the set. Retry to check your bag.");
      if (cause instanceof CartMutationNotSentError || (cause instanceof StorefrontHttpError && cause.status < 500)) { setRetryRequest(null); onSelectionLockChange?.(false); }
      else setRetryRequest(request);
    } finally { inFlight.current = false; setSubmitting(false); }
  }
  return <section aria-labelledby={`${id}-title`} className="border-t py-10">
    <h2 id={`${id}-title`} className="font-display text-2xl">Build a two-piece set</h2>
    <p className="mt-3 max-w-prose text-sm leading-6 text-foreground/80">Use the sofa option selected above, then choose its companion. One of each item, with no extra bundle discount. Sandbox prices are confirmed again in your bag.</p>
    <div className="mt-6 grid gap-6 sm:grid-cols-2">{[{ product, variant: main }, { product: companion, variant: extra }].map(item => <div key={item.product.id} className="flex min-w-0 gap-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-secondary"><Image src={item.variant?.image ?? item.product.image} alt={`${item.product.name}${item.variant ? ` — ${item.variant.label}` : ""}`} fill sizes="80px" className="object-contain" /></div>
      <div className="min-w-0"><h3 className="font-medium">{item.product.name}</h3><p className="mt-1 text-sm text-foreground/80">{item.variant?.label ?? "Choose a sofa option above"}</p>{item.variant ? <p className="mt-1 text-sm">{formatMarketPrice(item.variant.price, market.id)} · 1 item</p> : null}</div>
    </div>)}</div>
    <div className="mt-6 flex flex-wrap items-end gap-4">
      <label htmlFor={`${id}-companion`} className="min-w-0 max-w-full space-y-2 text-sm"><span className="block">Companion option</span>
        <select id={`${id}-companion`} className="min-h-11 max-w-full rounded-md border bg-background px-3" value={companionId ?? ""} disabled={busy || !!retryRequest} onChange={event => { setCompanionId(event.target.value); setError(""); setSuccessfulRequest(null); }}>
          {companion.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.label}{variant.availability === "out-of-stock" ? " — unavailable" : ""}</option>)}
        </select>
      </label>
      <Link className="py-3 text-sm underline underline-offset-4" href={`${withMarketPrefix(market.id, `/products/${companion.slug}`)}${extra ? `?variant=${encodeURIComponent(extra.id)}` : ""}`}>View companion details</Link>
    </div>
    {total ? <p className="mt-5 font-medium">Set total: {formatMarketPrice(total, market.id)}</p> : null}
    {!available && !retryRequest ? <p className="mt-3 text-sm text-foreground/80">Choose available options for both items before adding this set.</p> : null}
    <Button className="mt-4" disabled={busy || (!available && !retryRequest)} onClick={() => void addSet()}>{busy ? "Adding set…" : retryRequest ? "Retry set addition" : "Add both items to bag"}</Button>
    {error ? <div role="alert" className="mt-3 space-y-2 text-sm text-destructive"><p>{error}</p>{retryRequest ? <p>Your set could have been added. Retry to confirm before changing it.</p> : null}</div> : null}
    {success ? <p role="status" className="mt-3 text-sm">Both selected items were added to your bag.</p> : null}
  </section>;
}
