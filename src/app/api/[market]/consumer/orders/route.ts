import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createConsumerIdentityStore } from "@/adapters/consumer/postgres/identity";
import { env } from "@/platform/config/env";
import { CONSUMER_SESSION_COOKIE, readConsumerSession } from "@/platform/security/consumer-session";
import { getCommerce, getCommercePool } from "@/platform/registry";

/** Signed-in consumer reads only orders bound to their GitHub subject. */
export async function GET() {
  if (!env.CONSUMER_SESSION_SECRET || !env.DATABASE_URL) {
    return NextResponse.json({ error: "consumer sign-in is not configured" }, { status: 503 });
  }
  const store = await cookies();
  const session = readConsumerSession(
    store.get(CONSUMER_SESSION_COOKIE)?.value,
    env.CONSUMER_SESSION_SECRET,
  );
  if (!session) {
    return NextResponse.json({ error: "sign in with GitHub to view your orders" }, { status: 401 });
  }
  const cartIds = await createConsumerIdentityStore(getCommercePool()).listCartIds(session.githubId);
  const orders = await getCommerce().orders.listByCartIds(cartIds);
  return NextResponse.json({ orders });
}
