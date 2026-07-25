import { isMarketId, type MarketId } from "./markets";

/**
 * 公开 URL 市场前缀（MUJI 式 path segment）。
 *
 * 本地 / 单进程：`/{MARKET}/collections/...`；proxy 把 `/`、裸资源路径、
 * 以及其他市场前缀 308 到本进程 `MARKET`。
 * 生产后续仍可用 host→market（Koala）；path 前缀便于本地与后续多语言
 * （`/{market}/{locale}/...`）演进，locale 段尚未启用。
 */

/** 已知商务/站点资源首段（无市场前缀时需要补上）。 */
export const MARKETLESS_APP_SEGMENTS = [
  "collections",
  "products",
  "cart",
  "checkout",
  "account",
  "search",
] as const;

export type MarketPathDecision =
  | { kind: "next" }
  | { kind: "redirect"; pathname: string };

function splitPath(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function joinPath(segments: string[]): string {
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/** 给站内相对路径加上当前市场前缀（已带正确前缀则原样返回）。 */
export function withMarketPrefix(marketId: string, path: string): string {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  if (pathname === "/") return `/${marketId}`;

  const segments = splitPath(pathname);
  const head = segments[0];
  if (head && isMarketId(head)) {
    if (head === marketId) return pathname;
    return joinPath([marketId, ...segments.slice(1)]);
  }
  return joinPath([marketId, ...segments]);
}

/**
 * proxy / 布局共用的路径规范化决策（纯函数，无 I/O）。
 * - `/` → `/{active}`
 * - `/{otherMarket}/...` → `/{active}/...`（保留余下路径）
 * - `/collections/...` 等裸资源 → `/{active}/collections/...`
 * - 已是 `/{active}/...` → next
 * - 未知首段且非市场 id → 仍前缀到 active（避免本地误进无市场壳）
 */
export function planMarketPath(
  pathname: string,
  activeMarketId: MarketId,
): MarketPathDecision {
  const normalized = pathname === "" ? "/" : pathname;
  if (normalized === "/") {
    return { kind: "redirect", pathname: `/${activeMarketId}` };
  }

  const segments = splitPath(normalized);
  const head = segments[0];
  if (!head) {
    return { kind: "redirect", pathname: `/${activeMarketId}` };
  }

  if (isMarketId(head)) {
    if (head === activeMarketId) return { kind: "next" };
    return {
      kind: "redirect",
      pathname: joinPath([activeMarketId, ...segments.slice(1)]),
    };
  }

  // 裸路径（含已知资源与未知首段）一律挂到本进程市场。
  return {
    kind: "redirect",
    pathname: joinPath([activeMarketId, ...segments]),
  };
}

/** 从 URL 首段解析 market id；非登记市场返回 null。 */
export function parseMarketPrefix(pathname: string): MarketId | null {
  const head = splitPath(pathname)[0];
  return head && isMarketId(head) ? head : null;
}
