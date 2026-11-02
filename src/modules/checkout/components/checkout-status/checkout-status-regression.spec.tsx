// @vitest-environment jsdom
import { act } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  getStorefrontQueryClient,
  refreshCart,
  getCartSnapshot,
} from "@/modules/cart/lib/cart-store";
import {
  cartFixture,
  marketFixture,
} from "@/modules/cart/components/cart-panel/cart-panel.mock";
import { CheckoutStatus } from "./checkout-status";
const checkout = {
  id: "review-checkout",
  cartId: cartFixture.id,
  market: "au",
  revision: 2,
  lines: cartFixture.lines,
  total: cartFixture.subtotal,
  status: "open",
  paymentUrl: "https://checkout.stripe.com/c/pay/test_session",
  contact: { name: "Test Buyer", email: "private@example.com" },
  address: {
    line1: "1 Test Street",
    city: "Sydney",
    state: "NSW",
    postalCode: "2000",
    country: "AU",
  },
  createdAt: "2026-11-02T00:00:00Z",
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
beforeEach(() => getStorefrontQueryClient().clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([401, 403, 404])(
  "clears previously visible private checkout after HTTP %s rejection",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(async () => response({ checkout }))
        .mockImplementation(async () =>
          response(
            { error: { message: "Invalid browser credential" } },
            status,
          ),
        ),
    );
    render(<CheckoutStatus market={marketFixture} checkoutId={checkout.id} />);
    await screen.findByText("Payment is not confirmed yet");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Refresh payment status" }));
    await screen.findByText("Invalid browser credential");
    expect(
      screen.queryByRole("region", { name: "Saved checkout details" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Continue test payment" }),
    ).toBeNull();
  },
);
it("old open GET does not undo verified cancellation", async () => {
  let resolveOld!: (value: Response) => void;
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/cart"))
        return response({ cart: cartFixture, checkoutEnabled: true });
      if (init?.method === "POST")
        return response({
          checkout: { ...checkout, status: "expired", paymentUrl: undefined },
        });
      if (++reads === 1) return response({ checkout });
      if (reads === 2)
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      return response({
        checkout: { ...checkout, status: "expired", paymentUrl: undefined },
      });
    }),
  );
  render(<CheckoutStatus market={marketFixture} checkoutId={checkout.id} />);
  await screen.findByText("Payment is not confirmed yet");
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Refresh payment status" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Cancel and verify payment" }),
  );
  await screen.findByText("Checkout expired");
  await act(async () => {
    resolveOld(response({ checkout }));
  });
  await waitFor(() => expect(getStorefrontQueryClient().isFetching()).toBe(0));
  expect(screen.queryByText("Checkout expired")).not.toBeNull();
});
it("old unlocked cart GET cannot erase a newer checkout lock, while a later revision can unlock", async () => {
  let resolveOld!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(async () =>
        response({
          cart: { ...cartFixture, lockedCheckoutId: checkout.id },
          checkoutEnabled: true,
        }),
      )
      .mockImplementationOnce(async () =>
        response({
          cart: { ...cartFixture, revision: 3 },
          checkoutEnabled: true,
        }),
      ),
  );
  const stale = refreshCart(marketFixture);
  await refreshCart(marketFixture);
  expect(getCartSnapshot(marketFixture).lockedCheckoutId).toBe(checkout.id);
  resolveOld(response({ cart: cartFixture, checkoutEnabled: true }));
  await stale;
  expect(getCartSnapshot(marketFixture).lockedCheckoutId).toBe(checkout.id);
  await refreshCart(marketFixture);
  expect(getCartSnapshot(marketFixture).lockedCheckoutId).toBeUndefined();
  expect(getCartSnapshot(marketFixture).revision).toBe(3);
});

it("hides private checkout after cancellation authorization rejection until a successful refresh", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? response({ error: { message: "Checkout access denied" } }, 403)
        : response({ checkout }),
    ),
  );
  render(<CheckoutStatus market={marketFixture} checkoutId={checkout.id} />);
  await screen.findByText("Payment is not confirmed yet");
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Cancel and verify payment" }),
  );
  await screen.findByText("Checkout access denied");
  expect(
    screen.queryByRole("region", { name: "Saved checkout details" }),
  ).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Continue test payment" }),
  ).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Refresh payment status" }),
  );
  expect(
    await screen.findByRole("region", { name: "Saved checkout details" }),
  ).toBeTruthy();
});

