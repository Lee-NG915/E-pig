// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { buildCompareHref } from "../../lib/compare-query";
import { comparisonProduct as product, secondComparisonProduct as second } from "./product-comparison.mock";
import { ProductComparison } from "./product-comparison";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
// jsdom has no layout scrolling or pointer capture; the real Select remains under test.
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
afterEach(cleanup);
async function choose(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, option: string) {
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: option }));
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}
beforeEach(() => push.mockClear());
const entry = { item: { productId: product.id, variantId: product.variants[0].id }, product, variant: product.variants[0], usedDefault: false };

it("opens the shared listbox with the keyboard and returns focus on Escape without changing the comparison", async () => {
  render(<ProductComparison marketId="au" products={[product, second]} entries={[entry]} issues={[]} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole("combobox", { name: "Add a product" });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("listbox")).toBeTruthy();
  expect(screen.getByRole("option", { name: "Alto Sofa" })).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(push).not.toHaveBeenCalled();
});

it("shows exact option facts and a matching market PDP link, without guessing missing fields", () => {
  render(<ProductComparison marketId="au" products={[product, second]} entries={[entry, { item: { productId: second.id, variantId: second.variants[0].id }, product: second, variant: second.variants[0], usedDefault: true }]} issues={[]} />);
  const card = screen.getByRole("article", { name: "Option 1: Alto Sofa" });
  expect(within(card).getByText("$2,600")).toBeTruthy();
  expect(within(card).getByText("210 × 90 × 80 cm (W × D × H)")).toBeTruthy();
  expect(within(card).getByText("Fabric, Timber")).toBeTruthy();
  expect(within(card).getByRole("link", { name: "View this option" }).getAttribute("href")).toBe("/au/products/alto-sofa?variant=green%3Awide");
  expect(screen.getAllByText("Not provided")).toHaveLength(3);
  expect(screen.getByText("Default option selected")).toBeTruthy();
});

it("changes a variant through keyboard input while retaining the other comparison column", async () => {
  const other = { item: { productId: second.id, variantId: second.variants[0].id }, product: second, variant: second.variants[0], usedDefault: false };
  render(<ProductComparison marketId="sg" products={[product, second]} entries={[entry, other]} issues={[]} />);
  const select = screen.getByRole("combobox", { name: "Option for comparison 1" });
  select.focus();
  const user = userEvent.setup();
  await user.keyboard("{Enter}");
  await screen.findByRole("listbox");
  await user.keyboard("{End}{Enter}");
  expect(push).toHaveBeenCalledWith(buildCompareHref("sg", [{ productId: "alto", variantId: "cream / small" }, other.item]), { scroll: false });
});

it("adds a product from the empty state with a keyboard submit", async () => {
  render(<ProductComparison marketId="us" products={[{ ...second, defaultVariantId: "bed-default" }]} entries={[]} issues={[]} />);
  const user = userEvent.setup();
  expect(screen.getByRole("link", { name: "Browse sofas" }).getAttribute("href")).toBe("/us/collections/sofas");
  await choose(user, screen.getByRole("combobox", { name: "Add a product" }), "Harbour Bed");
  await user.tab();
  expect(screen.getByRole("button", { name: "Add to comparison" })).toBe(document.activeElement);
  await user.keyboard("{Enter}");
  expect(push).toHaveBeenCalledWith("/us/compare?item=bed%3Abed-default", { scroll: false });
});

it("adds another real variant of the same product and explains an accidental duplicate", async () => {
  render(<ProductComparison marketId="au" products={[product]} entries={[entry]} issues={[]} />);
  const user = userEvent.setup();
  await choose(user, screen.getByRole("combobox", { name: "Add a product" }), "Alto Sofa");
  await user.click(screen.getByRole("button", { name: "Add to comparison" }));
  expect(screen.getByRole("alert").textContent).toContain("already in your comparison");
  expect(push).not.toHaveBeenCalled();
  await choose(user, screen.getByRole("combobox", { name: "Option to add" }), "Cream / Small — Out of stock");
  await user.click(screen.getByRole("button", { name: "Add to comparison" }));
  expect(push).toHaveBeenCalledWith("/au/compare?item=alto%3Agreen%253Awide&item2=alto%3Acream%2520%252F%2520small", { scroll: false });
});

