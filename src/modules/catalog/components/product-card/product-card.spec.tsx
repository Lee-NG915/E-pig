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
  // Observe the image boundary's actual src; Next's loading pipeline is outside this component test.
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
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

const previewProduct: ProductListItem = {
  ...product,
  variantCount: 4,
  gallery: [{ src: "https://example.com/alto.jpg", alt: "Alto front" }],
  variantPreviews: [
    { variantId: "alto-default", colour: "Moss weave", image: "https://example.com/alto.jpg", gallery: [], price: { amount: 2890, currency: "AUD" } },
    { variantId: "alto/oat wide", colour: "Oat boucle", image: "https://example.com/oat.jpg", gallery: [{ src: "https://example.com/oat-side.jpg", alt: "Oat side" }], price: { amount: 3090, currency: "AUD" } },
  ],
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

  it("selects a colour preview and keeps image, price and all PDP links on that variant", async () => {
    renderCard({ ...previewProduct, compareAt: { amount: 3490, currency: "AUD" } });
    expect(screen.getAllByRole("link", { name: product.name })[0].getAttribute("href")).toBe("/au/products/alto-modular-sofa");
    await userEvent.setup().click(screen.getByRole("radio", { name: "Oat boucle" }));
    expect(screen.getByRole("radio", { name: "Oat boucle" })).toHaveProperty("checked", true);
    expect(screen.getByRole("img", { name: "Alto Modular Sofa — Oat boucle" })).toHaveProperty("src", "https://example.com/oat.jpg");
    expect(screen.getByText("$3,090")).toBeTruthy();
    expect(screen.queryByText("$3,490")).toBeNull();
    for (const link of [...screen.getAllByRole("link", { name: product.name }), screen.getByRole("link", { name: /Choose options/ })]) {
      expect(link.getAttribute("href")).toBe("/au/products/alto-modular-sofa?variant=alto%2Foat%20wide");
    }
    expect(screen.queryByRole("button", { name: /Add .* to bag/ })).toBeNull();
    expect(actions.addItem).not.toHaveBeenCalled();
  });

  it("browses the selected colour gallery and resets to its primary image when colour changes", async () => {
    renderCard({
      ...previewProduct,
      gallery: [
        { src: "https://example.com/alto.jpg", alt: "Alto front" },
        { src: "https://example.com/moss-side.jpg", alt: "Moss side" },
      ],
    });
    const user = userEvent.setup();
    const next = screen.getByRole("button", { name: "Next image for Alto Modular Sofa" });
    const previous = screen.getByRole("button", { name: "Previous image for Alto Modular Sofa" });
    expect(previous).toHaveProperty("disabled", true);
    await user.click(next);
    expect(screen.getByRole("img", { name: "Moss side" })).toHaveProperty("src", "https://example.com/moss-side.jpg");
    expect(next).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("radio", { name: "Oat boucle" }));
    expect(screen.getByRole("img", { name: "Alto Modular Sofa — Oat boucle" })).toHaveProperty("src", "https://example.com/oat.jpg");
    expect(previous).toHaveProperty("disabled", true);
    expect(screen.getByRole("status")).toHaveProperty("textContent", "Image 1 of 2");
    await user.click(next);
    expect(screen.getByRole("img", { name: "Oat side" })).toHaveProperty("src", "https://example.com/oat-side.jpg");
    await user.click(previous);
    expect(screen.getByRole("img", { name: "Alto Modular Sofa — Oat boucle" })).toHaveProperty("src", "https://example.com/oat.jpg");
    expect(screen.getByRole("link", { name: /Choose options/ }).getAttribute("href")).toBe("/au/products/alto-modular-sofa?variant=alto%2Foat%20wide");
    expect(actions.addItem).not.toHaveBeenCalled();
  });

  it("does not show gallery or colour controls for a single distinct image and one colour", () => {
    renderCard({ ...product, gallery: [{ src: product.image, alt: product.name }], variantPreviews: previewProduct.variantPreviews?.slice(0, 1) });
    expect(screen.queryByRole("button", { name: /Next image/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Previous image/ })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("supports keyboard colour selection with the same explicit variant link", async () => {
    renderCard(previewProduct);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Oat boucle" }));
    screen.getByRole("radio", { name: "Moss weave" }).focus();
    await user.keyboard(" ");
    expect(screen.getByRole("radio", { name: "Moss weave" })).toHaveProperty("checked", true);
    expect(screen.getByRole("link", { name: /Choose options/ }).getAttribute("href")).toBe("/au/products/alto-modular-sofa?variant=alto-default");
  });

  it("requires explicit options when previews identify multiple variants even if the count is stale", () => {
    renderCard({ ...previewProduct, variantCount: 1 });
    expect(screen.getByRole("link", { name: /Choose options/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add .* to bag/ })).toBeNull();
  });

  it("links comparison to the selected variant while filtered previews keep their explicit PDP default", async () => {
    render(<CartMarketProvider market={market}><ProductCard product={previewProduct} linkToDefaultVariant /></CartMarketProvider>);
    expect(screen.getAllByRole("link", { name: product.name })[0].getAttribute("href")).toBe("/au/products/alto-modular-sofa?variant=alto-default");
    expect(screen.getByRole("link", { name: "Compare Alto Modular Sofa" }).getAttribute("href")).toBe("/au/compare?item=alto-modular-sofa%3Aalto-default");
    await userEvent.setup().click(screen.getByRole("radio", { name: "Oat boucle" }));
    expect(screen.getByRole("link", { name: "Compare Alto Modular Sofa" }).getAttribute("href")).toBe("/au/compare?item=alto-modular-sofa%3Aalto%252Foat%2520wide");
    expect(screen.getByRole("link", { name: /Choose options/ }).getAttribute("href")).toBe("/au/products/alto-modular-sofa?variant=alto%2Foat%20wide");
  });

  it("starts comparison with the known default even when normal PDP links omit it", () => {
    renderCard();
    expect(screen.getByRole("link", { name: "Compare Alto Modular Sofa" }).getAttribute("href")).toBe("/au/compare?item=alto-modular-sofa%3Aalto-default");
    expect(screen.getAllByRole("link", { name: product.name })[0].getAttribute("href")).toBe("/au/products/alto-modular-sofa");
  });

  it("keeps a filtered non-original default in both PDP and comparison links", () => {
    const matched = previewProduct.variantPreviews![1];
    render(<CartMarketProvider market={market}><ProductCard product={{ ...previewProduct, defaultVariantId: matched.variantId, price: matched.price, image: matched.image, colour: matched.colour, variantPreviews: [matched] }} linkToDefaultVariant /></CartMarketProvider>);
    expect(screen.getAllByRole("link", { name: product.name })[0].getAttribute("href")).toBe("/au/products/alto-modular-sofa?variant=alto%2Foat%20wide");
    expect(screen.getByRole("link", { name: "Compare Alto Modular Sofa" }).getAttribute("href")).toBe("/au/compare?item=alto-modular-sofa%3Aalto%252Foat%2520wide");
  });

});
