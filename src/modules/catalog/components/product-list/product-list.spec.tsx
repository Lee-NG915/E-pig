// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";
import type { ProductListFilters } from "@/modules/catalog/lib/plp-query";
import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";
vi.mock("@/modules/cart/lib/cart-store", async (importOriginal) => ({ ...await importOriginal<typeof import("@/modules/cart/lib/cart-store")>(), useCartActions: () => ({ addItem: vi.fn(), pending: false, error: null }) }));

import { ProductList } from "./product-list";

vi.mock("next/image", () => ({
  // Keep decorative thumbnails decorative, and preserve the observed image src.
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
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

afterEach(cleanup);

function renderList(props: { products?: ProductListItem[]; sort?: "price-asc" | "price-desc" | "name"; filters?: ProductListFilters; filterIssues?: string[] } = {}) {
  return render(
    <CartMarketProvider market={market}>
      <ProductList
        products={props.products ?? products}
        collection={collection}
        marketId="au"
        sort={props.sort}
        filters={props.filters}
        availableColours={["Forest Walk", "Winter Cream"]}
        filterIssues={props.filterIssues}
      />
    </CartMarketProvider>,
  );
}

describe("ProductList", () => {
  it("retains filters in sort links and offers a sort-preserving reset for zero matches", () => {
    renderList({ products: [], sort: "price-desc", filters: { colours: ["Forest Walk"], minPrice: 4000, inStockOnly: true } });
    expect(screen.getByText("No products match these filters")).toBeTruthy();
    expect(screen.queryByText("This collection is empty")).toBeNull();
    const sortUrl = new URL(screen.getByRole("link", { name: "Name" }).getAttribute("href")!, "https://example.test");
    expect(sortUrl.searchParams.get("colour")).toBe("Forest Walk");
    expect(sortUrl.searchParams.get("minPrice")).toBe("4000");
    expect(sortUrl.searchParams.get("inStock")).toBe("true");
    expect(sortUrl.searchParams.get("sort")).toBe("name");
    expect(screen.getByRole("link", { name: "Clear all filters" }).getAttribute("href")).toBe("/au/collections/living-room?sort=price-desc");
    expect(screen.getByRole("checkbox", { name: "Winter Cream" })).toBeTruthy();
  });

  it("explains an invalid query without calling it an empty collection", () => {
    renderList({ products: [], filterIssues: ["Choose a supported sort order."] });
    expect(screen.getByText("Check your filter values")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Choose a supported sort order.");
    expect(screen.queryByText("This collection is empty")).toBeNull();
    expect(screen.queryByRole("link", { name: "Name" })).toBeNull();
    expect(screen.getByText("Correct filter values before sorting.")).toBeTruthy();
  });

  it("links to the matching default variant and clears a prior colour choice when the result changes", async () => {
    const previews = [
      { variantId: "winter-2", colour: "Winter Cream", image: "/winter-2.jpg", gallery: [], price: { amount: 2600, currency: "AUD" } },
      { variantId: "forest-2", colour: "Forest Walk", image: "/forest-2.jpg", gallery: [], price: { amount: 2600, currency: "AUD" } },
    ];
    const product = { ...products[0], variantCount: 4, defaultVariantId: "winter-2", variantPreviews: previews };
    const view = render(<CartMarketProvider market={market}><ProductList products={[product]} collection={collection} marketId="au" /></CartMarketProvider>);
    await userEvent.setup().click(screen.getByRole("radio", { name: "Forest Walk" }));
    expect(screen.getByRole("link", { name: /Choose options/ }).getAttribute("href")).toContain("variant=forest-2");
    view.rerender(<CartMarketProvider market={market}><ProductList products={[{ ...product, defaultVariantId: "winter-3", colour: "Winter Cream", image: "/winter-3.jpg", price: { amount: 3550, currency: "AUD" }, variantPreviews: [{ ...previews[0], variantId: "winter-3", image: "/winter-3.jpg", price: { amount: 3550, currency: "AUD" } }] }]} filters={{ minPrice: 3000, colours: ["Winter Cream"] }} availableColours={["Winter Cream", "Forest Walk"]} collection={collection} marketId="au" /></CartMarketProvider>);
    expect(screen.getByRole("link", { name: /Choose options/ }).getAttribute("href")).toBe("/au/products/alto-modular-sofa?variant=winter-3");
    expect(screen.getByRole("img", { name: "Alto Modular Sofa" }).getAttribute("src")).toBe("/winter-3.jpg");
    expect(screen.getByText("$3,550")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Forest Walk" })).toBeNull();
  });

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

  it("switches mobile density without changing the products, count or active sort", async () => {
    renderList({ sort: "price-asc" });
    const user = userEvent.setup();
    const one = screen.getByRole("button", { name: "Show 1 product per row" });
    const two = screen.getByRole("button", { name: "Show 2 products per row" });
    expect(two.getAttribute("aria-pressed")).toBe("true");
    expect(one.getAttribute("aria-pressed")).toBe("false");
    await user.click(one);
    expect(one.getAttribute("aria-pressed")).toBe("true");
    expect(two.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("2 pieces")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Alto Modular Sofa" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Nook Coffee Table" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Price: low to high" }).getAttribute("aria-current")).toBe("true");
    await user.click(two);
    expect(two.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not offer density controls for an empty collection", () => {
    renderList({ products: [] });
    expect(screen.queryByRole("button", { name: /product.*per row/ })).toBeNull();
  });

  it("preserves a selected colour and variant link when density changes", async () => {
    renderList({ products: [{
      ...products[0],
      variantCount: 2,
      defaultVariantId: "moss",
      variantPreviews: [
        { variantId: "moss", colour: "Moss weave", image: "/moss.jpg", gallery: [], price: { amount: 2890, currency: "AUD" } },
        { variantId: "oat", colour: "Oat", image: "/oat.jpg", gallery: [], price: { amount: 2990, currency: "AUD" } },
      ],
    }] });
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Oat" }));
    await user.click(screen.getByRole("button", { name: "Show 1 product per row" }));
    expect(screen.getByRole("radio", { name: "Oat" })).toHaveProperty("checked", true);
    expect(screen.getByRole("link", { name: /Choose options/ }).getAttribute("href")).toBe("/au/products/alto-modular-sofa?variant=oat");
    expect(screen.getByText("$2,990")).toBeTruthy();
  });
});
