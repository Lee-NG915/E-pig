import type { Money } from "@/core/contracts/commerce/catalog";

import { formatPrice } from "@/shared/lib/money";

import { getDefaultLocale, isMarketId } from "./markets";

/** 业务默认入口：价格展示跟 market，不单独传 locale。 */
export function formatMarketPrice(money: Money, marketId: string): string {
  if (!isMarketId(marketId)) {
    throw new Error(`formatMarketPrice: unknown market "${marketId}"`);
  }
  return formatPrice(money, getDefaultLocale(marketId));
}
