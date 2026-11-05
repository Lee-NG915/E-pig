import "server-only";

import { createMockAfterSalesAdapter } from "@/adapters/after-sales/mock/after-sales";
import { createPostgresAfterSalesAdapter } from "@/adapters/after-sales/postgres/after-sales";
import { createUnavailableAfterSalesAdapter } from "@/adapters/after-sales/unavailable";
import { createMockCartAdapter } from "@/adapters/commerce/mock/cart";
import { createMockCatalogAdapter } from "@/adapters/commerce/mock/catalog";
import { createPostgresCommerce } from "@/adapters/commerce/postgres/commerce";
import { createCommercePool, type CommercePool } from "@/adapters/commerce/postgres/pool";
import { createStripePaymentAdapter } from "@/adapters/payment/stripe/payment";
import type { AfterSalesPort } from "@/core/contracts/after-sales";
import type { PaymentPort } from "@/core/contracts/capabilities/payment";
import type { CatalogPort } from "@/core/contracts/commerce/catalog";
import type { CartPort } from "@/core/contracts/commerce/cart";
import { createNoopAnalytics, type AnalyticsIntegration } from "@/integrations/analytics/analytics";
import { AppError } from "@/core/errors/errors";

import { env } from "./config/env";
import { getMarket, type Market } from "./config/markets";
import { createLogger } from "./logging/logger";

/**
 * 静态 typed registry（04 §9）：业务能力（adapter）与可降级副作用（integration）
 * 分开组合。module 不 import 这里 —— 只有 app 层（route/layout/action）可以，
 * 然后把 port DTO 通过 props 传给 module 组件。
 */

export type Capabilities = {
  catalog: CatalogPort;
  cart: CartPort;
  afterSales: AfterSalesPort;
  market: Market;
};

export type Integrations = {
  analytics: AnalyticsIntegration;
};

const logger = createLogger({ module: "registry" });

let capabilitiesCache: Capabilities | null = null;
let integrationsCache: Integrations | null = null;
let afterSalesCache: AfterSalesPort | null = null;
let commercePoolCache: CommercePool | null = null;

export function getCapabilities(): Capabilities {
  if (capabilitiesCache) return capabilitiesCache;

  const market = getMarket(env.MARKET);

  if (env.COMMERCE_ADAPTER !== "mock" && env.COMMERCE_ADAPTER !== "postgres") {
    // 注册新 adapter 时在此扩展分支；未知值在 env schema 已被拦截。
    throw new AppError("validation", `Unsupported COMMERCE_ADAPTER: ${env.COMMERCE_ADAPTER}`);
  }

  if (env.NODE_ENV === "production" && env.COMMERCE_ADAPTER === "mock") {
    // Phase 1 demo 镜像允许 mock，但 production 运行时必须留下显式告警。
    logger.warn("capabilities.mock_in_production", {
      hint: "正在生产环境使用 mock commerce adapter；不可承载真实交易",
    });
  }

  const catalog = createMockCatalogAdapter({ market });
  // Public catalog rendering never needs a database connection. Transaction routes use getCommerce().
  const cart = env.COMMERCE_ADAPTER === "mock"
    ? createMockCartAdapter({ catalog, market, logger: createLogger({ module: "cart" }) })
    : { createCart: unavailable, getCart: unavailable, findCartByCreationKey: unavailable, hasMutation: unavailable, addItem: unavailable, addItems: unavailable, updateItem: unavailable, removeItem: unavailable, applyCoupon: unavailable };

  // afterSales is resolved lazily: importing the registry or rendering public
  // catalog pages must not require a database or after-sales configuration.
  capabilitiesCache = {
    catalog,
    cart,
    market,
    get afterSales() {
      return getAfterSales();
    },
  };
  logger.info("capabilities.initialized", {
    market: market.id,
    currency: market.currency,
    commerceAdapter: env.COMMERCE_ADAPTER,
    afterSalesAdapter: env.AFTER_SALES_ADAPTER ?? "mock",
    databaseDriver: env.DATABASE_DRIVER ?? "neon",
  });
  return capabilitiesCache;
}

/**
 * Lazy, process-wide after-sales capability. `postgres` is never silently
 * downgraded: missing prerequisites produce an explicit 503 adapter.
 */
export function getAfterSales(): AfterSalesPort {
  if (afterSalesCache) return afterSalesCache;

  if (env.AFTER_SALES_ADAPTER === "postgres") {
    if (env.COMMERCE_ADAPTER !== "postgres" || !env.DATABASE_URL) {
      const reason = env.COMMERCE_ADAPTER !== "postgres"
        ? "commerce_adapter_mismatch"
        : "database_url_missing";
      logger.error("capabilities.after_sales_unavailable", { reason });
      return afterSalesCache = createUnavailableAfterSalesAdapter();
    }
    return afterSalesCache = createPostgresAfterSalesAdapter({
      pool: getCommercePool(),
      market: getMarket(env.MARKET),
    });
  }

  if (env.AFTER_SALES_ADAPTER !== "mock") {
    throw new AppError("validation", `Unsupported AFTER_SALES_ADAPTER: ${String(env.AFTER_SALES_ADAPTER)}`);
  }

  if (env.NODE_ENV === "production") {
    logger.warn("capabilities.after_sales_mock_in_production", {
      hint: "正在生产环境使用 mock after-sales adapter；仅用于沙箱演示，不提供真实售后能力",
    });
  }
  return afterSalesCache = createMockAfterSalesAdapter({
    catalog: getCapabilities().catalog,
    market: getMarket(env.MARKET),
    logger: createLogger({ module: "after-sales" }),
  });
}

/** Shared process-wide pool for commerce and after-sales; created only on use. */
export function getCommercePool(): CommercePool {
  if (commercePoolCache) return commercePoolCache;
  if (!env.DATABASE_URL) {
    throw new AppError("upstream", "Commerce database is not configured");
  }
  return commercePoolCache = createCommercePool(
    env.DATABASE_URL,
    env.DATABASE_DRIVER ?? "neon",
  );
}

function unavailable(): never {
  throw new AppError("upstream", "Sandbox service is not configured", { publicMessage: "Sandbox checkout is not available yet. Please try again later." });
}
let commerceCache: ReturnType<typeof createPostgresCommerce> | undefined;
let paymentCache: PaymentPort | undefined;
export function isCheckoutEnabled(): boolean {
  return env.MARKET === "au" && env.COMMERCE_ADAPTER === "postgres"
    && Boolean(env.DATABASE_URL && env.CART_COOKIE_SECRET && env.APP_ORIGIN && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}
export function getPayment(): PaymentPort {
  if (paymentCache) return paymentCache;
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return { createSession: unavailable, retrieveSession: unavailable, expireSession: unavailable, parseWebhook: unavailable };
  return paymentCache = createStripePaymentAdapter({ secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET });
}
export function getCommerce() {
  if (commerceCache) return commerceCache;
  if (env.COMMERCE_ADAPTER !== "postgres" || !env.DATABASE_URL || !env.CART_COOKIE_SECRET || !env.APP_ORIGIN) return unavailable();
  const { catalog, market } = getCapabilities();
  return commerceCache = createPostgresCommerce({ pool: getCommercePool(), catalog, market, payment: getPayment(), origin: env.APP_ORIGIN });
}

export function getIntegrations(): Integrations {
  if (integrationsCache) return integrationsCache;
  // 浏览器 SDK 类 integration 必须在 consent 后加载（platform/consent）；当前全部 no-op。
  integrationsCache = { analytics: createNoopAnalytics() };
  return integrationsCache;
}
