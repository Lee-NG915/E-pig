import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createConsumerIdentityStore } from "@/adapters/consumer/postgres/identity";
import { afterSalesServiceConfigSchema } from "@/platform/config/after-sales-service-config";
import { env } from "@/platform/config/env";
import { getCommerce, getCommercePool } from "@/platform/registry";

function tokenMatches(candidate: string, expected: string): boolean {
  const left = createHash("sha256").update(candidate).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

/** DTC service-to-service: list orders owned by one GitHub subject, never by client-supplied cart ids. */
export async function GET(
  request: Request,
  context: { params: Promise<{ market: string }> },
) {
  const { market } = await context.params;
  if (market !== env.MARKET) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (request.headers.get("X-After-Sales-Contract-Version") !== "1") {
    return NextResponse.json({ error: "unsupported_contract_version" }, { status: 400 });
  }
  const config = afterSalesServiceConfigSchema.safeParse({
    token: env.AFTER_SALES_SERVICE_TOKEN,
    markets: env.AFTER_SALES_SERVICE_MARKETS,
  });
  if (!config.success) {
    return NextResponse.json({ error: "service is not configured" }, { status: 503 });
  }
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match || !tokenMatches(match[1], config.data.token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!config.data.markets.includes(market)) {
    return NextResponse.json({ error: "forbidden_market" }, { status: 403 });
  }

  const githubId = new URL(request.url).searchParams.get("github_id") ?? "";
  if (!/^\d{1,32}$/.test(githubId) || !env.DATABASE_URL) {
    return NextResponse.json({ error: "invalid github_id" }, { status: 400 });
  }
  const cartIds = await createConsumerIdentityStore(getCommercePool()).listCartIds(githubId);
  const orders = await getCommerce().orders.listByCartIds(cartIds);
  return NextResponse.json({ orders });
}
