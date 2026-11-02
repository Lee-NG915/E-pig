import "server-only";
import { env } from "@/platform/config/env";
import { createStorefrontApi } from "@/platform/http/storefront-api";
import { getCommerce, isCheckoutEnabled } from "@/platform/registry";

export const storefrontApi = createStorefrontApi({
  market: env.MARKET,
  origin: env.APP_ORIGIN ?? "",
  cookieSecret: env.CART_COOKIE_SECRET ?? "",
  secure: env.NODE_ENV === "production",
  checkoutEnabled: isCheckoutEnabled(),
  getCommerce,
});
