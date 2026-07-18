// @vitest-environment jsdom

import { act } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addItem, getCartSnapshot, setCartOpen, setQuantity } from "@/modules/cart/lib/cart-store";
import { formatPrice } from "@/shared/lib/money";

import { CartMarketProvider, type CartMarket } from "../cart-market-context/cart-market-context";
import { CartSheet } from "./cart-sheet";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Product image"} />,
}));

const market: CartMarket = { id: "cart-sheet-test", currency: "AUD", locale: "en-AU" };

const product = {
  id: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  colour: "Moss weave",
  image: "https://example.com/alto.jpg",
  price: { amount: 2890, currency: "AUD" },
};

beforeEach(() => {
  window.localStorage.clear();
  for (const line of getCartSnapshot(market).lines) {
    setQuantity(market, line.productId, 0);
  }
  setCartOpen(market, false);
});

afterEach(cleanup);

function renderSheet() {
  return render(
    <CartMarketProvider market={market}>
      <CartSheet />
    </CartMarketProvider>,
  );
}

describe("CartSheet", () => {
  it("cart 关闭时不渲染抽屉", () => {
    renderSheet();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Your bag")).toBeNull();
  });

  it("空袋打开时展示空态，点击 Keep browsing 关闭抽屉", async () => {
    const user = userEvent.setup();
    renderSheet();

    act(() => setCartOpen(market, true));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Nothing in your bag yet")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Keep browsing" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(getCartSnapshot(market).open).toBe(false);
  });

  it("有行项目时展示行信息与小计，步进器增减数量", async () => {
    const user = userEvent.setup();
    renderSheet();

    act(() => addItem(market, product));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Alto Modular Sofa")).toBeTruthy();
    expect(screen.getByText("Moss weave")).toBeTruthy();

    const unit = formatPrice(product.price, market.locale);
    // 行金额与小计各渲染一次
    expect(screen.getAllByText(unit)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Increase Alto Modular Sofa quantity" }));

    const doubled = formatPrice(
      { amount: product.price.amount * 2, currency: "AUD" },
      market.locale,
    );
    expect(screen.getAllByText(doubled)).toHaveLength(2);
    expect(screen.queryByText(unit)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Decrease Alto Modular Sofa quantity" }));
    await user.click(screen.getByRole("button", { name: "Decrease Alto Modular Sofa quantity" }));

    expect(screen.getByText("Nothing in your bag yet")).toBeTruthy();
    expect(getCartSnapshot(market).lines).toHaveLength(0);
  });

  it("有行项目时 checkout 按钮为禁用态", async () => {
    renderSheet();

    act(() => addItem(market, product));
    await screen.findByRole("dialog");

    const checkout = screen.getByRole("button", { name: "Checkout requires backend" });
    expect(checkout).toHaveProperty("disabled", true);
  });
});
