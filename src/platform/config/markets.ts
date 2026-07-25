/**
 * 唯一 typed market registry（docs/codex/research/04 §8）。
 * 非秘密市场配置全部在这里维护；env 只负责"选择哪个市场"（MARKET）。
 *
 * 这里只登记 E-pig 当前业务需要的市场（au / sg / us）。
 * 新增市场 = 在这里加一条记录 + 在 host 部署侧映射域名，业务代码零改动；
 * 不要为了"看起来完整"预先登记没有业务计划的市场。
 */
export const markets = {
  au: {
    id: "au",
    name: "Australia",
    currency: "AUD",
    locales: ["en-AU"],
    defaultLocale: "en-AU",
    hosts: ["au.e-pig.local", "au.localhost"],
  },
  sg: {
    id: "sg",
    name: "Singapore",
    currency: "SGD",
    locales: ["en-SG"],
    defaultLocale: "en-SG",
    hosts: ["sg.e-pig.local"],
  },
  us: {
    id: "us",
    name: "United States",
    currency: "USD",
    locales: ["en-US"],
    defaultLocale: "en-US",
    hosts: ["us.e-pig.local"],
  },
} as const;

export type MarketId = keyof typeof markets;
export type Market = (typeof markets)[MarketId];

/** z.enum 需要的非空元组形态 */
export const marketIds = Object.keys(markets) as [MarketId, ...MarketId[]];

export const defaultMarketId: MarketId = "au";

export function isMarketId(value: string): value is MarketId {
  return Object.prototype.hasOwnProperty.call(markets, value);
}

export function getMarket(id: MarketId): Market {
  return markets[id];
}

/**
 * host → market 纯函数（docs/codex/research/07 §6：未知 host 返回 null，不猜测）。
 * 只匹配 registry 中显式登记的完整 host；不得根据首段子域名猜测市场。
 * 生产 host→market 时由 proxy 调用；本地开发以 path 前缀 + 进程 MARKET 为准。
 */
export function resolveMarketFromHost(host: string | null | undefined): Market | null {
  if (!host) return null;
  const normalized = host.split(":")[0].toLowerCase();
  for (const market of Object.values(markets)) {
    if ((market.hosts as readonly string[]).includes(normalized)) return market;
  }
  return null;
}

/** locale 必须属于该 market；`/us/zh-CN` 这类组合不能进入数据层（04 §8）。 */
export function isLocaleSupported(market: Market, locale: string): boolean {
  return (market.locales as readonly string[]).includes(locale);
}

/**
 * 当前阶段一市场一默认语言：业务代码只传 marketId，locale 从 registry 推导。
 * 同一市场多语言时再引入 URL locale 段；不要把 locale 当第二套“市场切换”字段到处传递。
 */
export function getDefaultLocale(marketId: MarketId): string {
  return markets[marketId].defaultLocale;
}
