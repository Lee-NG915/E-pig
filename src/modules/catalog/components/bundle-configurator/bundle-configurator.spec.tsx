// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProductDetail } from "@/core/contracts/commerce/catalog";
import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { CartUpdateUnconfirmedError, StorefrontHttpError, type useCartActions } from "@/modules/cart/lib/cart-store";
import { BundleConfigurator } from "./bundle-configurator";
const actions = vi.hoisted(() => ({ addItems: vi.fn(), retry: vi.fn(), pending: false, error: null as string | null, recovery: "idle" as "idle" | "checking" | "needs_retry", resolution: null as ReturnType<typeof useCartActions>["resolution"] }));
vi.mock("@/modules/cart/lib/cart-store", async importOriginal => ({ ...await importOriginal<typeof import("@/modules/cart/lib/cart-store")>(), useCartActions: () => actions }));
vi.mock("next/image", () => ({ default: ({ alt, src }: { alt: string; src: string }) => <span role="img" aria-label={alt} data-src={src} /> }));
const sofa: ProductDetail = { id: "sofa", slug: "sofa", name: "Sofa", category: "Sofas", colour: "Cream", image: "/sofa.jpg", price: { amount: 100, currency: "AUD" }, description: "Demo", materials: [], gallery: [], colourOptions: [], availability: "in-stock", variants: [{ id: "sofa-default", sku: "SOFA", label: "Cream / Small", image: "/sofa.jpg", price: { amount: 100, currency: "AUD" }, availability: "in-stock", maxQuantity: 5 }] };
const ottoman: ProductDetail = { ...sofa, id: "ottoman", slug: "ottoman", name: "Ottoman", variants: [
  { ...sofa.variants[0], id: "ottoman-cream", label: "Cream", price: { amount: 30, currency: "AUD" }, image: "/ottoman-cream.jpg" },
  { ...sofa.variants[0], id: "ottoman-green", label: "Green", price: { amount: 40, currency: "AUD" }, image: "/ottoman-green.jpg" },
  { ...sofa.variants[0], id: "ottoman-out", label: "Unavailable", availability: "out-of-stock" },
] };
function show(onLock = vi.fn(), id: string | undefined = "sofa-default") { return render(<CartMarketProvider market={{ id: "au", currency: "AUD" }}><BundleConfigurator product={sofa} selectedVariantId={id} companion={ottoman} onSelectionLockChange={onLock} /></CartMarketProvider>); }
beforeEach(() => { actions.pending = false; actions.error = null; actions.recovery = "idle"; actions.resolution = null; actions.retry.mockReset().mockResolvedValue(undefined); actions.addItems.mockReset().mockResolvedValue(undefined); });
afterEach(cleanup);
it("prices the selected pair and sends both IDs in one atomic request", async () => {
  show(); const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Companion option"), "ottoman-green");
  expect(screen.getByText("Set total: $140")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Ottoman — Green" }).getAttribute("data-src")).toBe("/ottoman-green.jpg");
  await user.click(screen.getByRole("button", { name: "Add both items to bag" }));
  expect(actions.addItems).toHaveBeenCalledExactlyOnceWith([{ productId: "sofa", variantId: "sofa-default", quantity: 1 }, { productId: "ottoman", variantId: "ottoman-green", quantity: 1 }]);
  expect(await screen.findByRole("status")).toBeTruthy();
});
it("keeps the uncertain request frozen and retries only its saved key", async () => {
  const lock = vi.fn(); actions.addItems.mockRejectedValueOnce(new CartUpdateUnconfirmedError("saved-set-key")); show(lock); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add both items to bag" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect((screen.getByLabelText("Companion option") as HTMLSelectElement).disabled).toBe(true);
  expect(lock).toHaveBeenLastCalledWith(true);
  actions.retry.mockImplementationOnce(async (key: string) => { actions.resolution = { key, input: { action: "addItems", items: actions.addItems.mock.calls[0][0] }, status: "confirmed" }; });
  await user.click(screen.getByRole("button", { name: "Retry set addition" }));
  expect(actions.retry).toHaveBeenCalledExactlyOnceWith("saved-set-key");
  expect(actions.addItems).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("Both selected items were added to your bag.")).toBeTruthy();
  expect(lock).toHaveBeenLastCalledWith(false);
});

