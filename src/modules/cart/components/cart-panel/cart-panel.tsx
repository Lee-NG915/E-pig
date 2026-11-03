"use client";
import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@e-pig/happy-dog/components/button";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import { withMarketPrefix } from "@/platform/config/market-path";
import {
  setCartOpen,
  useCartActions,
  useCartStore,
  type CartMarketIdentity,
} from "../../lib/cart-store";

const couponSchema = z.object({ code: z.string().trim().max(40, "Use 40 characters or fewer") });

export function CartPanel({
  market,
  compact = false,
}: {
  market: CartMarketIdentity;
  compact?: boolean;
}) {
  const cart = useCartStore(market);
  const actions = useCartActions(market);
  const disabled = cart.pending || !!cart.lockedCheckoutId;
  const couponId = useId();
  const [couponFeedback, setCouponFeedback] = useState("");
  const couponForm = useForm<{ code: string }>({ resolver: zodResolver(couponSchema), defaultValues: { code: "" } });
  async function applyCoupon(code: string) {
    setCouponFeedback("");
    try {
      await actions.applyCoupon(code);
      couponForm.reset({ code: "" });
      setCouponFeedback(code ? "Demo coupon applied." : "Demo coupon removed.");
    } catch { /* The cart store exposes the actionable error and safe retry. */ }
  }
  return (
    <div className="space-y-6">
      {cart.legacyCart && (
        <p className="rounded-lg bg-muted p-4 text-sm">
          Your previous demo bag has been kept on this browser. Please re-add
          those items to confirm current prices and options.
        </p>
      )}
      {cart.error && (
        <div role="alert" className="space-y-3 rounded-lg border p-4">
          <p>{cart.error}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void cart.refresh()}>
              Refresh bag
            </Button>
            <Button
              variant="outline"
              disabled={cart.pending}
              onClick={() => void actions.retry().catch(() => {})}
            >
              Retry last update
            </Button>
          </div>
        </div>
      )}
      {cart.loading ? (
        <p role="status">Loading your bag…</p>
      ) : !cart.error && !cart.lines.length ? (
        <div className="py-10 text-center">
          <h2 className="font-display text-2xl">Nothing in your bag yet</h2>
          <p className="mt-3 text-muted-foreground">
            Choose an item and its sandbox option to get started.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {[
              { handle: "sofas", label: "Shop sofas" },
              { handle: "bedroom", label: "Shop bedroom" },
            ].map((collection) => (
              <Link
                key={collection.handle}
                href={withMarketPrefix(
                  market.id,
                  `/collections/${collection.handle}`,
                )}
                onClick={() => setCartOpen(market, false)}
                className="rounded-lg border bg-card px-3 py-5 font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {collection.label}
              </Link>
            ))}
          </div>
          <Link
            href={`/${market.id}`}
            onClick={() => setCartOpen(market, false)}
            className="mt-5 inline-block underline underline-offset-4"
          >
            Keep browsing
          </Link>
        </div>
      ) : null}
      {cart.lockedCheckoutId && (
        <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
          <p>
            Your bag is frozen while payment is pending. Confirm its status
            before changing items.
          </p>
          <Link
            className="underline underline-offset-4"
            onClick={() => setCartOpen(market, false)}
            href={`/${market.id}/checkout/return?checkoutId=${encodeURIComponent(cart.lockedCheckoutId)}`}
          >
            View payment status
          </Link>
        </div>
      )}
      {cart.lines.length > 0 && (
        <>
          <ul className="divide-y">
            {cart.lines.map((line) => (
              <li
                key={line.id}
                className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-5 sm:grid-cols-[80px_minmax(0,1fr)] sm:gap-4"
              >
                <div className="flex aspect-square h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-secondary sm:h-20 sm:w-20">
                  {line.image ? (
                    <Image
                      src={line.image}
                      alt={`${line.name} — ${line.variantLabel}`}
                      width={80}
                      height={80}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="px-1 text-center text-xs text-foreground/80">
                      Image unavailable
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`${withMarketPrefix(market.id, `/products/${encodeURIComponent(line.productId)}`)}?variant=${encodeURIComponent(line.variantId)}`}
                    onClick={() => setCartOpen(market, false)}
                    className="break-words font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {line.name}
                  </Link>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {line.variantLabel}
                  </p>
                  <p className="mt-2 text-sm font-medium tabular-nums">
                    {formatMarketPrice(line.lineTotal, market.id)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      for {line.quantity}
                    </span>
                  </p>
                  {line.problem && (
                    <p role="alert" className="mt-2 text-sm">
                      {line.problem} Remove this option to continue.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={disabled}
                      aria-label={`Decrease ${line.name} quantity`}
                      onClick={() =>
                        void actions
                          .updateItem(line.id, line.quantity - 1)
                          .catch(() => {})
                      }
                    >
                      −
                    </Button>
                    <span
                      className="tabular-nums"
                      aria-label={`Quantity ${line.quantity}`}
                    >
                      {line.quantity}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={disabled || !!line.problem}
                      aria-label={`Increase ${line.name} quantity`}
                      onClick={() =>
                        void actions
                          .updateItem(line.id, line.quantity + 1)
                          .catch(() => {})
                      }
                    >
                      +
                    </Button>
                    <button
                      aria-label={`Remove ${line.name}`}
                      className="px-1 py-2 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      disabled={disabled}
                      onClick={() =>
                        void actions.updateItem(line.id, 0).catch(() => {})
                      }
                    >
                      Remove<span className="sr-only"> {line.name}</span>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="space-y-4 border-t pt-5">
            <div className="flex justify-between gap-3 text-lg font-medium">
              <span>Subtotal</span>
              <span>
                {cart.cart && formatMarketPrice(cart.cart.subtotal, market.id)}
              </span>
            </div>
            {cart.cart?.discount && cart.cart.couponCode ? <>
              <div className="flex justify-between gap-3 text-sm">
                <span>Discount ({cart.cart.couponCode})</span>
                <span>−{formatMarketPrice(cart.cart.discount, market.id)}</span>
              </div>
              <div className="flex justify-between gap-3 text-lg font-medium">
                <span>Total</span>
                <span>{formatMarketPrice(cart.cart.total ?? cart.cart.subtotal, market.id)}</span>
              </div>
            </> : null}
            {market.id === "au" ? <form onSubmit={couponForm.handleSubmit(({ code }) => applyCoupon(code))} noValidate>
              <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">Sandbox discount</legend>
                <p className="text-sm text-foreground/80">AU demo: DEMO10 saves 10%. One code at a time.</p>
                <label className="block text-sm font-medium" htmlFor={couponId}>Demo coupon</label>
                <div className="flex flex-wrap gap-2">
                  <input id={couponId} autoComplete="off" className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-invalid={!!couponForm.formState.errors.code} aria-describedby={couponForm.formState.errors.code ? `${couponId}-error` : undefined} {...couponForm.register("code")} />
                  <Button type="submit" variant="outline">Apply demo code</Button>
                </div>
                {couponForm.formState.errors.code ? <p id={`${couponId}-error`} role="alert" className="text-sm">{couponForm.formState.errors.code.message}</p> : null}
                {cart.cart?.couponCode ? <Button type="button" variant="outline" onClick={() => void applyCoupon("")}>Remove demo code</Button> : null}
              </fieldset>
              {couponFeedback ? <p role="status" className="mt-2 text-sm">{couponFeedback}</p> : null}
            </form> : null}
            <p className="text-sm text-muted-foreground">
              Sandbox only. No real charge or delivery. Shipping and tax:{" "}
              {formatMarketPrice(
                { amount: 0, currency: market.currency },
                market.id,
              )}
              .
            </p>
            {cart.checkoutEnabled && market.id === "au" ? (
              !cart.lockedCheckoutId &&
              !cart.lines.some((line) => line.problem) && (
                <Link
                  href={`/${market.id}/checkout`}
                  onClick={() => setCartOpen(market, false)}
                  aria-disabled={cart.pending}
                  className={`block rounded-lg bg-primary px-5 py-3 text-center font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring ${cart.pending ? "pointer-events-none opacity-50" : ""}`}
                >
                  Continue to sandbox checkout
                </Link>
              )
            ) : (
              <p className="rounded-lg bg-muted p-4 text-sm">
                Sandbox checkout is available for AU when the payment service is
                configured. You can keep browsing and editing this bag.
              </p>
            )}
            {compact && (
              <Link
                className="block text-center text-sm underline underline-offset-4"
                href={`/${market.id}/cart`}
                onClick={() => setCartOpen(market, false)}
              >
                View full bag
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
