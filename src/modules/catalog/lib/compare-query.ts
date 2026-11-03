import { withMarketPrefix } from "@/platform/config/market-path";

export const MAX_COMPARE_ITEMS = 3;
export type CompareItem = { productId: string; variantId?: string };
export type CompareQuery = { items: CompareItem[]; issues: string[] };

/** Named slots avoid Next's page-key collapse of repeated search-parameter names. */
export function parseCompareSearchParams(query: Record<string, string | string[] | undefined>): CompareQuery {
  const values: string[] = [];
  for (const key of ["item", "item2", "item3"]) {
    const value = query[key];
    if (typeof value === "string") values.push(value);
    // Read at most one extra reference to report overflow, including legacy repeated item links.
    else if (Array.isArray(value)) values.push(...value.slice(0, MAX_COMPARE_ITEMS + 1));
  }
  const result = parseCompareQuery(values);
  if (Object.keys(query).some((key) => /^item\d+$/.test(key) && key !== "item2" && key !== "item3")) {
    result.issues.push("Compare up to 3 options. Extra items were not loaded.");
  }
  return { ...result, issues: [...new Set(result.issues)] };
}

/** Search params have been decoded once by Next; each ID has its own escaping. */
export function parseCompareQuery(value?: string | string[]): CompareQuery {
  const values = value === undefined ? [] : typeof value === "string" ? [value] : value;
  const items: CompareItem[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  if (values.length > MAX_COMPARE_ITEMS) issues.push("Compare up to 3 options. Extra items were not loaded.");
  for (const raw of values.slice(0, MAX_COMPARE_ITEMS)) {
    try {
      if (raw.length > 1024) throw new Error("long reference");
      const parts = raw.split(":");
      if (parts.length > 2) throw new Error("invalid separator");
      const ids = parts.map(decodeURIComponent);
      if (ids.some((id) => !id || id.length > 160 || id.trim() !== id || [...id].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) {
        throw new Error("invalid identifier");
      }
      const item = { productId: ids[0], ...(ids[1] === undefined ? {} : { variantId: ids[1] }) };
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        issues.push("A repeated option was removed from the comparison.");
        continue;
      }
      seen.add(key);
      items.push(item);
    } catch {
      issues.push("An invalid comparison item was not loaded. Choose a product below.");
    }
  }
  return { items, issues: [...new Set(issues)] };
}

function buildCompareParams(items: CompareItem[]): string {
  const query = new URLSearchParams();
  for (const [index, item] of items.slice(0, MAX_COMPARE_ITEMS).entries()) {
    query.set(index === 0 ? "item" : `item${index + 1}`, `${encodeURIComponent(item.productId)}${item.variantId === undefined ? "" : `:${encodeURIComponent(item.variantId)}`}`);
  }
  return query.size ? `?${query.toString()}` : "";
}

export function buildCompareHref(marketId: string, items: CompareItem[]): string {
  return `${withMarketPrefix(marketId, "/compare")}${buildCompareParams(items)}`;
}

export function buildComparisonApiHref(marketId: string, items: CompareItem[]): string {
  return `/api/${encodeURIComponent(marketId)}/compare${buildCompareParams(items)}`;
}
