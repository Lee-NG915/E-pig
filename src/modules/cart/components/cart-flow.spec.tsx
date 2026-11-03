// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProductDetail as ProductDetailData } from "@/core/contracts/commerce/catalog";
import {
  getStorefrontQueryClient,
  recoverCart,
  refreshCart,
  setCartOpen,
  type CartResponse,
} from "../lib/cart-store";
import { ProductDetail } from "@/modules/catalog/components/product-detail/product-detail";
import { ProductCard } from "@/modules/catalog/components/product-card/product-card";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { CartMarketProvider } from "./cart-market-context/cart-market-context";
import { CartSheet } from "./cart-sheet/cart-sheet";
import { cartFixture, marketFixture } from "./cart-panel/cart-panel.mock";
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => (
    <span role="img" aria-label={alt || "Product image"} />
  ),
}));
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  setCartOpen(marketFixture, false);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_: string, fn: () => unknown) => fn() },
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ cart: null, checkoutEnabled: true, mutationApplied: true }))));
  await recoverCart(marketFixture); await refreshCart(marketFixture);
  getStorefrontQueryClient().clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("recovers a lost single-add response automatically before allowing a new bundle update", async () => {
  const posts: { action: string; idempotencyKey: string; items?: unknown; productId?: string; variantId?: string; quantity?: number }[] = [];
  let state: CartResponse = { cart: null, checkoutEnabled: true };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)); posts.push(body);
      state = { checkoutEnabled: true, cart: { ...cartFixture, revision: posts.length } };
      if (posts.length === 1) throw new TypeError("Single response lost");
    }
    return new Response(JSON.stringify({ ...state, ...(url.includes("mutationKey=") ? { mutationApplied: true } : {}) }));
  }));
  const sofa: ProductDetailData = {
    id: "alto", slug: "alto", name: "Alto Sofa", category: "Sofas", colour: "Cream", image: "/sofa.jpg",
    price: { amount: 10, currency: "AUD" }, description: "Demo", materials: [], gallery: [], colourOptions: [], availability: "in-stock",
    variants: [{ id: "alto-small", sku: "SOFA", label: "Compact / sandbox", image: "/sofa.jpg", price: { amount: 10, currency: "AUD" }, availability: "in-stock", maxQuantity: 5 }],
  };
  const companion: ProductDetailData = { ...sofa, id: "ottoman", slug: "ottoman", name: "Ottoman", variants: [{ ...sofa.variants[0], id: "ottoman-default" }] };
  render(<CartMarketProvider market={marketFixture}><ProductDetail product={sofa} bundleCompanion={companion} /></CartMarketProvider>);
  const user = userEvent.setup();
  const single = screen.getByRole("button", { name: "Add selected option to bag" });
  await user.click(single);
  expect(await screen.findByText("Compact / sandbox added to your bag.")).toBeTruthy();
  await waitFor(() => expect(single).toHaveProperty("disabled", false));
  expect(screen.getByLabelText("Companion option")).toHaveProperty("disabled", false);
  expect(screen.queryByRole("button", { name: "Retry set addition" })).toBeNull();
  expect(posts).toHaveLength(1);
  await waitFor(() => expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull());
  await user.click(screen.getByRole("button", { name: "Add both items to bag" }));
  expect(await screen.findByText("Both selected items were added to your bag.")).toBeTruthy();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toMatchObject({ action: "addItems", items: [{ productId: "alto", variantId: "alto-small", quantity: 1 }, { productId: "ottoman", variantId: "ottoman-default", quantity: 1 }] });
  expect(posts[1].idempotencyKey).not.toBe(posts[0].idempotencyKey);
});