it.each([401, 403, 404])(
  "purges private checkout on cancel HTTP %s across remount and ignores an older GET",
  async (status) => {
    let reads = 0;
    let resolveOld!: (value: Response) => void;
    let resolveFresh!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return response({ error: { message: "Access denied" } }, status);
      if (++reads === 1) return response({ checkout });
      if (reads === 2) return new Promise<Response>((resolve) => { resolveOld = resolve; });
      return new Promise<Response>((resolve) => { resolveFresh = resolve; });
    }));
    const first = render(<CheckoutStatus market={marketFixture} checkoutId={checkout.id} />);
    await screen.findByText("Payment is not confirmed yet");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Refresh payment status" }));
    await user.click(screen.getByRole("button", { name: "Cancel and verify payment" }));
    await screen.findByText("Access denied");
    await act(async () => { resolveOld(response({ checkout })); });
    first.unmount();
    render(<CheckoutStatus market={marketFixture} checkoutId={checkout.id} />);
    expect(screen.queryByRole("region", { name: "Saved checkout details" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Continue test payment" })).toBeNull();
    expect(getStorefrontQueryClient().getQueryData(["checkout", marketFixture.id, checkout.id])).toBeUndefined();
    await waitFor(() => expect(resolveFresh).toBeTypeOf("function"));
    await act(async () => { resolveFresh(response({ checkout })); });
    expect(await screen.findByRole("region", { name: "Saved checkout details" })).toBeTruthy();
  },
);

it.each([401, 403, 404])(
  "purges private checkout on GET HTTP %s across remount until renewed authorization",
  async (status) => {
    let reads = 0;
    let resolveFresh!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (++reads === 1) return response({ checkout });
      if (reads === 2) return response({ error: { message: "Access denied" } }, status);
      return new Promise<Response>((resolve) => { resolveFresh = resolve; });
    }));
    const first = render(<CheckoutStatus market={marketFixture} checkoutId={checkout.id} />);
    await screen.findByText("Payment is not confirmed yet");
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh payment status" }));
    await screen.findByText("Access denied");
    first.unmount();
    render(<CheckoutStatus market={marketFixture} checkoutId={checkout.id} />);
    expect(screen.queryByRole("region", { name: "Saved checkout details" })).toBeNull();
    expect(getStorefrontQueryClient().getQueryData(["checkout", marketFixture.id, checkout.id])).toBeUndefined();
    await waitFor(() => expect(resolveFresh).toBeTypeOf("function"));
    await act(async () => { resolveFresh(response({ checkout })); });
    expect(await screen.findByRole("region", { name: "Saved checkout details" })).toBeTruthy();
  },
);

it.each(["paid", "expired"])("refreshes shared cart after trusted %s reconciliation", async (status) => {
  let reconciled = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/cart")) return response({
      cart: reconciled
        ? { ...cartFixture, revision: 3, lines: status === "paid" ? [] : cartFixture.lines }
        : { ...cartFixture, lockedCheckoutId: checkout.id },
      checkoutEnabled: true,
    });
    reconciled = true;
    return response({ checkout: { ...checkout, status, paymentUrl: undefined, orderId: status === "paid" ? "paid-order" : undefined } });
  }));
  await refreshCart(marketFixture);
  expect(getCartSnapshot(marketFixture).lockedCheckoutId).toBe(checkout.id);
  render(<CheckoutStatus market={marketFixture} checkoutId={checkout.id} />);
  await screen.findByText(status === "paid" ? "Payment confirmed" : "Checkout expired");
  await waitFor(() => expect(getCartSnapshot(marketFixture).lockedCheckoutId).toBeUndefined());
  expect(getCartSnapshot(marketFixture).revision).toBe(3);
  expect(getCartSnapshot(marketFixture).lines).toHaveLength(status === "paid" ? 0 : cartFixture.lines.length);
});

it("retries a failed terminal cart refresh on the next trusted status read", async () => {
  let cartReads = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (!url.endsWith("/cart")) return response({ checkout: { ...checkout, status: "expired" } });
    if (++cartReads === 2) return response({ error: { message: "Cart temporarily unavailable" } }, 503);
    return response({ cart: cartReads === 1 ? { ...cartFixture, lockedCheckoutId: checkout.id } : { ...cartFixture, revision: 3 }, checkoutEnabled: true });
  }));
  await refreshCart(marketFixture);
  render(<CheckoutStatus market={marketFixture} checkoutId={checkout.id} />);
  await screen.findByText("Checkout expired");
  await waitFor(() => expect(cartReads).toBe(2));
  expect(getCartSnapshot(marketFixture).lockedCheckoutId).toBe(checkout.id);
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh payment status" }));
  await waitFor(() => expect(getCartSnapshot(marketFixture).lockedCheckoutId).toBeUndefined());
});
