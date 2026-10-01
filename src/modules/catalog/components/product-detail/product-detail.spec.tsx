// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductDetail as ProductDetailData } from "@/core/contracts/commerce/catalog";
import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";
import { getCartSnapshot, setCartOpen, setQuantity } from "@/modules/cart/lib/cart-store";

import { ProductDetail } from "./product-detail";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Product image"} />,
}));

const market: CartMarket = { id: "au", currency: "AUD" };

const product: ProductDetailData = {
  id: "floating-phone",
  slug: "floating-phone",
  name: "Floating Phone",
  category: "Armchairs",
  colour: "Sky",
  image: "/pdp/pdp-main.png",
  price: { amount: 1139.33, currency: "AUD" },
  description: "Met minim Mollie non desert Alamo est sit cliquey dolor do met sent.",
  materials: ["Fabric"],
  gallery: [
    { src: "/pdp/pdp-main.png", alt: "Main product image" },
    { src: "/pdp/pdp-main.png", alt: "Alternate product image" },
  ],
  rating: 4,
  reviewCount: 10,
  availability: "in-stock",
  colourOptions: [
    { id: "sky", label: "Sky", swatch: "#23A6F0" },
    { id: "mint", label: "Mint", swatch: "#2DC071" },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  setQuantity(market, product.id, 0);
  setCartOpen(market, false);
});

afterEach(cleanup);

function renderDetail(item: ProductDetailData = product) {
  return render(
    <CartMarketProvider market={market}>
      <ProductDetail product={item} />
    </CartMarketProvider>,
  );
}

describe("ProductDetail", () => {
  it("呈现商品详情的核心信息", () => {
    renderDetail();

    expect(screen.getByRole("heading", { name: "Floating Phone" })).toBeTruthy();
    expect(screen.getByText("$1,139.33")).toBeTruthy();
    expect(screen.getByText("10 Reviews")).toBeTruthy();
    expect(screen.getByText("In Stock")).toBeTruthy();
    expect(screen.getByText(product.description)).toBeTruthy();
  });

  it("通过缩略图和箭头切换主图", async () => {
    const user = userEvent.setup();
    renderDetail();

    expect(screen.getByRole("img", { name: "Main product image" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next product image" }));
    expect(screen.getByRole("img", { name: "Alternate product image" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show product image 1" }));
    expect(screen.getByRole("img", { name: "Main product image" })).toBeTruthy();
  });

  it("选择颜色后将商品加入当前 market 的 demo cart", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: "Select Options" }));
    expect(screen.getByRole("button", { name: "Add to bag" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Mint" }));
    await user.click(screen.getByRole("button", { name: "Add to bag" }));

    const cart = getCartSnapshot(market);
    expect(cart.open).toBe(true);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]).toMatchObject({ productId: product.id, colour: "Mint", quantity: 1 });
  });

  it("缺货时禁用主按钮并保留占位操作的可访问名称", () => {
    renderDetail({ ...product, availability: "out-of-stock" });

    expect(screen.getByText("Out of Stock")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select Options" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Add product to wishlist" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add product to basket" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview product" })).toBeTruthy();
  });
});
