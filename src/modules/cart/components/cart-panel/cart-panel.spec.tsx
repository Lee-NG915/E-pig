// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorefrontQueryClient } from "../../lib/cart-store";
import { CartPanel } from "./cart-panel";
import { cartFixture, marketFixture } from "./cart-panel.mock";
beforeEach(() => {
  getStorefrontQueryClient().clear();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows server line total and freezes controls during payment", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cart: { ...cartFixture, lockedCheckoutId: "checkout-1" },
          checkoutEnabled: true,
        }),
      ),
    ),
  );
  render(<CartPanel market={marketFixture} />);
  expect(await screen.findByText("Alto Sofa", { selector: "p" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Increase Alto Sofa quantity" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen
      .getByRole("link", { name: "View payment status" })
      .getAttribute("href"),
  ).toBe("/au/checkout/return?checkoutId=checkout-1");
  expect(screen.getAllByText("$20")).toHaveLength(2);
});
it("reports unavailable backend and offers retry instead of a false empty bag", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "Shopping service unavailable" },
        }),
        { status: 503 },
      ),
    ),
  );
  render(<CartPanel market={marketFixture} />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Shopping service unavailable"),
  );
  expect(screen.queryByText("Nothing in your bag yet")).toBeNull();
  expect(screen.getByRole("button", { name: "Refresh bag" })).toBeTruthy();
});
it("leaves a re-add notice and preserves legacy data", async () => {
  localStorage.setItem("e-pig:demo-cart:v1:au", "old-cart");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ cart: null, checkoutEnabled: false })),
      ),
  );
  render(<CartPanel market={marketFixture} />);
  expect(await screen.findByText(/previous demo bag/)).toBeTruthy();
  expect(localStorage.getItem("e-pig:demo-cart:v1:au")).toBe("old-cart");
});

it("shows unavailable option guidance while keeping remove enabled", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            cart: {
              ...cartFixture,
              lines: [
                {
                  ...cartFixture.lines[0],
                  problem: "This option is no longer available",
                  availability: "out-of-stock",
                },
              ],
            },
            checkoutEnabled: true,
          }),
        ),
      ),
  );
  render(<CartPanel market={marketFixture} />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("This option is no longer available"),
  );
  expect(
    screen.getByRole("button", { name: "Remove Alto Sofa" }),
  ).toHaveProperty("disabled", false);
  expect(
    screen.getByRole("button", { name: "Increase Alto Sofa quantity" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen.queryByRole("link", { name: "Continue to sandbox checkout" }),
  ).toBeNull();
});
