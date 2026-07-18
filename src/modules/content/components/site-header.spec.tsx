// @vitest-environment jsdom

import { act } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CartMarketProvider } from "@/modules/cart/components/cart-market-context";
import {
  addItem,
  getCartSnapshot,
  setCartOpen,
  setQuantity,
} from "@/modules/cart/lib/cart-store";

import { SiteHeader } from "./site-header";

const market = { id: "au", currency: "AUD", locale: "en-AU" };
const product = {
  id: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  colour: "Moss weave",
  image: "https://example.com/alto.jpg",
  price: { amount: 2890, currency: "AUD" },
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  for (const line of getCartSnapshot(market).lines) {
    setQuantity(market, line.productId, 0);
  }
  setCartOpen(market, false);
});

afterEach(cleanup);

describe("SiteHeader cart behavior", () => {
  it("只呈现可用操作，并随购物车数量更新", () => {
    render(
      <CartMarketProvider market={market}>
        <SiteHeader />
      </CartMarketProvider>,
    );

    expect(screen.queryByRole("button", { name: /navigation/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /search/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Open bag with 0 items" })).toBeTruthy();

    act(() => addItem(market, product));

    expect(screen.getByRole("button", { name: "Open bag with 1 items" })).toBeTruthy();
  });

  it("点击 bag 按钮会打开当前 market 的购物车", async () => {
    const user = userEvent.setup();
    render(
      <CartMarketProvider market={market}>
        <SiteHeader />
      </CartMarketProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Open bag with 0 items" }));

    expect(getCartSnapshot(market).open).toBe(true);
  });

  it("localStorage 写失败时仍通知 UI 数量变化", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    render(
      <CartMarketProvider market={market}>
        <SiteHeader />
      </CartMarketProvider>,
    );

    act(() => addItem(market, product));

    expect(screen.getByRole("button", { name: "Open bag with 1 items" })).toBeTruthy();
  });

  it("不同 market provider 的 UI 状态互不混合", () => {
    const sgMarket = { id: "sg-provider-test", currency: "SGD", locale: "en-SG" };
    render(
      <>
        <section aria-label="AU cart">
          <CartMarketProvider market={market}>
            <SiteHeader />
          </CartMarketProvider>
        </section>
        <section aria-label="SG cart">
          <CartMarketProvider market={sgMarket}>
            <SiteHeader />
          </CartMarketProvider>
        </section>
      </>,
    );

    act(() => addItem(market, product));

    expect(
      within(screen.getByRole("region", { name: "AU cart" })).getByRole("button", {
        name: "Open bag with 1 items",
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "SG cart" })).getByRole("button", {
        name: "Open bag with 0 items",
      }),
    ).toBeTruthy();
  });
});
