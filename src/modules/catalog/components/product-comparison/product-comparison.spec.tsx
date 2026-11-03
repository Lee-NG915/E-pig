// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { ComparisonData } from "../../lib/compare-data";
import { parseCompareSearchParams } from "../../lib/compare-query";
import { addCompareItem, resetCompareStoreForTests } from "../../lib/compare-store";
import { comparisonDetailsQueryKey } from "../../hooks/use-comparison-details";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import { comparisonProduct as product, secondComparisonProduct as second } from "./product-comparison.mock";
import { ProductComparison } from "./product-comparison";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
const browserMethods = ["scrollIntoView", "hasPointerCapture"] as const;
const descriptors = browserMethods.map(name => Object.getOwnPropertyDescriptor(HTMLElement.prototype, name));
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
});
afterAll(() => browserMethods.forEach((name, index) => {
  const descriptor = descriptors[index];
  if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, name);
}));
const fetcher = vi.fn();
const firstItem = { productId: product.id, variantId: product.variants[0].id };
const secondItem = { productId: second.id, variantId: second.variants[0].id };
function responseFor(url: string): Response {
  const query = parseCompareSearchParams(Object.fromEntries(new URL(url, "http://localhost").searchParams));
  const entries: ComparisonData["entries"] = query.items.map(item => {
    const selectedProduct = [product, second].find(candidate => candidate.id === item.productId);
    const variant = selectedProduct?.variants.find(candidate => candidate.id === item.variantId);
    return { item, product: selectedProduct, variant, usedDefault: false, ...(!selectedProduct ? { error: "This product is unavailable in the catalog." } : !variant ? { error: "This option is unavailable in the catalog." } : {}) };
  });
  return new Response(JSON.stringify({ entries, issues: [] }));
}
beforeEach(() => {
  localStorage.clear(); resetCompareStoreForTests(); getStorefrontQueryClient().clear();
  fetcher.mockReset().mockImplementation((url: string) => Promise.resolve(responseFor(url)));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); getStorefrontQueryClient().clear(); vi.unstubAllGlobals(); });
async function choose(option: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Option for Alto Sofa" }));
  await user.click(await screen.findByRole("option", { name: option }));
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

it("shows an empty comparison with a market browse link and makes no catalog request", async () => {
  render(<ProductComparison marketId="sg" />);
  expect(await screen.findByRole("heading", { name: "Your comparison is empty" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Browse products" }).getAttribute("href")).toBe("/sg");
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it("compares only selected products in aligned property rows without a catalog picker", async () => {
  addCompareItem("au", firstItem); addCompareItem("au", secondItem);
  render(<ProductComparison marketId="au" />);
  await screen.findByRole("columnheader", { name: /Alto Sofa/ });
  const table = screen.getByRole("table", { name: "Selected products and their specifications" });
  const priceRow = within(table).getByRole("row", { name: /Price/ });
  expect(within(priceRow).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["$2,600", "$2,600"]);
  expect(within(table).getByRole("rowheader", { name: "Width" })).toBeTruthy();
  expect(screen.getByText("210 cm")).toBeTruthy();
  expect(screen.getByText("Fabric, Timber")).toBeTruthy();
  expect(screen.getAllByText("Not provided").length).toBeGreaterThanOrEqual(4);
  expect(screen.queryByRole("combobox", { name: "Add a product" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add to comparison" })).toBeNull();
  expect(screen.getAllByRole("combobox")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "View Alto Sofa details" }).getAttribute("href")).toBe("/au/products/alto-sofa?variant=green%3Awide");
  expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("/api/au/compare?"))).toBe(true);
});

it("encourages continued browsing with one selected product", async () => {
  addCompareItem("us", firstItem);
  render(<ProductComparison marketId="us" />);
  expect(await screen.findByText("Add another product while you browse to compare them side by side.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Browse products" }).getAttribute("href")).toBe("/us");
});

it("updates the stored option and price while preserving the other product and keyboard focus", async () => {
  addCompareItem("au", firstItem); addCompareItem("au", secondItem);
  render(<ProductComparison marketId="au" />);
  await screen.findByRole("combobox", { name: "Option for Alto Sofa" });
  await choose("Cream / Small — Unavailable");
  expect(await screen.findByText("$2,200")).toBeTruthy();
  expect(screen.getByRole("cell", { name: "Unavailable for sandbox checkout" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: /Harbour Bed/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: "View Alto Sofa details" }).getAttribute("href")).toBe("/au/products/alto-sofa?variant=cream%20%2F%20small");
  const lastUrl = fetcher.mock.calls.at(-1)?.[0] as string;
  expect(parseCompareSearchParams(Object.fromEntries(new URL(lastUrl, "http://localhost").searchParams)).items).toEqual([{ productId: "alto", variantId: "cream / small" }, secondItem]);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Option for Alto Sofa" })));
});

it("removes the last selected product and returns focus to browsing", async () => {
  addCompareItem("au", firstItem);
  render(<ProductComparison marketId="au" />);
  await userEvent.setup().click(await screen.findByRole("button", { name: "Remove Alto Sofa" }));
  expect(await screen.findByRole("heading", { name: "Your comparison is empty" })).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "Browse products" })));
});

