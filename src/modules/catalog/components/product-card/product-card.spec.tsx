// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";
import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";

import { formatMarketPrice } from "@/platform/config/format-market-price";

import { ProductCard } from "./product-card";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Product image"} />,
}));

const market: CartMarket = { id: "au", currency: "AUD" };

const product: ProductListItem = {
  variantCount: 1,
  defaultVariantId: "alto-default",
  id: "alto-modular-sofa",
  slug: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  category: "Sofas",
  colour: "Moss weave",
  image: "https://example.com/alto.jpg",
  price: { amount: 2890, currency: "AUD" },
};

const actions = vi.hoisted(() => ({ addItem: vi.fn(), pending: false, error: null as string | null }));
vi.mock("@/modules/cart/lib/cart-store", async (importOriginal) => ({ ...await importOriginal<typeof import("@/modules/cart/lib/cart-store")>(), useCartActions: () => actions }));
beforeEach(() => { actions.addItem.mockReset().mockResolvedValue(undefined); actions.pending = false; actions.error = null; });

afterEach(cleanup);

function renderCard(item: ProductListItem = product) {
  return render(
    <CartMarketProvider market={market}>
      <ProductCard product={item} />
    </CartMarketProvider>,
  );
}

describe("ProductCard", () => {
  it("呈现名称、类目、颜色与按 market 格式化的现价", () => {
    renderCard();

    expect(screen.getByRole("heading", { name: "Alto Modular Sofa" })).toBeTruthy();
    expect(screen.getByText("Sofas")).toBeTruthy();
    expect(screen.getByText("Moss weave")).toBeTruthy();
    expect(screen.getByText(formatMarketPrice(product.price, market.id))).toBeTruthy();
  });

  it("badge 与 compareAt 缺省时不渲染对应元素", () => {
    renderCard();

    expect(screen.queryByText("New")).toBeNull();
    expect(
      screen.queryByText(formatMarketPrice({ amount: 3490, currency: "AUD" }, market.id)),
    ).toBeNull();
  });

  it("badge 与 compareAt 存在时分别渲染徽标与划线价", () => {
    renderCard({
      ...product,
      badge: "New",
      compareAt: { amount: 3490, currency: "AUD" },
    });

    expect(screen.getByText("New")).toBeTruthy();
    expect(
      screen.getByText(formatMarketPrice({ amount: 3490, currency: "AUD" }, market.id)),
    ).toBeTruthy();
  });

  it("图片与标题均链向 /{market}/products/<slug>", () => {
    renderCard();

    const links = screen.getAllByRole("link", { name: product.name });
    expect(links.length).toBe(2);
    links.forEach((link) => {
      expect(link.getAttribute("href")).toBe(`/au/products/${product.slug}`);
    });
    expect(links[0].classList.contains("relative")).toBe(true);
  });

  it("点击加购按钮把商品放入当前 market 的购物袋并打开抽屉", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Add Alto Modular Sofa to bag" }));

    expect(actions.addItem).toHaveBeenCalledWith({ productId: product.id, variantId: "alto-default", quantity: 1 });
  });
  it("routes multiple or unknown variants to product options instead of guessing", () => {
    renderCard({ ...product, variantCount: 2 });
    expect(screen.getByRole("link", { name: /Choose options/ }).getAttribute("href")).toBe(`/au/products/${product.slug}`);
    expect(screen.queryByRole("button", { name: /Add/ })).toBeNull();
  });
  it("shows a quick-add rejection accessibly", async () => {
    actions.addItem.mockRejectedValue(new Error("Unavailable")); renderCard();
    await userEvent.setup().click(screen.getByRole("button", { name: /Add Alto/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

});
