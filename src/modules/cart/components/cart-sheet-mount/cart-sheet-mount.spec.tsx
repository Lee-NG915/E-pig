// @vitest-environment jsdom

import { act } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addItem, getCartSnapshot, setCartOpen, setQuantity } from "@/modules/cart/lib/cart-store";

import { useCartMarket, type CartMarket } from "../cart-market-context/cart-market-context";
import { CartSheetMount } from "./cart-sheet-mount";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Product image"} />,
}));

const market: CartMarket = { id: "au", currency: "AUD" };

const product = {
  id: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  colour: "Moss weave",
  image: "https://example.com/alto.jpg",
  price: { amount: 2890, currency: "AUD" },
};

function MarketProbe() {
  const current = useCartMarket();
  return <p data-testid="market-probe">{current.id}</p>;
}

beforeEach(() => {
  window.localStorage.clear();
  for (const line of getCartSnapshot(market).lines) {
    setQuantity(market, line.productId, 0);
  }
  setCartOpen(market, false);
});

afterEach(cleanup);

describe("CartSheetMount", () => {
  it("渲染 children 并向子树提供 market context", () => {
    render(
      <CartSheetMount market={market}>
        <MarketProbe />
      </CartSheetMount>,
    );

    expect(screen.getByTestId("market-probe").textContent).toBe(market.id);
  });

  it("挂载了 CartSheet：加购后抽屉出现", async () => {
    render(
      <CartSheetMount market={market}>
        <p>shell</p>
      </CartSheetMount>,
    );

    act(() => addItem(market, product));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Your bag")).toBeTruthy();
  });
});
