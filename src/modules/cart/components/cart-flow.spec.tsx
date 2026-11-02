// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  getStorefrontQueryClient,
  setCartOpen,
  type CartResponse,
} from "../lib/cart-store";
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
beforeEach(() => {
  getStorefrontQueryClient().clear();
  localStorage.clear();
  sessionStorage.clear();
  setCartOpen(marketFixture, false);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_: string, fn: () => unknown) => fn() },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    screen.getByRole("button", { name: "Add Alto Sofa to bag" }),
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
