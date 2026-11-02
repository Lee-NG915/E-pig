"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@e-pig/happy-dog/components/button";
import {
  checkoutInputSchema,
  type Checkout,
} from "@/core/contracts/commerce/checkout";
import { formatMarketPrice } from "@/platform/config/format-market-price";
import {
  StorefrontHttpError,
  refreshCart,
  storefrontRequest,
  useCartStore,
  type CartMarketIdentity,
} from "@/modules/cart/lib/cart-store";

const formSchema = checkoutInputSchema.pick({ contact: true, address: true });
type FormValues = z.infer<typeof formSchema>;
export function trustedPaymentUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "checkout.stripe.com" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function CheckoutForm({ market }: { market: CartMarketIdentity }) {
  const cart = useCartStore(market);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<Record<
    string,
    unknown
  > | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contact: { name: "", email: "", phone: "" },
      address: {
        line1: "",
        line2: "",
        city: "",
        state: "NSW",
        postalCode: "",
        country: "AU",
      },
    },
  });
  const submit = form.handleSubmit(async (values) => {
    if (!cart.cart || busy) return;
    setBusy(true);
    setError(null);
    // Keep the original input/key together after an ambiguous network result.
    const request = pendingRequest ?? {
      ...values,
      revision: cart.revision,
      expectedTotal: cart.cart.subtotal,
      idempotencyKey: crypto.randomUUID(),
    };
    setPendingRequest(request);
    try {
      const { checkout } = await storefrontRequest<{ checkout: Checkout }>(
        `/api/${market.id}/checkout`,
        request,
      );
      await refreshCart(market).catch(() => {});
      const paymentUrl = trustedPaymentUrl(checkout.paymentUrl);
      if (checkout.status === "open" && paymentUrl) {
        window.location.assign(paymentUrl);
        return;
      }
      window.location.assign(
        `/${market.id}/checkout/return?checkoutId=${encodeURIComponent(checkout.id)}`,
      );
    } catch (cause) {
      if (cause instanceof StorefrontHttpError && cause.status < 500)
        setPendingRequest(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Checkout could not be started. Please retry.",
      );
      await refreshCart(market).catch(() => {});
    } finally {
      setBusy(false);
    }
  });
  if (market.id !== "au")
    return (
      <p className="rounded-lg bg-muted p-6">
        Sandbox checkout is available for AU only.{" "}
        <Link className="underline" href={`/${market.id}/cart`}>
          Return to your bag
        </Link>
      </p>
    );
  if (cart.loading) return <p role="status">Loading your checkout…</p>;
  if (cart.error)
    return (
      <div role="alert">
        <p>{cart.error}</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => void cart.refresh()}
        >
          Retry loading bag
        </Button>
      </div>
    );
  if (cart.lockedCheckoutId)
    return (
      <div className="space-y-4 rounded-lg border p-6">
        <p>
          Your saved checkout is waiting. Your bag stays frozen until payment is
          confirmed or safely cancelled.
        </p>
        <Link
          className="underline"
          href={`/${market.id}/checkout/return?checkoutId=${encodeURIComponent(cart.lockedCheckoutId)}`}
        >
          Review saved checkout and payment status
        </Link>
      </div>
    );
  if (!cart.cart?.lines.length)
    return (
      <p>
        Your bag is empty.{" "}
        <Link className="underline" href={`/${market.id}`}>
          Choose an item
        </Link>{" "}
        before checking out.
      </p>
    );
  if (cart.lines.some((line) => line.problem))
    return (
      <p>
        Some options in your bag are no longer available.{" "}
        <Link className="underline" href={`/${market.id}/cart`}>
          Review and remove them
        </Link>{" "}
        before checking out.
      </p>
    );
  if (!cart.checkoutEnabled)
    return (
      <p className="rounded-lg bg-muted p-6">
        Sandbox payments are currently unavailable. Your bag is saved; please
        try again later.
      </p>
    );
  const fields = [
    { name: "contact.name", label: "Full name", autoComplete: "name" },
    {
      name: "contact.email",
      label: "Email",
      autoComplete: "email",
      type: "email",
    },
    {
      name: "contact.phone",
      label: "Phone (optional)",
      autoComplete: "tel",
      type: "tel",
    },
    {
      name: "address.line1",
      label: "Address line 1",
      autoComplete: "address-line1",
    },
    {
      name: "address.line2",
      label: "Address line 2 (optional)",
      autoComplete: "address-line2",
    },
    {
      name: "address.city",
      label: "City / suburb",
      autoComplete: "address-level2",
    },
    {
      name: "address.postalCode",
      label: "Postcode",
      autoComplete: "postal-code",
    },
  ] as const;
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
      <form onSubmit={submit} noValidate className="min-w-0 space-y-6">
        <div>
          <h2 className="font-display text-2xl">Your details</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use test information. This is a sandbox purchase with no real charge
            or delivery.
          </p>
        </div>
        <fieldset
          disabled={busy || !!pendingRequest}
          className="grid min-w-0 gap-5 sm:grid-cols-2"
        >
          <legend className="sr-only">Contact and Australian address</legend>
          {fields.map((field) => {
            const issue = form.getFieldState(field.name, form.formState).error;
            return (
              <div
                className={
                  field.name.startsWith("address.line") ? "sm:col-span-2" : ""
                }
                key={field.name}
              >
                <label
                  htmlFor={field.name}
                  className="mb-2 block text-sm font-medium"
                >
                  {field.label}
                </label>
                <input
                  id={field.name}
                  type={"type" in field ? field.type : "text"}
                  autoComplete={field.autoComplete}
                  inputMode={
                    field.name === "address.postalCode" ? "numeric" : undefined
                  }
                  aria-invalid={!!issue}
                  aria-describedby={issue ? `${field.name}-error` : undefined}
                  className="h-12 w-full min-w-0 rounded-md border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register(field.name)}
                />
                {issue && (
                  <p
                    id={`${field.name}-error`}
                    className="mt-2 text-sm"
                    role="alert"
                  >
                    {issue.message}
                  </p>
                )}
              </div>
            );
          })}
          <div>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="checkout-state"
            >
              State / territory
            </label>
            <select
              id="checkout-state"
              className="h-12 w-full rounded-md border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...form.register("address.state")}
            >
              {["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </div>
          <div className="self-center text-sm">Country: Australia</div>
        </fieldset>
        {error && (
          <p role="alert" className="rounded-lg border p-4">
            {error}
            {pendingRequest &&
              " Your request is unconfirmed. Retry the same saved details to avoid creating another payment."}
          </p>
        )}
        <Button
          type="submit"
          className="min-h-12 w-full whitespace-normal"
          disabled={busy || cart.pending}
        >
          {busy
            ? "Starting secure test payment…"
            : "Continue to test card payment"}
        </Button>
        <p className="text-xs leading-6 text-muted-foreground">
          A test card payment takes place on Stripe. Your card details are never
          entered here.
        </p>
      </form>
      <aside
        className="min-w-0 space-y-5 rounded-xl border bg-card p-6"
        aria-label="Checkout summary"
      >
        <h2 className="font-display text-2xl">Order summary</h2>
        <ul className="divide-y">
          {cart.cart.lines.map((line) => (
            <li
              key={line.id}
              className="flex justify-between gap-4 py-4 text-sm"
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
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt>Shipping (sandbox)</dt>
            <dd>$0</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax (sandbox)</dt>
            <dd>$0</dd>
          </div>
          <div className="flex justify-between border-t pt-4 text-lg font-medium">
            <dt>Total</dt>
            <dd>{formatMarketPrice(cart.cart.subtotal, market.id)}</dd>
          </div>
        </dl>
        <p className="text-xs leading-6 text-muted-foreground">
          All amounts in AUD. Prices and availability are checked again before
          payment.
        </p>
      </aside>
    </div>
  );
}
