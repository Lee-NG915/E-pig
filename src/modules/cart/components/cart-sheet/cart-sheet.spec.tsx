// @vitest-environment jsdom
import { act } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorefrontQueryClient, setCartOpen } from "../../lib/cart-store";
import { CartMarketProvider } from "../cart-market-context/cart-market-context";
import { marketFixture } from "../cart-panel/cart-panel.mock";
import { CartSheet } from "./cart-sheet";
beforeEach(() => {
  getStorefrontQueryClient().clear();
  setCartOpen(marketFixture, false);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ cart: null, checkoutEnabled: true })),
      ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("is closed until opened and then shows the queried empty state", async () => {
  render(
    <CartMarketProvider market={marketFixture}>
      <CartSheet />
    </CartMarketProvider>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => setCartOpen(marketFixture, true));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(await screen.findByText("Nothing in your bag yet")).toBeTruthy();
});
