import type { ProductDetail } from "@/core/contracts/commerce/catalog";
import { AppError } from "@/core/errors/errors";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import { loadComparison } from "../../lib/compare-data";
import { parseCompareSearchParams, type CompareItem } from "../../lib/compare-query";
import { addCompareItem, clearCompareSelection } from "../../lib/compare-store";

export const comparisonProduct: ProductDetail = {
  id: "alto", slug: "alto-sofa", name: "Alto Sofa", category: "Sofas", colour: "Green",
  image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=85",
  price: { amount: 2600, currency: "AUD" }, description: "Sample sofa", materials: ["Fabric", "Timber"], gallery: [], colourOptions: [], availability: "in-stock",
  variants: [
    { id: "green:wide", sku: "DEMO-GREEN", label: "Green / Wide", price: { amount: 2600, currency: "AUD" }, image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=85", availability: "in-stock", maxQuantity: 5, options: [{ name: "Colour", value: "Green" }], dimensions: { width: 210, depth: 90, height: 80, unit: "cm" } },
    { id: "cream / small", sku: "DEMO-CREAM", label: "Cream / Small", price: { amount: 2200, currency: "AUD" }, image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=85", availability: "out-of-stock", maxQuantity: 0 },
  ],
};

export const secondComparisonProduct: ProductDetail = {
  ...comparisonProduct, id: "bed", slug: "bed", name: "Harbour Bed", materials: [],
  variants: [{ ...comparisonProduct.variants[0], id: "bed-default", label: "Queen", dimensions: undefined, options: undefined }],
};

export const thirdComparisonProduct: ProductDetail = {
  ...comparisonProduct, id: "cove", slug: "cove", name: "Cove Sofa",
  variants: [{ ...comparisonProduct.variants[0], id: "cove-default", label: "Compact / Green", price: { amount: 1800, currency: "AUD" } }],
};

/** Story-only API boundary; other requests and real application code are untouched. */
export function installComparisonStoryData(items: CompareItem[], mode: "ready" | "loading" | "error" = "ready") {
  const originalFetch = window.fetch;
  const products = [comparisonProduct, secondComparisonProduct, thirdComparisonProduct];
  clearCompareSelection("au");
  getStorefrontQueryClient().clear();
  items.forEach(item => addCompareItem("au", item));
  const storyFetch: typeof window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (url.pathname !== "/api/au/compare") return originalFetch(input, init);
    if (mode === "loading") return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    if (mode === "error") return new Response(JSON.stringify({ error: { message: "Demo details service unavailable" } }), { status: 503 });
    const data = await loadComparison({ getProduct: async id => {
      const product = products.find(product => product.id === id);
      if (!product) throw new AppError("not_found", "Story product is unavailable");
      return product;
    } }, parseCompareSearchParams(Object.fromEntries(url.searchParams)));
    return new Response(JSON.stringify(data));
  };
  window.fetch = storyFetch;
  return () => {
    if (window.fetch === storyFetch) window.fetch = originalFetch;
    clearCompareSelection("au");
    getStorefrontQueryClient().clear();
  };
}
