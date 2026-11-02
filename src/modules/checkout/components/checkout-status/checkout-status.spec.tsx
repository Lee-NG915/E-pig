// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import {
  cartFixture,
  marketFixture,
} from "@/modules/cart/components/cart-panel/cart-panel.mock";
import { CheckoutStatus } from "./checkout-status";
const checkout = {
  id: "checkout-1",
  cartId: cartFixture.id,
  market: "au",
  revision: 2,
  lines: cartFixture.lines,
  total: cartFixture.subtotal,
  status: "open",
  paymentUrl: "https://checkout.stripe.com/c/pay/test_session",
  contact: { name: "Test Buyer", email: "buyer@example.com" },
  address: {
    line1: "1 Test Street",
    city: "Sydney",
    state: "NSW",
    postalCode: "2000",
    country: "AU",
  },
  createdAt: "2026-11-02T00:00:00Z",
};
beforeEach(() => getStorefrontQueryClient().clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("treats a return as pending and leaves the bag frozen when cancellation fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(
            JSON.stringify({
              error: { message: "Could not verify cancellation" },
            }),
            { status: 503 },
          )
        : new Response(JSON.stringify({ checkout })),
    ),
  );
  render(<CheckoutStatus market={marketFixture} checkoutId="checkout-1" />);
  expect(await screen.findByText("Payment is not confirmed yet")).toBeTruthy();
  expect(screen.queryByText("Payment confirmed")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Continue test payment" }),
  ).toBeTruthy();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Cancel and verify payment" }));
  expect(await screen.findByText("Could not verify cancellation")).toBeTruthy();
  expect(screen.getByText(/bag stays frozen/)).toBeTruthy();
});
it.each([
  ["paid", "Payment confirmed"],
  ["expired", "Checkout expired"],
  ["creating", "Preparing your test payment"],
])("renders trusted %s status", async (status, heading) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            checkout: {
              ...checkout,
              status,
              orderId: status === "paid" ? "order-1" : undefined,
            },
          }),
        ),
      ),
  );
  render(<CheckoutStatus market={marketFixture} checkoutId="checkout-1" />);
  expect(await screen.findByText(heading)).toBeTruthy();
  if (status === "paid")
    expect(
      screen.getByRole("link", { name: "View order" }).getAttribute("href"),
    ).toBe("/au/orders/order-1");
});
it("does not forward an unexpected payment host", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            checkout: {
              ...checkout,
              paymentUrl: "https://attacker.example/pay",
            },
          }),
        ),
      ),
  );
  render(<CheckoutStatus market={marketFixture} checkoutId="checkout-1" />);
  await screen.findByText("Payment is not confirmed yet");
  expect(
    screen.queryByRole("link", { name: "Continue test payment" }),
  ).toBeNull();
});
