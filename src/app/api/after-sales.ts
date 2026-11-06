import "server-only";

import { env } from "@/platform/config/env";
import { createConsumerAfterSalesApi } from "@/platform/http/consumer-after-sales-api";
import { createServiceAfterSalesApi } from "@/platform/http/service-after-sales-api";
import { getAfterSales } from "@/platform/registry";

/** App composition root: the five consumer routes share these env and port bindings. */
export function createAppConsumerAfterSalesApi() {
  return createConsumerAfterSalesApi({
    market: env.MARKET,
    origin: env.APP_ORIGIN ?? "",
    cookieSecret: env.CART_COOKIE_SECRET ?? "",
    getAfterSales,
  });
}

/** Separate composition root: service routes never reuse consumer identity or DTOs. */
export function createAppServiceAfterSalesApi() {
  return createServiceAfterSalesApi({
    market: env.MARKET,
    serviceToken: env.AFTER_SALES_SERVICE_TOKEN,
    serviceMarkets: env.AFTER_SALES_SERVICE_MARKETS,
    getAfterSales,
  });
}
