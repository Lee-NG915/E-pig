import { NextResponse, type NextRequest } from "next/server";

import { planMarketPath } from "@/platform/config/market-path";

/**
 * 网络边界：只做市场路径规范化（redirect），不建 cart、不取商品、不做认证。
 * 决策逻辑在 planMarketPath 纯函数中，便于单测。
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // API routes enforce market + cookie ownership themselves; webhooks must not redirect.
  if (pathname === "/api" || pathname.startsWith("/api/")) return NextResponse.next();
  // Deployment tooling imports this bundle before request env is available.
  // Public requests still require the validated runtime market; no build default.
  const { env } = await import("@/platform/config/env");
  const decision = planMarketPath(pathname, env.MARKET);

  if (decision.kind === "next") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;
  url.search = search;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: [
    /*
     * 跳过 Next 内部与静态资源；其余路径走市场前缀规范化。
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
