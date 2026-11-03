import { expect, it, vi } from "vitest";
import type { ProductDetail } from "@/core/contracts/commerce/catalog";
import { AppError } from "@/core/errors/errors";
import { loadComparison } from "./compare-data";

const product: ProductDetail = {
  id: "sofa", slug: "sofa-slug", name: "Sofa", category: "Sofas", colour: "Green", image: "/sofa.jpg",
  price: { amount: 100, currency: "SGD" }, description: "Sofa", materials: [], gallery: [], colourOptions: [], availability: "in-stock",
  variants: [{ id: "green", label: "Green", sku: "TEST", image: "/green.jpg", price: { amount: 120, currency: "SGD" }, availability: "out-of-stock", maxQuantity: 0 }],
};

it("distinguishes an omitted default from an unknown explicit variant and preserves market data", async () => {
  const catalog = { getProduct: vi.fn().mockResolvedValue(product) };
  const result = await loadComparison(catalog, { items: [{ productId: "sofa" }, { productId: "sofa", variantId: "missing" }], issues: [] });
  expect(result.entries[0]).toMatchObject({ usedDefault: true, item: { productId: "sofa", variantId: "green" }, variant: { price: { amount: 120, currency: "SGD" }, availability: "out-of-stock" } });
  expect(result.entries[1].variant).toBeUndefined();
  expect(result.entries[1].error).toMatch(/option.*unavailable/i);
});

it("deduplicates aliases/defaults after resolving their exact catalog identities", async () => {
  const result = await loadComparison({ getProduct: vi.fn().mockResolvedValue(product) }, { items: [{ productId: "sofa" }, { productId: "sofa-slug", variantId: "green" }], issues: [] });
  expect(result.entries).toHaveLength(1);
  expect(result.issues).toContain("A repeated option was removed from the comparison.");
});

it("keeps an unknown product repairable without swallowing upstream failures", async () => {
  const catalog = { getProduct: vi.fn().mockRejectedValue(new AppError("not_found", "private source detail")) };
  const query = { items: [{ productId: "missing", variantId: "missing" }], issues: [] };
  const result = await loadComparison(catalog, query);
  expect(result.entries[0].error).toBe("This product is unavailable in the catalog. Choose another product.");
  catalog.getProduct.mockRejectedValue(new AppError("upstream", "private source detail"));
  await expect(loadComparison(catalog, query)).rejects.toMatchObject({ kind: "upstream" });
});
