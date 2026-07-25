import type { Collection, ListProductsQuery } from "@/core/contracts/commerce/catalog";

import { withMarketPrefix } from "@/platform/config/market-path";

export type ProductListSort = NonNullable<ListProductsQuery["sort"]>;

const VALID_SORTS: readonly ProductListSort[] = ["price-asc", "price-desc", "name"];

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
