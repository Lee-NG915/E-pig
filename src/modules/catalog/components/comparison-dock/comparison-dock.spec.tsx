// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorefrontQueryClient, setCartOpen } from "@/modules/cart/lib/cart-store";
import { addCompareItem, resetCompareStoreForTests } from "../../lib/compare-store";
import { parseCompareSearchParams } from "../../lib/compare-query";
import { AddToComparison } from "../add-to-comparison/add-to-comparison";
import { comparisonProduct as product, secondComparisonProduct as second } from "../product-comparison/product-comparison.mock";
import { dismissComparisonFeedback } from "./comparison-feedback";
import { ComparisonDock } from "./comparison-dock";

const route = vi.hoisted(() => ({ pathname: "/au/collections/sofas" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
const market = { id: "au", currency: "AUD" };
const firstItem = { productId: product.id, variantId: product.variants[0].id };
beforeEach(() => {
  route.pathname = "/au/collections/sofas";
  localStorage.clear(); resetCompareStoreForTests(); dismissComparisonFeedback("au");
  getStorefrontQueryClient().clear(); setCartOpen(market, false);
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input, "http://localhost");
    const { items } = parseCompareSearchParams(Object.fromEntries(url.searchParams));
    return new Response(JSON.stringify({ issues: [], entries: items.map(item => {
      const found = [product, second].find(candidate => candidate.id === item.productId);
      return { item, product: found, variant: found?.variants.find(variant => variant.id === item.variantId), usedDefault: false, ...(!found ? { error: "This product is unavailable in the catalog." } : {}) };
    }) }));
  }));
});
afterEach(() => { cleanup(); getStorefrontQueryClient().clear(); vi.unstubAllGlobals(); });

it("stays absent for an empty list and does not request the entire catalog", () => {
  render(<ComparisonDock marketId="au" />);
  expect(screen.queryByRole("button", { name: /Open comparison/ })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("announces an in-place add, opens only on request, and returns focus after Escape", async () => {
  render(<><AddToComparison marketId="au" item={firstItem} productName={product.name} /><ComparisonDock marketId="au" /></>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Add ${product.name} to comparison` }));
  expect(screen.getByRole("status").textContent).toBe("Alto Sofa added to comparison.");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  const trigger = screen.getByRole("button", { name: "Open comparison list, 1 product" });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog");
  expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "Your comparison (1)" }));
  expect(await within(dialog).findByRole("link", { name: "Alto Sofa" })).toBeTruthy();
  expect(within(dialog).getByRole("link", { name: "Compare 1 product" }).getAttribute("href")).toBe("/au/compare");
  expect(within(dialog).getByText(/Add one more product/)).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});

it("removes products across all entry points, including the last item, without leaving the page", async () => {
  addCompareItem("au", firstItem); addCompareItem("au", { productId: second.id, variantId: second.variants[0].id });
  render(<><AddToComparison marketId="au" item={firstItem} productName={product.name} /><ComparisonDock marketId="au" /></>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open comparison list, 2 products" }));
  await user.click(await screen.findByRole("button", { name: "Remove Alto Sofa from comparison" }));
  await user.click(await screen.findByRole("button", { name: "Remove Harbour Bed from comparison" }));
  expect(await screen.findByText("Your comparison list is empty")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue browsing" })));
  await user.click(screen.getByRole("button", { name: "Continue browsing" }));
  expect(screen.getByRole("button", { name: "Add Alto Sofa to comparison" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByRole("button", { name: /Open comparison/ })).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add Alto Sofa to comparison" })));
});

it("preserves the list on a failed request and allows retry or removal of a missing product", async () => {
  addCompareItem("au", { productId: "gone", variantId: "gone-option" });
  vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Offline"));
  render(<ComparisonDock marketId="au" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open comparison list, 1 product" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("selected products are still in the list"));
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await user.click(await screen.findByRole("button", { name: "Remove Unavailable product from comparison" }));
  expect(await screen.findByText("Your comparison list is empty")).toBeTruthy();
});

it("yields to the shopping bag when a delayed add completes and does not reopen afterwards", async () => {
  addCompareItem("au", firstItem);
  render(<ComparisonDock marketId="au" />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Open comparison list, 1 product" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  act(() => setCartOpen(market, true));
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => setCartOpen(market, false));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Open comparison list, 1 product" })).toBeTruthy();
});

it.each(["/au/cart", "/au/checkout", "/au/checkout/return", "/au/orders/order-1", "/au/compare"])("hides the dock on %s while preserving the selection", pathname => {
  route.pathname = pathname; addCompareItem("au", firstItem);
  render(<ComparisonDock marketId="au" />);
  expect(screen.queryByRole("button", { name: /Open comparison/ })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("e-pig:compare:v1:au")!)).toEqual([firstItem]);
});
