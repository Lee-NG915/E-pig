import "server-only";

import { env } from "./env";
import { getMarket, type Market } from "./markets";

/**
 * 当前进程激活的市场。P0：来自启动期环境变量 MARKET（单市场无前缀路由）。
 * 多市场上线后改为 host → market 解析（resolveMarketFromHost + proxy.ts，
 * 见 docs/codex/research/07 §5-6），调用方不需要改。
 */
export function getActiveMarket(): Market {
  return getMarket(env.MARKET);
}
