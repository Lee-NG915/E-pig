"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@e-pig/happy-dog/components/button";
import type { Checkout } from "@/core/contracts/commerce/checkout";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import {
  StorefrontHttpError,
  getStorefrontQueryClient,
  refreshCart,
  storefrontRequest,
  type CartMarketIdentity,
} from "@/modules/cart/lib/cart-store";
import { trustedPaymentUrl } from "../checkout-form/checkout-form";

type CheckoutResponse = { checkout: Checkout };
function isAccessRejection(error: unknown): error is StorefrontHttpError {
  return error instanceof StorefrontHttpError && [401, 403, 404].includes(error.status);
}
function newestCheckout(
  previous: unknown,
  incoming: CheckoutResponse,
): CheckoutResponse {
  const old = previous as CheckoutResponse | undefined;
  const rank = { creating: 0, open: 1, expired: 2, paid: 3 };
  if (
    old?.checkout.id === incoming.checkout.id &&
    rank[old.checkout.status] > rank[incoming.checkout.status]
  )
    return old;
  return incoming;
}

export function CheckoutStatus({
  market,
  checkoutId,
}: {
  market: CartMarketIdentity;
  checkoutId?: string;
}) {
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const client = getStorefrontQueryClient();
  const key = ["checkout", market.id, checkoutId];
  const discardPrivateData = () => {
    // Clear shared data, not just this mount's view. Only a new authorized read
    // may restore details after the browser credential has been rejected.
    client.getQueryCache().find({ queryKey: key, exact: true })?.setState({ data: undefined });
  };
  const query = useQuery<{ checkout: Checkout }>(
    {
      queryKey: key,
      enabled: typeof window !== "undefined" && !!checkoutId && !cancelling,
      structuralSharing: (old, incoming) =>
        newestCheckout(old, incoming as CheckoutResponse),
      queryFn: async ({ signal }) => {
        try {
          const result = await storefrontRequest<CheckoutResponse>(
            `/api/${market.id}/checkout/${encodeURIComponent(checkoutId!)}`,
            undefined,
            signal,
          );
          if (!signal.aborted && ["paid", "expired"].includes(result.checkout.status))
            // Reconciliation may just have cleared/unlocked the server cart.
            // Keep revision protection in refreshCart; a later status read retries failures.
            void refreshCart(market).catch(() => {});
          return result;
        } catch (error) {
          if (!signal.aborted && isAccessRejection(error)) discardPrivateData();
          throw error;
        }
      },
      refetchInterval: (current) => {
        const checkout = current.state.data?.checkout;
        return !current.state.error &&
          checkout &&
          (checkout.status === "creating" || checkout.status === "open") &&
          current.state.dataUpdateCount < 8
          ? 5000
          : false;
      },
    },
    client,
  );
  if (!checkoutId)
    return (
      <p>
        No checkout reference was provided.{" "}
        <Link className="underline" href={`/${market.id}/cart`}>
          Return to your bag
        </Link>
        .
      </p>
    );
  if (query.isPending && !accessDenied) return <p role="status">Checking payment status…</p>;
  const checkout =
    query.error || accessDenied ? undefined : query.data?.checkout;
  const status = checkout?.status;
  const paymentUrl = trustedPaymentUrl(checkout?.paymentUrl);
  const cancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      // Stop and abort an old poll before committing a terminal cancellation result.
      await client.cancelQueries({ queryKey: key, exact: true });
      const result = await storefrontRequest<{ checkout: Checkout }>(
        `/api/${market.id}/checkout/${encodeURIComponent(checkoutId)}`,
        { action: "cancel" },
      );
      client.setQueryData<CheckoutResponse>(key, (old) =>
        newestCheckout(old, result),
      );
      await refreshCart(market).catch(() => {});
    } catch (error) {
      if (isAccessRejection(error)) {
        discardPrivateData();
        setAccessDenied(true);
      }
      setCancelError(
        error instanceof Error
          ? error.message
          : "Cancellation could not be verified. Please retry.",
      );
    } finally {
      setCancelling(false);
    }
  };
  return (
    <div className="max-w-2xl space-y-6">
      {query.error && (
        <div className="rounded-lg border p-5" role="alert">
          <p>{query.error.message}</p>
          <p className="mt-2 text-sm">
            We could not confirm payment. Your bag remains protected; retry
            before changing it.
          </p>
        </div>
      )}
      {checkout && (
        <>
          <div className="rounded-xl border bg-card p-6">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Sandbox checkout
            </p>
            <h2 className="mt-3 font-display text-3xl">
              {status === "paid"
                ? "Payment confirmed"
                : status === "expired"
                  ? "Checkout expired"
                  : status === "creating"
                    ? "Preparing your test payment"
                    : "Payment is not confirmed yet"}
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              {status === "paid"
                ? "Your test payment has been confirmed by the shopping service. No real charge or delivery will take place."
                : status === "expired"
                  ? "The previous payment can no longer complete. You can return to your bag and try again."
                  : "Your bag stays frozen until payment is confirmed or cancellation is safely verified. Returning here does not cancel a payment."}
            </p>
            <p className="mt-5 font-medium">
              {formatMarketPrice(checkout.total, market.id)}
            </p>
            {checkout.discount ? <dl className="mt-3 space-y-2 text-sm">
              {checkout.subtotal ? <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd>{formatMarketPrice(checkout.subtotal, market.id)}</dd></div> : null}
              <div className="flex justify-between gap-3"><dt>Discount{checkout.couponCode ? ` (${checkout.couponCode})` : ""}</dt><dd>−{formatMarketPrice(checkout.discount, market.id)}</dd></div>
            </dl> : null}
            <ul className="mt-3 space-y-2 text-sm">
              {checkout.lines.map((line) => (
                <li key={line.id}>
                  {line.name} · {line.variantLabel} × {line.quantity}
                </li>
              ))}
            </ul>
          </div>
          <section
            className="rounded-xl border p-6"
            aria-label="Saved checkout details"
          >
            <h3 className="font-medium">Saved test details</h3>
            <p className="mt-3 break-words text-sm leading-6">
              {checkout.contact.name}
              <br />
              {checkout.contact.email}
              <br />
              {checkout.address.line1}
              {checkout.address.line2 && (
                <>
                  <br />
                  {checkout.address.line2}
                </>
              )}
              <br />
              {checkout.address.city}, {checkout.address.state}{" "}
              {checkout.address.postalCode}
              <br />
              Australia
            </p>
          </section>
        </>
      )}
      {cancelError && (
        <p role="alert" className="rounded-lg border p-4">
          {cancelError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="outline"
          disabled={query.isFetching || cancelling}
          onClick={() =>
            void query.refetch().then((result) => {
              if (!result.error) {
                setAccessDenied(false);
                setCancelError(null);
              }
            })
          }
        >
          Refresh payment status
        </Button>
        {status === "open" && paymentUrl && !cancelling && (
          <a
            className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
            href={paymentUrl}
          >
            Continue test payment
          </a>
        )}
        {(status === "open" || status === "creating") && (
          <Button
            variant="outline"
            disabled={cancelling}
            onClick={() => void cancel()}
          >
            {cancelling
              ? "Verifying cancellation…"
              : "Cancel and verify payment"}
          </Button>
        )}
        {status === "paid" && checkout?.orderId && (
          <Link
            className="underline underline-offset-4"
            href={`/${market.id}/orders/${encodeURIComponent(checkout.orderId)}`}
          >
            View order
          </Link>
        )}
        {status === "expired" && (
          <Link
            className="underline underline-offset-4"
            href={`/${market.id}/cart`}
          >
            Return to your bag
          </Link>
        )}
      </div>
      <Link
        className="inline-block text-sm underline underline-offset-4"
        href={`/${market.id}/orders`}
      >
        Orders in this browser
      </Link>
    </div>
  );
}
