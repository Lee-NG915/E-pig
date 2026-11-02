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
