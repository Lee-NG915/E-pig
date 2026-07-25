import type { Collection } from "@/core/contracts/commerce/catalog";

import { withMarketPrefix } from "@/platform/config/market-path";

import { mainNav } from "./main-nav";

export type RelatedCollectionLink = {
  title: string;
  href: string;
};

/**
 * 取同级导航相关集合（最多 4）：优先当前一级菜单下的子链，否则取其它一级分类。
 */
export function pickRelatedCollections(
  collections: Collection[],
  currentHandle: string,
  marketId: string,
): RelatedCollectionLink[] {
  const byHandle = new Map(collections.map((c) => [c.handle, c]));
  const primary = mainNav.find((item) => item.href === `/collections/${currentHandle}`);

  const candidateHandles: string[] = [];
  if (primary) {
    for (const group of primary.groups) {
      for (const child of group.children) {
        const handle = child.href.replace(/^\/collections\//, "");
        if (handle && handle !== currentHandle) candidateHandles.push(handle);
      }
    }
  }
  for (const item of mainNav) {
    const handle = item.href.replace(/^\/collections\//, "");
    if (handle && handle !== currentHandle) candidateHandles.push(handle);
  }

  const seen = new Set<string>();
  const links: RelatedCollectionLink[] = [];
  for (const handle of candidateHandles) {
    if (seen.has(handle)) continue;
    seen.add(handle);
    const collection = byHandle.get(handle);
    if (!collection) continue;
    links.push({
      title: collection.title,
      href: withMarketPrefix(marketId, `/collections/${handle}`),
    });
    if (links.length >= 4) break;
  }
  return links;
}
