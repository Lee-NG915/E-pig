// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import { OrderHistory } from "./order-history";
beforeEach(() => getStorefrontQueryClient().clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([false, true])("renders legacy and discounted paid snapshots without recomputing totals (coupon=%s)", async discounted => {
  const order = { id: "order-1", status: "paid", lines: [], createdAt: "2026-11-03T00:00:00Z", total: { amount: discounted ? 18 : 20, currency: "AUD" },
    ...(discounted ? { subtotal: { amount: 20, currency: "AUD" }, discount: { amount: 2, currency: "AUD" }, couponCode: "DEMO10" } : {}),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ orders: [order] }))));
  render(<OrderHistory market={{ id: "au", currency: "AUD" }} />);
  expect(await screen.findByText(discounted ? "$18" : "$20")).toBeTruthy();
  if (discounted) {
    expect(screen.getByText("Discount (DEMO10)")).toBeTruthy();
    expect(screen.getByText("−$2")).toBeTruthy();
    expect(screen.getByText("$20")).toBeTruthy();
  } else expect(screen.queryByText(/Discount/)).toBeNull();
  expect(screen.queryByText("After-sales support")).toBeNull();
});
it("shows no private order details after an ownership rejection", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              kind: "not_found",
              message: "Order not found in this browser",
            },
          }),
          { status: 404 },
        ),
      ),
  );
  render(
    <OrderHistory
      market={{ id: "au", currency: "AUD" }}
      orderId="other-order"
    />,
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Order not found in this browser"),
  );
  expect(screen.getByRole("button", { name: "Refresh orders" })).toBeTruthy();
  expect(screen.queryByText("Paid · sandbox")).toBeNull();
  expect(screen.queryByText("After-sales support")).toBeNull();
});

it("mounts the after-sales panel only after this order detail is confirmed", async () => {
  const order = {
    id: "order-detail",
    cartId: "cart-detail",
    checkoutId: "checkout-1",
    market: "au",
    status: "paid",
    createdAt: "2026-11-03T00:00:00Z",
    lines: [],
    total: { amount: 20, currency: "AUD" },
    contact: { name: "Test Buyer", email: "buyer@example.test" },
    address: {
      line1: "1 Test Street",
      city: "Sydney",
      state: "NSW",
      postalCode: "2000",
      country: "AU",
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        "https://e-pig.test",
      );
      if (url.pathname.endsWith("/orders/order-detail")) {
        return Promise.resolve(
          new Response(JSON.stringify({ order })),
        );
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }),
  );
  render(
    <OrderHistory
      market={{ id: "au", currency: "AUD" }}
      orderId="order-detail"
    />,
  );

  expect(await screen.findByText("After-sales support")).toBeTruthy();
  expect(await screen.findByText("Start a request")).toBeTruthy();
  expect(screen.getByLabelText("Description")).toBeTruthy();
  expect(
    screen.getByText(/No saved after-sales request in this browser yet/),
  ).toBeTruthy();
});
it("explains empty same-browser history and cookie lifetime", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ orders: [] }))),
  );
  render(<OrderHistory market={{ id: "au", currency: "AUD" }} />);
  expect(await screen.findByText("No orders in this browser yet")).toBeTruthy();
  expect(screen.getByText(/30 days/)).toBeTruthy();
});
