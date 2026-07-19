import { markets, type Market, type MarketId } from "@/platform/config/markets";

export type HreflangAlternate = {
  marketId: MarketId;
  locale: string;
  host: string;
  /** Absolute URL using the market's first registered host. */
  href: string;
};

function primaryHost(market: Market): string {
  return market.hosts[0];
}

/**
 * Build hreflang candidates for every locale of every registered market.
 * Unknown hosts are never invented — only registry hosts are emitted.
 */
export function buildHreflangAlternates(path = "/"): HreflangAlternate[] {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const alternates: HreflangAlternate[] = [];
  for (const marketId of Object.keys(markets) as MarketId[]) {
    const market = markets[marketId];
    const host = primaryHost(market);
    for (const locale of market.locales) {
      alternates.push({
        marketId,
        locale,
        host,
        href: `https://${host}${normalizedPath}`,
      });
    }
  }
  return alternates;
}

export function buildCanonicalUrl(marketId: MarketId, path = "/"): string {
  const market = markets[marketId];
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${primaryHost(market)}${normalizedPath}`;
}