it("unlocks a saved bundle after background receipt confirmation without another addItems call", async () => {
  const posts: { action: string; idempotencyKey: string }[] = [];
  let canCheck = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); throw new TypeError("Response lost"); }
    if (url.includes("mutationKey=") && !canCheck) throw new TypeError("Still offline");
    return new Response(JSON.stringify({ cart: posts.length ? cartFixture : null, checkoutEnabled: true, mutationApplied: canCheck }));
  }));
  const sofa: ProductDetailData = {
    id: "alto", slug: "alto", name: "Alto Sofa", category: "Sofas", colour: "Cream", image: "/sofa.jpg", price: { amount: 10, currency: "AUD" },
    description: "Demo", materials: [], gallery: [], colourOptions: [], availability: "in-stock",
    variants: [{ id: "alto-small", sku: "SOFA", label: "Compact / sandbox", image: "/sofa.jpg", price: { amount: 10, currency: "AUD" }, availability: "in-stock", maxQuantity: 5 }],
  };
  render(<CartMarketProvider market={marketFixture}><ProductDetail product={sofa} bundleCompanion={{ ...sofa, id: "ottoman", name: "Ottoman" }} /></CartMarketProvider>);
  await userEvent.setup().click(await screen.findByRole("button", { name: "Add both items to bag" }));
  expect(await screen.findByRole("button", { name: "Retry set addition" })).toBeTruthy();
  expect(screen.getByLabelText("Companion option")).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Add selected option to bag" })).toHaveProperty("disabled", true);
  canCheck = true;
  await act(async () => { window.dispatchEvent(new Event("online")); });
  expect(await screen.findByText("Both selected items were added to your bag.")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry set addition" })).toBeNull();
  expect(screen.getByLabelText("Companion option")).toHaveProperty("disabled", false);
  expect(screen.getByRole("button", { name: "Add selected option to bag" })).toHaveProperty("disabled", false);
  expect(posts).toHaveLength(1);
  expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
});
it("shares the server bag across separate product and header islands and updates/removes a variant", async () => {
  let state: CartResponse = { cart: null, checkoutEnabled: true };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        const quantity = body.action === "add" ? 1 : body.quantity;
        state = {
          cart: {
            ...cartFixture,
            revision: (state.cart?.revision ?? 0) + 1,
            lines: quantity
              ? [
                  {
                    ...cartFixture.lines[0],
                    quantity,
                    lineTotal: { amount: quantity * 10, currency: "AUD" },
                  },
                ]
              : [],
            subtotal: { amount: quantity * 10, currency: "AUD" },
          },
          checkoutEnabled: true,
        };
      }
      return new Response(JSON.stringify(state));
    }),
  );
  const product = {
    id: "alto",
    slug: "alto",
    name: "Alto Sofa",
    description: "Sandbox sofa",
    category: "Sofas",
    colour: "Moss",
    image: "https://example.com/sofa.jpg",
    price: { amount: 10, currency: "AUD" },
    variantCount: 1,
    defaultVariantId: "alto-small",
  };
  render(
    <>
      <CartMarketProvider market={marketFixture}>
        <SiteHeader />
        <CartSheet />
      </CartMarketProvider>
      <CartMarketProvider market={marketFixture}>
        <ProductCard product={product} />
      </CartMarketProvider>
    </>,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Add Alto Sofa to bag" }),
  );
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Open bag with 1 items", hidden: true }),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Increase Alto Sofa quantity" }),
  );
  expect(
    await screen.findByRole("button", {
      name: "Open bag with 2 items",
      hidden: true,
    }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Remove Alto Sofa" }));
  expect(await screen.findByText("Nothing in your bag yet")).toBeTruthy();
});


it("carries the selected PDP variant through the real store request and displays the server line", async () => {
  let state: CartResponse = { cart: null, checkoutEnabled: true };
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({ action: "add", productId: "alto", variantId: "alto-green-3", quantity: 1 });
      expect(body).not.toHaveProperty("price");
      expect(body.idempotencyKey).toEqual(expect.any(String));
      state = { checkoutEnabled: true, cart: { ...cartFixture, revision: 3,
        lines: [{ ...cartFixture.lines[0], variantId: "alto-green-3", variantLabel: "Green / 3 Sections", quantity: 1, image: "/green.jpg", unitPrice: { amount: 150, currency: "AUD" }, lineTotal: { amount: 150, currency: "AUD" } }],
        subtotal: { amount: 150, currency: "AUD" },
      } };
    }
    return new Response(JSON.stringify(state));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<CartMarketProvider market={marketFixture}><ProductDetail initialVariantId="alto-green-3" product={{
    id: "alto", slug: "alto", name: "Alto Sofa", category: "Sofas", colour: "Cream", image: "/cream.jpg", price: { amount: 100, currency: "AUD" },
    description: "Demo sofa", materials: [], gallery: [], availability: "in-stock", colourOptions: [],
    variants: [
      { id: "alto-default", sku: "DEMO-DEFAULT", label: "Cream / 2 Sections", image: "/cream.jpg", price: { amount: 100, currency: "AUD" }, availability: "in-stock", maxQuantity: 5 },
      { id: "alto-green-3", sku: "DEMO-GREEN-3", label: "Green / 3 Sections", image: "/green.jpg", price: { amount: 150, currency: "AUD" }, availability: "in-stock", maxQuantity: 5 },
    ],
  }} /><CartSheet /></CartMarketProvider>);
  await userEvent.setup().click(screen.getByRole("button", { name: "Add selected option to bag" }));
  const bag = await screen.findByRole("dialog");
  expect(bag.textContent).toContain("Green / 3 Sections");
  expect(bag.textContent).toContain("$150");
  expect(bag.querySelector('a[href="/au/products/alto?variant=alto-green-3"]')).toBeTruthy();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
