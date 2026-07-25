import type { Money } from "@/core/contracts/commerce/catalog";
import { getDefaultLocale, isMarketId } from "@/platform/config/markets";

const formatters = new Map<string, Intl.NumberFormat>();

/** 底层：按 BCP-47 locale + currency 格式化（供单测与未来显式 locale 使用）。 */
export function formatPrice(money: Money, locale: string): string {
  const fractionDigits = Number.isInteger(money.amount) ? 0 : 2;
  const key = `${locale}:${money.currency}:${fractionDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(money.amount);
}

/** 业务默认入口：价格展示跟 market，不单独传 locale。 */
export function formatMarketPrice(money: Money, marketId: string): string {
  if (!isMarketId(marketId)) {
    throw new Error(`formatMarketPrice: unknown market "${marketId}"`);
  }
  return formatPrice(money, getDefaultLocale(marketId));
}
