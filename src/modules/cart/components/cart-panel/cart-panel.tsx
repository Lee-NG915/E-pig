"use client";
import Link from "next/link";
import { Button } from "@e-pig/happy-dog/components/button";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import {
  setCartOpen,
  useCartActions,
  useCartStore,
  type CartMarketIdentity,
} from "../../lib/cart-store";

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
              <li key={line.id} className="flex gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{line.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {line.variantLabel}
                  </p>
                  {line.problem && (
                    <p role="alert" className="mt-2 text-sm">
                      {line.problem} Remove this option to continue.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
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
                      className="text-sm underline underline-offset-4 disabled:opacity-50"
                      disabled={disabled}
                      onClick={() =>
                        void actions.updateItem(line.id, 0).catch(() => {})
                      }
                    >
                      Remove<span className="sr-only"> {line.name}</span>
                    </button>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-medium">
                  {formatMarketPrice(line.lineTotal, market.id)}
                </p>
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
