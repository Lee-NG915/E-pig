import { describe, expect, it } from "vitest";
import type { ProductVariant } from "@/core/contracts/commerce/catalog";
import { getVariantOptionGroups, resolveInitialVariant, resolveVariantOption } from "./variant-selection";

const variants: ProductVariant[] = [
  ["cream-2", "Cream", "2"], ["green-2", "Green", "2"], ["green-3", "Green", "3"],
].map(([id, colour, size]) => ({ id, label: id, sku: id, price: { amount: 100, currency: "AUD" }, image: `/${id}.jpg`, availability: "in-stock", maxQuantity: 5,
  options: [{ name: "Colour", value: colour }, { name: "Size", value: size }],
}));

describe("variant selection", () => {
  it("defaults only when a variant query is absent, and resolves exact local identifiers", () => {
    expect(resolveInitialVariant(variants).variant?.id).toBe("cream-2");
    expect(resolveInitialVariant(variants, "green-3")).toEqual({ variant: variants[2], invalid: false });
  });
  it.each(["", "unknown", "other-product-default", ["cream-2", "green-3"], ["cream-2"]])("rejects an invalid or duplicate query %j without silently using the default", query => {
    expect(resolveInitialVariant(variants, query)).toEqual({ variant: undefined, invalid: true });
  });
  it("preserves other dimensions and does not substitute a different size for missing combinations", () => {
    expect(resolveVariantOption(variants, variants[0], "Colour", "Green")?.id).toBe("green-2");
    expect(resolveVariantOption(variants, variants[2], "Colour", "Cream")).toBeUndefined();
    expect(resolveVariantOption(variants, undefined, "Colour", "Green")?.id).toBe("green-2");
    expect(getVariantOptionGroups(variants)).toEqual([{ name: "Colour", values: ["Cream", "Green"] }, { name: "Size", values: ["2", "3"] }]);
  });
});
