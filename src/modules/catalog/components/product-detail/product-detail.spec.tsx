// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductDetail as ProductDetailData } from "@/core/contracts/commerce/catalog";
import { CartMarketProvider } from "@/modules/cart/components/cart-market-context/cart-market-context";
import { ProductDetail } from "./product-detail";
const actions = vi.hoisted(() => ({ addItem: vi.fn(), pending: false, error: null as string | null }));
vi.mock("@/modules/cart/lib/cart-store", async (importOriginal) => ({ ...await importOriginal<typeof import("@/modules/cart/lib/cart-store")>(), useCartActions: () => actions }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Product image"} /> }));
const product: ProductDetailData = {
  id: "chair", slug: "chair", name: "Chair", category: "Armchairs", colour: "Moss", image: "/chair.jpg", price: { amount: 100, currency: "AUD" },
  description: "A comfortable chair.", materials: ["Fabric"], gallery: [{ src: "/chair.jpg", alt: "Chair" }], availability: "in-stock", colourOptions: [],
  variants: [
    { id: "moss", sku: "SANDBOX-MOSS", label: "Moss", price: { amount: 100, currency: "AUD" }, image: "/chair.jpg", availability: "in-stock", maxQuantity: 5 },
    { id: "test", sku: "SANDBOX-TEST", label: "Sandbox test option", price: { amount: 120, currency: "AUD" }, image: "/test.jpg", availability: "in-stock", maxQuantity: 3 },
    { id: "unavailable", sku: "SANDBOX-UNAVAILABLE", label: "Unavailable test", price: { amount: 100, currency: "AUD" }, image: "/chair.jpg", availability: "out-of-stock", maxQuantity: 5 },
  ],
};
function show(item = product) { render(<CartMarketProvider market={{ id: "au", currency: "AUD" }}><ProductDetail product={item} /></CartMarketProvider>); }
beforeEach(() => { actions.pending = false; actions.error = null; actions.addItem.mockReset().mockResolvedValue(undefined); });
afterEach(cleanup);
describe("ProductDetail", () => {
  it("hides absent reviews, fake gallery controls and dead wishlist", () => {
    show();
    expect(screen.getByRole("heading", { name: "Chair" })).toBeTruthy();
    expect(screen.queryByText(/reviews/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Next product image/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /wishlist/ })).toBeNull();
  });
  it("selects a real variant and submits only server identifiers", async () => {
    show(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Sandbox test option" }));
    expect(screen.getByText("$120")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Chair — Sandbox test option" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add to bag" }));
    expect(actions.addItem).toHaveBeenCalledWith({ productId: "chair", variantId: "test", quantity: 1 });
    expect(await screen.findByRole("status")).toBeTruthy();
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
    expect(actions.addItem).toHaveBeenCalledTimes(1);
    finish();
    expect(await screen.findByRole("status")).toBeTruthy();
  });

});
