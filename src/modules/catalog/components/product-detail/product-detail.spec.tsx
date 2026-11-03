// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductDetail as ProductDetailData } from "@/core/contracts/commerce/catalog";
import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { ProductDetail } from "./product-detail";
import * as comparison from "../../lib/compare-store";
const actions = vi.hoisted(() => ({ addItem: vi.fn(), addItems: vi.fn(), pending: false, error: null as string | null }));
vi.mock("@/modules/cart/lib/cart-store", async (importOriginal) => ({ ...await importOriginal<typeof import("@/modules/cart/lib/cart-store")>(), useCartActions: () => actions }));
vi.mock("next/image", () => ({ default: ({ alt, src }: { alt: string; src: string }) => <span role="img" aria-label={alt || "Product image"} data-src={src} /> }));
const product: ProductDetailData = {
  id: "chair", slug: "chair", name: "Chair", category: "Armchairs", colour: "Moss", image: "/chair.jpg", price: { amount: 100, currency: "AUD" },
  description: "A comfortable chair.", materials: ["Fabric"], gallery: [{ src: "/chair.jpg", alt: "Chair" }], availability: "in-stock", colourOptions: [],
  variants: [
    { id: "moss", sku: "SANDBOX-MOSS", label: "Moss", price: { amount: 100, currency: "AUD" }, image: "/chair.jpg", availability: "in-stock", maxQuantity: 5 },
    { id: "test", sku: "SANDBOX-TEST", label: "Sandbox test option", price: { amount: 120, currency: "AUD" }, image: "/test.jpg", availability: "in-stock", maxQuantity: 3 },
    { id: "unavailable", sku: "SANDBOX-UNAVAILABLE", label: "Unavailable test", price: { amount: 100, currency: "AUD" }, image: "/chair.jpg", availability: "out-of-stock", maxQuantity: 5 },
  ],
};
function show(item = product, initialVariantId?: string | string[], companion?: ProductDetailData) { render(<CartMarketProvider market={{ id: "au", currency: "AUD" }}><ProductDetail product={item} initialVariantId={initialVariantId} bundleCompanion={companion} /></CartMarketProvider>); }
beforeEach(() => { localStorage.clear(); comparison.resetCompareStoreForTests(); vi.restoreAllMocks(); window.history.replaceState({}, "", "/au/products/chair"); actions.pending = false; actions.error = null; actions.addItem.mockReset().mockResolvedValue(undefined); actions.addItems.mockReset().mockResolvedValue(undefined); });
afterEach(cleanup);
describe("ProductDetail", () => {
  it("does not invent customer ratings, gallery controls or a dead wishlist", () => {
    show();
    expect(screen.getByRole("heading", { name: "Chair" })).toBeTruthy();
    expect(screen.queryByText(/out of 5 ·.*reviews/i)).toBeNull();
    expect(screen.getByText("No demo reviews are configured for this product.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Next product image/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /wishlist/ })).toBeNull();
  });

  it("compares the selected variant and freezes both purchase paths while a set addition is uncertain", async () => {
    actions.addItems.mockRejectedValueOnce(new TypeError("Connection lost"));
    show(product, "test", { ...product, id: "footrest", name: "Footrest" }); const user = userEvent.setup();
    const compare = vi.spyOn(comparison, "addCompareItem");
    await user.click(screen.getByRole("button", { name: "Add Chair to comparison" }));
    expect(compare).toHaveBeenCalledWith("au", { productId: "chair", variantId: "test" });
    expect(window.location.pathname).toBe("/au/products/chair");
    expect(screen.getByRole("button", { name: "Chair is in comparison" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Add both items to bag" }));
    expect(await screen.findByText("Connection lost")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Moss" }).matches(":disabled")).toBe(true);
    expect((screen.getByRole("button", { name: "Add selected option to bag" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Resolve set addition below" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Retry set addition" }));
    expect(screen.getByRole("radio", { name: "Moss" }).matches(":disabled")).toBe(false);
    expect(actions.addItem).not.toHaveBeenCalled();
  });
  it("selects a real variant and submits only server identifiers", async () => {
    show(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Sandbox test option" }));
    expect(screen.getAllByText("$120").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Chair — Sandbox test option" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add to bag" }));
    expect(actions.addItem).toHaveBeenCalledWith({ productId: "chair", variantId: "test", quantity: 1 });
    expect(await screen.findByText("Sandbox test option added to your bag.")).toBeTruthy();
  });
  it("disables unavailable and pending additions", async () => {
    show(); await userEvent.setup().click(screen.getByRole("radio", { name: "Unavailable test" }));
    expect(screen.getByRole("button", { name: "Unavailable for sandbox checkout" }).hasAttribute("disabled")).toBe(true);
    cleanup(); actions.pending = true; show();
    expect(screen.getByRole("button", { name: "Adding…" }).hasAttribute("disabled")).toBe(true);
  });
  it("preserves selection and reports a rejected request accessibly", async () => {
    actions.addItem.mockRejectedValue(new Error("Try again")); show(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Sandbox test option" }));
    await user.click(screen.getByRole("button", { name: "Add to bag" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Sandbox test option" }).getAttribute("aria-checked")).toBe("true");
  });
  it("ignores duplicate clicks while an add request is unresolved", async () => {
    let finish!: () => void;
    actions.addItem.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    show(); const user = userEvent.setup();
    await user.dblClick(screen.getByRole("button", { name: "Add to bag" }));
    await user.click(screen.getByRole("button", { name: "Add selected option to bag" }));
    expect(actions.addItem).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Add selected option to bag" }).hasAttribute("disabled")).toBe(true);
    finish();
    expect(await screen.findByText("Moss added to your bag.")).toBeTruthy();
  });

  it("restores an explicit variant and updates its URL without dropping unrelated query parameters", async () => {
    window.history.replaceState({}, "", "/au/products/chair?ref=home&variant=test");
    show(product, "test");
    expect(screen.getByRole("radio", { name: "Sandbox test option" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("img", { name: "Chair — Sandbox test option" }).getAttribute("data-src")).toBe("/test.jpg");
    await userEvent.setup().click(screen.getByRole("radio", { name: "Moss" }));
    expect(new URL(window.location.href).searchParams.get("variant")).toBe("moss");
    expect(new URL(window.location.href).searchParams.get("ref")).toBe("home");
  });

  it.each(["unknown", ["moss", "test"]])("blocks an invalid query until the shopper explicitly selects an option", async query => {
    show(product, query);
    expect(screen.getByRole("alert").textContent).toContain("Choose an available option");
    expect(screen.getByRole("button", { name: "Add selected option to bag" }).hasAttribute("disabled")).toBe(true);
    expect(actions.addItem).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("radio", { name: "Moss" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Add to bag" }));
    expect(actions.addItem).toHaveBeenCalledWith({ productId: "chair", variantId: "moss", quantity: 1 });
  });

  it("keeps dimensions, gallery, price and add identifiers aligned when changing colour and size", async () => {
    const configured: ProductDetailData = { ...product, variants: [
      ["cream-2", "Cream", "2 Sections", 190, 100], ["green-2", "Green", "2 Sections", 190, 100], ["green-3", "Green", "3 Sections", 267, 150],
    ].map(([id, colour, size, width, amount]) => ({ ...product.variants[0], id: String(id), label: `${colour} / ${size}`, image: `/${id}.jpg`,
      options: [{ name: "Colour", value: String(colour) }, { name: "Size", value: String(size) }], price: { amount: Number(amount), currency: "AUD" },
      dimensions: { width: Number(width), depth: 104, height: 93, unit: "cm" },
      gallery: [{ src: `/${id}.jpg`, alt: String(id) }, { src: `/${id}-room.jpg`, alt: `${id} room` }],
    })) };
    show(configured); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next product image" }));
    expect(screen.getByRole("img", { name: "cream-2 room" }).getAttribute("data-src")).toBe("/cream-2-room.jpg");
    await user.click(screen.getByRole("radio", { name: "Green" }));
    await user.click(screen.getByRole("radio", { name: "3 Sections" }));
    expect(screen.getByRole("radio", { name: "Cream" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText("$150").length).toBeGreaterThan(0);
    expect(screen.getByText("267 × 104 × 93 cm")).toBeTruthy();
    expect(screen.getByRole("img", { name: "green-3" }).getAttribute("data-src")).toBe("/green-3.jpg");
    await user.click(screen.getByRole("button", { name: "Add selected option to bag" }));
    expect(actions.addItem).toHaveBeenCalledWith({ productId: "chair", variantId: "green-3", quantity: 1 });
  });

});
