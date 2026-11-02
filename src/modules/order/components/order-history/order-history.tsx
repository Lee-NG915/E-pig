"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@e-pig/happy-dog/components/button";
import type { Order } from "@/core/contracts/commerce/order";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import {
  getStorefrontQueryClient,
  storefrontRequest,
  type CartMarketIdentity,
} from "@/modules/cart/lib/cart-store";

export function OrderHistory({
  market,
  orderId,
}: {
  market: CartMarketIdentity;
  orderId?: string;
}) {
  const query = useQuery<{ orders?: Order[]; order?: Order }>(
    {
      queryKey: ["orders", market.id, orderId ?? "list"],
      queryFn: () =>
        storefrontRequest(
          `/api/${market.id}/orders${orderId ? `/${encodeURIComponent(orderId)}` : ""}`,
        ),
      enabled: typeof window !== "undefined",
    },
    getStorefrontQueryClient(),
  );
  const orders = orderId
    ? query.data?.order
      ? [query.data.order]
      : []
    : (query.data?.orders ?? []);
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        Orders are available in the browser where you checked out for up to 30
        days. Keep its cookies; clearing them or switching devices removes
        access to this guest history.
      </p>
      <Button
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh orders
      </Button>
      {query.isPending && <p role="status">Loading orders…</p>}
      {query.error && (
        <p className="rounded-lg border p-5" role="alert">
          {query.error.message}
        </p>
      )}
      {!query.error && !query.isPending && orders.length === 0 && (
        <div className="rounded-xl border p-8">
          <h2 className="font-display text-2xl">
            No orders in this browser yet
          </h2>
          <p className="mt-3 text-muted-foreground">
            Complete a sandbox payment, then return here to see its confirmed
            order.
          </p>
          <Link
            className="mt-5 inline-block underline underline-offset-4"
            href={`/${market.id}`}
          >
            Browse the collection
          </Link>
        </div>
      )}
      {!query.error &&
        orders.map((order) => (
          <article
            className="min-w-0 rounded-xl border bg-card p-5 sm:p-8"
            key={order.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Paid · sandbox
                </p>
                <h2 className="mt-2 break-all text-lg font-medium">
                  Order {order.id}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString("en-AU", {
                    timeZone: "UTC",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <p className="text-lg font-medium">
                {formatMarketPrice(order.total, market.id)}
              </p>
            </div>
            <ul className="mt-6 divide-y border-t">
              {order.lines.map((line) => (
                <li
                  className="flex justify-between gap-4 py-4 text-sm"
                  key={line.id}
                >
                  <div className="min-w-0">
                    <p>
                      {line.name} × {line.quantity}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {line.variantLabel}
                    </p>
                  </div>
                  <span className="shrink-0">
                    {formatMarketPrice(line.lineTotal, market.id)}
                  </span>
                </li>
              ))}
            </ul>
            {orderId ? (
              <div className="mt-4 border-t pt-5 text-sm leading-6">
                <h3 className="font-medium">Test contact and address</h3>
                <p className="mt-2 break-words">
                  {order.contact.name}
                  <br />
                  {order.contact.email}
                  <br />
                  {order.address.line1}
                  <br />
                  {order.address.city}, {order.address.state}{" "}
                  {order.address.postalCode}
                  <br />
                  Australia
                </p>
                <p className="mt-4 text-muted-foreground">
                  No real charge, tax assessment or delivery. Shipping and tax
                  are zero in this sandbox.
                </p>
              </div>
            ) : (
              <Link
                className="mt-4 inline-block underline underline-offset-4"
                href={`/${market.id}/orders/${encodeURIComponent(order.id)}`}
              >
                View order details
              </Link>
            )}
          </article>
        ))}
    </div>
  );
}
