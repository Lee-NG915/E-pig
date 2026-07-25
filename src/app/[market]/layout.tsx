import type { ReactNode } from "react";

/**
 * 市场段布局占位。
 * URL 市场与进程 MARKET 的强制对齐由 `src/proxy.ts`（planMarketPath）负责，
 * 不在此再做 redirect，避免 Cache Components + Suspense 下的整树重拉。
 * 后续多语言可在此下增加可选 `[locale]` 段。
 */
export default function MarketLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
