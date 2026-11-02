// @vitest-environment jsdom
import { act } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorefrontQueryClient, setCartOpen } from "../../lib/cart-store";
import { useCartMarket } from "../cart-market-context/cart-market-context";
import { marketFixture } from "../cart-panel/cart-panel.mock";
import { CartSheetMount } from "./cart-sheet-mount";
function MarketProbe() {
  return <p>Market: {useCartMarket().id}</p>;
}
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
it("provides market to its children and mounts exactly one drawer", async () => {
  render(
    <CartSheetMount market={marketFixture}>
      <MarketProbe />
    </CartSheetMount>,
  );
  expect(screen.getByText("Market: au")).toBeTruthy();
  act(() => setCartOpen(marketFixture, true));
  expect(await screen.findAllByRole("dialog")).toHaveLength(1);
});