it("keeps an unavailable product removable without a replacement picker or guessed price", async () => {
  addCompareItem("au", { productId: "removed", variantId: "old" });
  render(<ProductComparison marketId="au" />);
  expect(await screen.findByText("This product is unavailable in the catalog.")).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("link", { name: /View .* details/ })).toBeNull();
  expect(screen.queryByText("removed")).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Remove selected product 1" }));
  expect(await screen.findByRole("heading", { name: "Your comparison is empty" })).toBeTruthy();
});

it("retries a details failure rather than presenting an empty selection", async () => {
  addCompareItem("au", firstItem); fetcher.mockRejectedValueOnce(new TypeError("Network unavailable"));
  render(<ProductComparison marketId="au" />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Your comparison is empty" })).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry loading products" }));
  expect(await screen.findByText("$2,600")).toBeTruthy();
});

it("opens only this product's options by keyboard and restores focus on Escape", async () => {
  addCompareItem("au", firstItem);
  render(<ProductComparison marketId="au" />);
  const trigger = await screen.findByRole("combobox", { name: "Option for Alto Sofa" });
  trigger.focus(); const user = userEvent.setup(); await user.keyboard("{Enter}");
  expect(await screen.findByRole("option", { name: "Green / Wide" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Harbour Bed" })).toBeNull();
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(trigger);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("provides a keyboard-reachable scroll region with labelled columns and rows", async () => {
  addCompareItem("au", firstItem); addCompareItem("au", secondItem);
  render(<ProductComparison marketId="au" />);
  const area = await screen.findByRole("region", { name: "Product comparison table" });
  expect(area.getAttribute("tabindex")).toBe("0");
  expect(screen.getByText("Scroll across to compare products. Product names and feature labels stay visible.")).toBeTruthy();
  expect(within(area).getByRole("table", { name: "Selected products and their specifications" })).toBeTruthy();
});

it("does not display the previous option's price while the replacement details are loading", async () => {
  addCompareItem("au", firstItem);
  render(<ProductComparison marketId="au" />);
  await screen.findByText("$2,600");
  let finish!: () => void;
  fetcher.mockImplementationOnce((url: string) => new Promise<Response>(resolve => { finish = () => resolve(responseFor(url)); }));
  await choose("Cream / Small — Unavailable");
  expect(screen.getByRole("status").textContent).toContain("Loading selected products");
  expect(screen.queryByText("$2,600")).toBeNull();
  expect(screen.getByRole("button", { name: "Remove selected product 1" })).toBeTruthy();
  finish();
  expect(await screen.findByText("$2,200")).toBeTruthy();
});

it("treats a zero quantity limit as unavailable even when the availability flag says in stock", async () => {
  addCompareItem("au", firstItem);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ entries: [{ item: firstItem, product, variant: { ...product.variants[0], maxQuantity: 0 }, usedDefault: false }], issues: [] })));
  render(<ProductComparison marketId="au" />);
  expect(await screen.findByRole("cell", { name: "Unavailable for sandbox checkout" })).toBeTruthy();
  expect(screen.queryByRole("cell", { name: "Available for sandbox checkout" })).toBeNull();
  expect(screen.getByText(/no real stock reservation or delivery/)).toBeTruthy();
});

it("hides prior prices and availability after a same-selection background refresh fails", async () => {
  addCompareItem("au", firstItem);
  render(<ProductComparison marketId="au" />);
  expect(await screen.findByText("$2,600")).toBeTruthy();
  let failRefresh!: () => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { failRefresh = () => reject(new TypeError("Refresh unavailable")); }));
  let refresh!: Promise<void>;
  await act(async () => { refresh = getStorefrontQueryClient().invalidateQueries({ queryKey: comparisonDetailsQueryKey("au", [firstItem]) }); });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Updating product details"));
  expect(screen.queryByText("$2,600")).toBeNull();
  expect(screen.queryByRole("cell", { name: "Available for sandbox checkout" })).toBeNull();
  await act(async () => { failRefresh(); await refresh; });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("$2,600")).toBeNull();
  expect(screen.queryByRole("cell", { name: "Available for sandbox checkout" })).toBeNull();
  expect(screen.getByRole("columnheader", { name: /Alto Sofa/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove Alto Sofa" })).toBeTruthy();
  expect(screen.getAllByRole("cell", { name: "Not available" }).length).toBeGreaterThan(1);
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry loading products" }));
  expect(await screen.findByText("$2,600")).toBeTruthy();
});

it("focuses browsing immediately after a two-to-one removal and does not steal focus on the late response", async () => {
  addCompareItem("au", firstItem); addCompareItem("au", secondItem);
  render(<ProductComparison marketId="au" />);
  await screen.findByRole("button", { name: "Remove Alto Sofa" });
  let finish!: () => void;
  fetcher.mockImplementationOnce((url: string) => new Promise<Response>(resolve => { finish = () => resolve(responseFor(url)); }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Remove Alto Sofa" }));
  expect(screen.getByRole("status").textContent).toContain("Loading selected products");
  expect(document.activeElement).toBe(screen.getByRole("link", { name: "Browse products" }));
  const area = screen.getByRole("region", { name: "Product comparison table" });
  area.focus(); finish();
  await screen.findByRole("columnheader", { name: /Harbour Bed/ });
  expect(document.activeElement).toBe(area);
});