it("replaces a product with its own default and removes only the requested column", async () => {
  render(<ProductComparison marketId="au" products={[product, { ...second, defaultVariantId: "bed-default" }]} entries={[entry]} issues={[]} />);
  const user = userEvent.setup();
  await choose(user, screen.getByRole("combobox", { name: "Product for comparison 1" }), "Harbour Bed");
  expect(push).toHaveBeenLastCalledWith("/au/compare?item=bed%3Abed-default", { scroll: false });
  await user.click(screen.getByRole("button", { name: "Remove comparison 1" }));
  expect(push).toHaveBeenLastCalledWith("/au/compare", { scroll: false });
});

it("shows sold-out facts and makes a missing explicit option repairable without substituting a price", async () => {
  const soldOut = { ...entry, item: { productId: product.id, variantId: product.variants[1].id }, variant: product.variants[1] };
  render(<ProductComparison marketId="au" products={[product]} entries={[soldOut, { item: { productId: "alto", variantId: "unknown" }, product, usedDefault: false, error: "This option is unavailable in the catalog. Select another option." }]} issues={["An invalid comparison item was not loaded. Choose a product below."]} />);
  expect(screen.getByText("Out of stock", { selector: "dd" })).toBeTruthy();
  expect(screen.getByText("$2,200")).toBeTruthy();
  const missing = screen.getByRole("article", { name: "Option 2: Alto Sofa" });
  expect(within(missing).queryByText("$2,600")).toBeNull();
  expect(within(missing).queryByRole("link", { name: "View this option" })).toBeNull();
  expect(within(missing).getByRole("alert")).toBeTruthy();
  await choose(userEvent.setup(), within(missing).getByRole("combobox", { name: "Option for comparison 2" }), "Green / Wide");
  expect(push).toHaveBeenCalledWith("/au/compare?item=alto%3Acream%2520%252F%2520small&item2=alto%3Agreen%253Awide", { scroll: false });
});

it("limits addition at three options while keeping removal available", () => {
  render(<ProductComparison marketId="au" products={[product, second]} entries={[entry,
    { ...entry, item: { productId: product.id, variantId: product.variants[1].id }, variant: product.variants[1] },
    { item: { productId: "bed", variantId: "bed-default" }, product: second, variant: second.variants[0], usedDefault: false },
  ]} issues={[]} />);
  expect(screen.getByRole("status").textContent).toContain("3 of 3");
  expect(screen.getByRole("button", { name: "Add to comparison" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("combobox", { name: "Add a product" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Remove comparison 3" })).toHaveProperty("disabled", false);
});

it("keeps an unknown product visible until a real product is selected", async () => {
  render(<ProductComparison marketId="au" products={[{ ...product, defaultVariantId: "green:wide" }]} entries={[{
    item: { productId: "removed", variantId: "old" }, usedDefault: false, error: "This product is unavailable in the catalog. Choose another product.",
  }]} issues={[]} />);
  const trigger = screen.getByRole("combobox", { name: "Product for comparison 1" });
  expect(trigger.textContent).toContain("Unavailable product");
  expect(screen.queryByRole("link", { name: "View this option" })).toBeNull();
  await choose(userEvent.setup(), trigger, "Alto Sofa");
  expect(push).toHaveBeenCalledWith("/au/compare?item=alto%3Agreen%253Awide", { scroll: false });
});

it("disables an empty option menu while keeping product replacement available", () => {
  render(<ProductComparison marketId="au" products={[product, second]} entries={[{
    item: { productId: product.id, variantId: "removed" }, product: { ...product, variants: [] }, usedDefault: false, error: "This option is unavailable in the catalog. Select another option.",
  }]} issues={[]} />);
  expect(screen.getByRole("combobox", { name: "Option for comparison 1" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("combobox", { name: "Product for comparison 1" })).toHaveProperty("disabled", false);
  expect(screen.queryByRole("link", { name: "View this option" })).toBeNull();
});

it("retains keyboard focus on the option selector when the URL response updates that column", async () => {
  const { rerender } = render(<ProductComparison marketId="au" products={[product]} entries={[entry]} issues={[]} />);
  await choose(userEvent.setup(), screen.getByRole("combobox", { name: "Option for comparison 1" }), "Cream / Small — Out of stock");
  rerender(<ProductComparison marketId="au" products={[product]} entries={[{ ...entry, item: { productId: product.id, variantId: product.variants[1].id }, variant: product.variants[1] }]} issues={[]} />);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Option for comparison 1" })).toBe(document.activeElement));
});
