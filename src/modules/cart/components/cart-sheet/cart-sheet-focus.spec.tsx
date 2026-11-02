// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProductDetail as ProductDetailData } from "@/core/contracts/commerce/catalog";
import { ProductCard } from "@/modules/catalog/components/product-card/product-card";
import { ProductDetail } from "@/modules/catalog/components/product-detail/product-detail";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { getStorefrontQueryClient, setCartOpen } from "../../lib/cart-store";
import { CartMarketProvider } from "../cart-market-context/cart-market-context";
import { cartFixture, marketFixture } from "../cart-panel/cart-panel.mock";
import { CartSheet } from "./cart-sheet";

vi.mock("next/navigation", () => ({ usePathname: () => "/au/products/alto" }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => (
    <span role="img" aria-label={alt || "Product image"} />
  ),
}));
const product: ProductDetailData = {
  id: "alto",
  slug: "alto",
  name: "Alto Sofa",
  description: "Sandbox sofa",
  category: "Sofas",
  colour: "Moss",
  image: "/sofa.jpg",
  price: { amount: 10, currency: "AUD" },
  variantCount: 1,
  defaultVariantId: "alto-small",
  availability: "in-stock",
  materials: [],
  colourOptions: [],
  gallery: [{ src: "/sofa.jpg", alt: "Sofa" }],
  variants: [
    {
      id: "alto-small",
      sku: "SANDBOX-SMALL",
      label: "Compact",
      image: "/sofa.jpg",
      price: { amount: 10, currency: "AUD" },
      availability: "in-stock",
      maxQuantity: 5,
    },
  ],
};
function Harness({
  variant = "detail",
  showProduct = true,
}: {
  variant?: "detail" | "quick";
  showProduct?: boolean;
}) {
  return (
    <>
      <CartMarketProvider market={marketFixture}>
        <SiteHeader />
        <CartSheet />
      </CartMarketProvider>
      {showProduct && (
        <CartMarketProvider market={marketFixture}>
          {variant === "detail" ? (
            <ProductDetail product={product} />
          ) : (
            <ProductCard product={product} />
          )}
        </CartMarketProvider>
      )}
    </>
  );
}
beforeEach(() => {
  getStorefrontQueryClient().clear();
  localStorage.clear();
  setCartOpen(marketFixture, false);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, run: () => unknown) => run() },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const emptyResponse = () =>
  new Response(JSON.stringify({ cart: null, checkoutEnabled: true }));
function delayedAdd() {
  let finish!: () => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Promise<Response>((resolve) => {
          finish = () =>
            resolve(
              new Response(
                JSON.stringify({ cart: cartFixture, checkoutEnabled: true }),
              ),
            );
        });
      return emptyResponse();
    }),
  );
  return async () => {
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await act(async () => finish());
  };
}
it.each(["detail", "quick"] as const)(
  "returns focus to the original %s add button after asynchronous success and Escape",
  async (variant) => {
    const finish = delayedAdd();
    render(<Harness variant={variant} />);
    const user = userEvent.setup();
    const opener = screen.getByRole("button", {
      name: variant === "detail" ? "Add to bag" : "Add Alto Sofa to bag",
    });
    act(() => opener.focus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(opener).toHaveProperty("disabled", true));
    // Focus can move while the server request is pending; the opener must already be remembered.
    act(() => screen.getByRole("link", { name: "Search products" }).focus());
    await finish();
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  },
);
it("returns focus to the Header bag button after ordinary keyboard open and Escape", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => emptyResponse()),
  );
  render(<Harness showProduct={false} />);
  const user = userEvent.setup();
  const opener = screen.getByRole("button", { name: "Open bag with 0 items" });
  act(() => opener.focus());
  await user.keyboard("{Enter}");
  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(opener));
});
it("falls back to the current Header bag button when the original add button was removed", async () => {
  const finish = delayedAdd();
  const view = render(<Harness />);
  const user = userEvent.setup();
  act(() => screen.getByRole("button", { name: "Add to bag" }).focus());
  await user.keyboard("{Enter}");
  await finish();
  await screen.findByRole("dialog");
  view.rerender(<Harness showProduct={false} />);
  const fallback = screen.getByRole("button", {
    name: /Open bag with .* items/,
    hidden: true,
  });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(fallback));
});