it.each(["confirmed", "rejected"] as const)("reacts to a matching background %s without re-sending the set", async status => {
  const lock = vi.fn(); actions.addItems.mockRejectedValueOnce(new CartUpdateUnconfirmedError("original-key"));
  const view = show(lock);
  await userEvent.setup().click(screen.getByRole("button", { name: "Add both items to bag" }));
  actions.resolution = { key: "other-key", input: { action: "addItems", items: [] }, status: "confirmed" };
  view.rerender(<CartMarketProvider market={{ id: "au", currency: "AUD" }}><BundleConfigurator product={sofa} selectedVariantId="sofa-default" companion={ottoman} onSelectionLockChange={lock} /></CartMarketProvider>);
  expect(screen.getByLabelText("Companion option")).toHaveProperty("disabled", true);
  actions.resolution = { ...actions.resolution, key: "original-key", status };
  actions.error = status === "rejected" ? "This set is no longer available" : null;
  view.rerender(<CartMarketProvider market={{ id: "au", currency: "AUD" }}><BundleConfigurator product={sofa} selectedVariantId="sofa-default" companion={ottoman} onSelectionLockChange={lock} /></CartMarketProvider>);
  expect(screen.getByLabelText("Companion option")).toHaveProperty("disabled", false);
  expect(screen.queryByRole("button", { name: "Retry set addition" })).toBeNull();
  expect(screen.queryByText("Both selected items were added to your bag.") !== null).toBe(status === "confirmed");
  if (status === "rejected") expect(screen.getByRole("alert").textContent).toContain("This set is no longer available");
  else expect(screen.queryByRole("alert")).toBeNull();
  expect(actions.addItems).toHaveBeenCalledTimes(1);
  expect(lock).toHaveBeenLastCalledWith(false);
  actions.resolution = { ...actions.resolution, key: "newer-operation", status: "confirmed" };
  view.rerender(<CartMarketProvider market={{ id: "au", currency: "AUD" }}><BundleConfigurator product={sofa} selectedVariantId="sofa-default" companion={ottoman} onSelectionLockChange={lock} /></CartMarketProvider>);
  expect(screen.getByLabelText("Companion option")).toHaveProperty("disabled", false);
  expect(screen.queryByRole("button", { name: "Retry set addition" })).toBeNull();
  expect(screen.queryByText("Both selected items were added to your bag.") !== null).toBe(status === "confirmed");
});

it("does not freeze a set when an error occurred before any request was saved", async () => {
  const lock = vi.fn(); actions.addItems.mockRejectedValueOnce(new TypeError("Bag could not be read")); show(lock);
  await userEvent.setup().click(screen.getByRole("button", { name: "Add both items to bag" }));
  expect(screen.getByRole("alert").textContent).toContain("Bag could not be read");
  expect(screen.getByLabelText("Companion option")).toHaveProperty("disabled", false);
  expect(screen.queryByRole("button", { name: "Retry set addition" })).toBeNull();
  expect(lock).toHaveBeenLastCalledWith(false);
});

it("never replaces the original saved key with an unrelated recovery failure", async () => {
  actions.addItems.mockRejectedValueOnce(new CartUpdateUnconfirmedError("original-key"));
  actions.retry.mockRejectedValueOnce(new CartUpdateUnconfirmedError("other-key"));
  show(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add both items to bag" }));
  await user.click(screen.getByRole("button", { name: "Retry set addition" }));
  await user.click(screen.getByRole("button", { name: "Retry set addition" }));
  expect(actions.retry.mock.calls).toEqual([["original-key"], ["original-key"]]);
  expect(actions.addItems).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Companion option")).toHaveProperty("disabled", true);
});
it("does not report a newly selected sofa option as already added after a successful set", async () => {
  const { rerender } = show(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add both items to bag" }));
  expect(await screen.findByText("Both selected items were added to your bag.")).toBeTruthy();
  const larger: ProductDetail = { ...sofa, variants: [...sofa.variants, { ...sofa.variants[0], id: "sofa-large", label: "Cream / Large", price: { amount: 150, currency: "AUD" } }] };
  rerender(<CartMarketProvider market={{ id: "au", currency: "AUD" }}><BundleConfigurator product={larger} selectedVariantId="sofa-large" companion={ottoman} /></CartMarketProvider>);
  expect(screen.getByText("Cream / Large")).toBeTruthy();
  expect(screen.queryByText("Both selected items were added to your bag.")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Add both items to bag" }));
  expect(actions.addItems).toHaveBeenLastCalledWith([{ productId: "sofa", variantId: "sofa-large", quantity: 1 }, { productId: "ottoman", variantId: "ottoman-cream", quantity: 1 }]);
  expect(await screen.findByText("Both selected items were added to your bag.")).toBeTruthy();
});
it("blocks unavailable choices and releases selection after a known rejection", async () => {
  const lock = vi.fn(); show(lock); const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Companion option"), "ottoman-out");
  expect((screen.getByRole("button", { name: "Add both items to bag" }) as HTMLButtonElement).disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText("Companion option"), "ottoman-green");
  actions.addItems.mockRejectedValueOnce(new StorefrontHttpError("Quantity limit", 400));
  await user.click(screen.getByRole("button", { name: "Add both items to bag" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect((screen.getByLabelText("Companion option") as HTMLSelectElement).disabled).toBe(false);
  expect(lock).toHaveBeenLastCalledWith(false);
});
