import type { CatalogPort, ProductDetail, ProductVariant } from "@/core/contracts/commerce/catalog";
import { isAppError } from "@/core/errors/errors";
import type { CompareItem, CompareQuery } from "./compare-query";
import { MAX_COMPARE_ITEMS } from "./compare-query";

export type ComparisonEntry = {
  item: CompareItem;
  product?: ProductDetail;
  variant?: ProductVariant;
  usedDefault: boolean;
  error?: string;
};
export type ComparisonData = { entries: ComparisonEntry[]; issues: string[] };

/** Request-time only: prices and availability come directly from the current market's port. */
export async function loadComparison(catalog: Pick<CatalogPort, "getProduct">, query: CompareQuery): Promise<ComparisonData> {
  const entries = await Promise.all(query.items.slice(0, MAX_COMPARE_ITEMS).map(async (item): Promise<ComparisonEntry> => {
    let product: ProductDetail;
    try {
      product = await catalog.getProduct(item.productId);
    } catch (error) {
      if (!isAppError(error) || error.kind !== "not_found") throw error;
      return { item, usedDefault: false, error: "This product is unavailable in the catalog. Choose another product." };
    }
    const usedDefault = item.variantId === undefined;
    const variant = usedDefault ? product.variants[0] : product.variants.find((option) => option.id === item.variantId);
    if (!variant) return { item, product, usedDefault: false, error: "This option is unavailable in the catalog. Select another option." };
    return { item: { productId: product.id, variantId: variant.id }, product, variant, usedDefault };
  }));
  const seen = new Set<string>();
  const issues = [...query.issues];
  return {
    entries: entries.filter((entry) => {
      if (!entry.variant) return true;
      const key = JSON.stringify(entry.item);
      if (seen.has(key)) {
        issues.push("A repeated option was removed from the comparison.");
        return false;
      }
      seen.add(key);
      return true;
    }),
    issues,
  };
}
