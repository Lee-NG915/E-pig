import type { CatalogPort, Collection, ListProductsQuery, ProductListItem, ProductVariantPreview } from "@/core/contracts/commerce/catalog";

import { withMarketPrefix } from "@/platform/config/market-path";

export type ProductListSort = NonNullable<ListProductsQuery["sort"]>;

const VALID_SORTS: readonly ProductListSort[] = ["price-asc", "price-desc", "name"];

export type ProductListFilters = Pick<ListProductsQuery, "colours" | "minPrice" | "maxPrice" | "inStockOnly">;
export type ProductListSearchParams = Record<string, string | string[] | undefined>;
export const MAX_FILTER_PRICE = 1_000_000;

/** Invalid parameters are returned as visible issues; the route must not run a partial query. */
export function parseProductListQuery(raw: ProductListSearchParams, availableColours?: string[]) {
  const issues: string[] = [];
  const filters: ProductListFilters = {};
  const scalar = (key: string, label: string) => {
    const value = raw[key];
    if (Array.isArray(value)) {
      issues.push(`Choose one ${label}.`);
      return undefined;
    }
    return value?.trim() || undefined;
  };
  const rawSort = scalar("sort", "sort order");
  const sort = parseProductListSort(rawSort);
  if (rawSort && !sort) issues.push("Choose a supported sort order.");

  const rawColours = raw.colour === undefined ? [] : Array.isArray(raw.colour) ? raw.colour : [raw.colour];
  if (rawColours.length > 20) issues.push("Choose no more than 20 colours.");
  const colours = new Map<string, string>();
  for (const value of rawColours.slice(0, 20)) {
    const colour = value.trim();
    if (!colour || colour.length > 80) {
      issues.push("Colour names must contain 1 to 80 characters.");
      continue;
    }
    const key = colour.toLowerCase();
    if (colours.has(key)) continue;
    const known = availableColours?.find(item => item.toLowerCase() === key);
    if (availableColours && !known) issues.push(`Colour “${colour}” is not available in this collection.`);
    colours.set(key, known ?? colour);
  }
  if (colours.size) filters.colours = [...colours.values()];

  for (const [key, label] of [["minPrice", "Minimum price"], ["maxPrice", "Maximum price"]] as const) {
    const value = scalar(key, label.toLowerCase());
    if (value === undefined) continue;
    const amount = Number(value);
    if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(amount) || amount > MAX_FILTER_PRICE) {
      issues.push(`${label} must be a number from 0 to 1,000,000.`);
    } else filters[key] = amount;
  }
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
    issues.push("Minimum price must not exceed maximum price.");
  }
  const stock = scalar("inStock", "availability value");
  if (stock === "true") filters.inStockOnly = true;
  else if (stock && stock !== "false") issues.push("Availability must be true or false.");
  return { filters, sort, issues: [...new Set(issues)], hasFilters: hasProductFilters(filters) };
}

export function hasProductFilters(filters: ProductListFilters): boolean {
  return Boolean(filters.colours?.length || filters.minPrice !== undefined || filters.maxPrice !== undefined || filters.inStockOnly);
}

export function buildProductListHref(marketId: string, handle: string, query: ProductListFilters & { sort?: ProductListSort } = {}): string {
  const params = new URLSearchParams();
  if (query.sort) params.set("sort", query.sort);
  for (const colour of query.colours ?? []) params.append("colour", colour);
  if (query.minPrice !== undefined) params.set("minPrice", String(query.minPrice));
  if (query.maxPrice !== undefined) params.set("maxPrice", String(query.maxPrice));
  if (query.inStockOnly) params.set("inStock", "true");
  const path = withMarketPrefix(marketId, `/collections/${handle}`);
  return params.size ? `${path}?${params.toString()}` : path;
}

/** Facets come from the unfiltered collection, including every available colour preview. */
export function collectProductColours(products: Array<Pick<ProductListItem, "colour"> & { variantPreviews?: Array<Pick<ProductVariantPreview, "colour">> }>): string[] {
  const colours = new Map<string, string>();
  for (const product of products) {
    for (const colour of [product.colour, ...(product.variantPreviews?.map(preview => preview.colour) ?? [])]) {
      const value = colour.trim();
      if (value && !colours.has(value.toLowerCase())) colours.set(value.toLowerCase(), value);
    }
  }
  return [...colours.values()].sort((a, b) => a.localeCompare(b));
}

/** Request-time collection query. Invalid input never falls back to a broader partial query. */
export async function loadCollectionListing(catalog: Pick<CatalogPort, "listCollections" | "listProducts">, handle: string, raw: ProductListSearchParams) {
  const collections = await catalog.listCollections();
  const collection = findCollectionByHandle(collections, handle);
  if (!collection) return null;
  const unfiltered = await catalog.listProducts({ collection: handle });
  const availableColours = collectProductColours(unfiltered);
  const parsed = parseProductListQuery(raw, availableColours);
  const products = parsed.issues.length ? [] : parsed.hasFilters || parsed.sort
    ? await catalog.listProducts({ collection: handle, ...parsed.filters, sort: parsed.sort })
    : unfiltered;
  return { collections, collection, availableColours, products, ...parsed };
}

/** 从 searchParams.sort 解析合法排序；非法 / 缺省 → undefined。 */
export function parseProductListSort(
  raw: string | string[] | undefined,
): ProductListSort | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  return VALID_SORTS.includes(value as ProductListSort)
    ? (value as ProductListSort)
    : undefined;
}

export function findCollectionByHandle(
  collections: Collection[],
  handle: string,
): Collection | undefined {
  return collections.find((collection) => collection.handle === handle);
}

/** Home 入口：取第一个可浏览集合；无集合时返回 null。 */
export function pickHomeCollectionLink(
  collections: Collection[],
  marketId: string,
): { href: string; title: string } | null {
  const first = collections[0];
  if (!first) return null;
  return {
    href: withMarketPrefix(marketId, `/collections/${first.handle}`),
    title: first.title,
  };
}
