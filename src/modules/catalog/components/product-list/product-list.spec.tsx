// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";
import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";
import { setCartOpen, setQuantity } from "@/modules/cart/lib/cart-store";

import { ProductList } from "./product-list";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Product image"} />,
}));

const market: CartMarket = { id: "au", currency: "AUD" };

const products: ProductListItem[] = [
  {
    id: "alto-modular-sofa",
    slug: "alto-modular-sofa",
    name: "Alto Modular Sofa",
    category: "Sofas",
    colour: "Moss weave",
    image: "https://example.com/alto.jpg",
    price: { amount: 2890, currency: "AUD" },
  },
  {
    id: "nook-coffee-table",
    slug: "nook-coffee-table",
    name: "Nook Coffee Table",
    category: "Tables",
    colour: "Smoked ash",
    image: "https://example.com/nook.jpg",
    price: { amount: 590, currency: "AUD" },
  },
];

const collection = { handle: "living-room", title: "Living Room" };

beforeEach(() => {
  window.localStorage.clear();
  products.forEach((product) => setQuantity(market, product.id, 0));
  setCartOpen(market, false);
});

afterEach(cleanup);

function renderList(props: { products?: ProductListItem[]; sort?: "price-asc" | "price-desc" | "name" } = {}) {
  return render(
    <CartMarketProvider market={market}>
      <ProductList
        products={props.products ?? products}
        collection={collection}
        marketId="au"
        sort={props.sort}
      />
    </CartMarketProvider>,
  );
}

describe("ProductList", () => {
  it("渲染面包屑、集合标题、件数与商品名称", () => {
    renderList();

    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/au");
    expect(screen.getByRole("heading", { name: "Living Room" })).toBeTruthy();
    expect(screen.getByText("2 pieces")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Alto Modular Sofa" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Nook Coffee Table" })).toBeTruthy();
  });

  it("空集合渲染空态与返回首页链接", () => {
    renderList({ products: [] });

    expect(screen.getByText("This collection is empty")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/au");
  });

  it("渲染排序链接并高亮当前排序", () => {
    renderList({ sort: "price-asc" });

    const priceAsc = screen.getByRole("link", { name: "Price: low to high" });
    const nameLink = screen.getByRole("link", { name: "Name" });

    expect(priceAsc.getAttribute("href")).toBe("/au/collections/living-room?sort=price-asc");
    expect(nameLink.getAttribute("href")).toBe("/au/collections/living-room?sort=name");
    expect(priceAsc.getAttribute("aria-current")).toBe("true");
    expect(nameLink.getAttribute("aria-current")).toBeNull();
  });
});
