import "server-only";
import { NextRequest } from "next/server";
import { createConsumerIdentityStore } from "@/adapters/consumer/postgres/identity";
import { env } from "@/platform/config/env";
import { createStorefrontApi } from "@/platform/http/storefront-api";
import { getCommerce, getCommercePool, isCheckoutEnabled } from "@/platform/registry";
import { CONSUMER_SESSION_COOKIE, readConsumerSession } from "@/platform/security/consumer-session";

export const storefrontApi = createStorefrontApi({
  market: env.MARKET,
  origin: env.APP_ORIGIN ?? "",
  cookieSecret: env.CART_COOKIE_SECRET ?? "",
  secure: env.NODE_ENV === "production",
  checkoutEnabled: isCheckoutEnabled(),
  getCommerce,
  bindConsumerIdentity: async (cartId, request) => {
    if (!env.CONSUMER_SESSION_SECRET || !env.DATABASE_URL) return;
    const token = new NextRequest(request.url, { headers: request.headers }).cookies.get(
      CONSUMER_SESSION_COOKIE,
    )?.value;
    const session = readConsumerSession(token, env.CONSUMER_SESSION_SECRET);
    if (session) {
      await createConsumerIdentityStore(getCommercePool()).bind(session.githubId, session.login, cartId);
    }
  },
});
