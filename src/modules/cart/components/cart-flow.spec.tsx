// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setCartOpen, setQuantity } from "@/modules/cart/lib/cart-store";
import { ProductCard } from "@/modules/catalog/components/product-card/product-card";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";

import { CartMarketProvider, type CartMarket } from "./cart-market-context/cart-market-context";
import { CartSheet } from "./cart-sheet/cart-sheet";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Product image"} />,
}));

const market: CartMarket = { id: "component-test", currency: "AUD", locale: "en-AU" };
const product = {
  id: "alto-modular-sofa",
  slug: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  description: "A modular sofa",
  category: "Sofas",
  colour: "Moss weave",
  image: "https://example.com/alto.jpg",
  price: { amount: 2890, currency: "AUD" },
};

beforeEach(() => {
  window.localStorage.clear();
  setQuantity(market, product.id, 0);
  setCartOpen(market, false);
});

afterEach(cleanup);

describe("local cart user journey", () => {
  it("从商品卡加购、打开抽屉、调整数量并移除商品", async () => {
    const user = userEvent.setup();
    render(
      <CartMarketProvider market={market}>
        <SiteHeader />
        <ProductCard product={product} locale={market.locale} />
        <CartSheet />
      </CartMarketProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Add Alto Modular Sofa to bag" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Your bag")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open bag with 1 items", hidden: true }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Increase Alto Modular Sofa quantity" }));
    expect(
      screen.getByRole("button", { name: "Open bag with 2 items", hidden: true }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Decrease Alto Modular Sofa quantity" }));
    await user.click(screen.getByRole("button", { name: "Decrease Alto Modular Sofa quantity" }));

    expect(screen.getByText("Nothing in your bag yet")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open bag with 0 items", hidden: true }),
    ).toBeTruthy();
  });
});
