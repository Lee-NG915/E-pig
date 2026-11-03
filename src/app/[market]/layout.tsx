import { Suspense, type ReactNode } from "react";
import { isMarketId } from "@/platform/config/markets";
import { ComparisonDock } from "@/modules/catalog/components/comparison-dock/comparison-dock";

async function ComparisonMount({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  return isMarketId(market) ? <ComparisonDock marketId={market} /> : null;
}

/**
 * 市场段布局：浏览时保留商品比较清单，动态市场边界独立挂载。
 * URL 市场与进程 MARKET 的强制对齐由 `src/proxy.ts`（planMarketPath）负责，
 * 不在此再做 redirect，避免 Cache Components + Suspense 下的整树重拉。
 * 后续多语言可在此下增加可选 `[locale]` 段。
 */
export default function MarketLayout({ children, params }: Readonly<{ children: ReactNode; params: Promise<{ market: string }> }>) {
  return <>{children}<Suspense fallback={null}><ComparisonMount params={params} /></Suspense></>;
}
