import type { Money } from "@/core/contracts/commerce/catalog";

const formatters = new Map<string, Intl.NumberFormat>();

/** 按市场 locale + currency 格式化价格；formatter 实例复用，避免每次渲染新建。 */
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
