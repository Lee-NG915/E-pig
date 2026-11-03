import "server-only";

import { createMockCartAdapter } from "@/adapters/commerce/mock/cart";
import { createMockCatalogAdapter } from "@/adapters/commerce/mock/catalog";
import { createPostgresCommerce } from "@/adapters/commerce/postgres/commerce";
import { createCommercePool } from "@/adapters/commerce/postgres/pool";
import { createStripePaymentAdapter } from "@/adapters/payment/stripe/payment";
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
  market: Market;
};

export type Integrations = {
  analytics: AnalyticsIntegration;
};

const logger = createLogger({ module: "registry" });

let capabilitiesCache: Capabilities | null = null;
let integrationsCache: Integrations | null = null;

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
    : { createCart: unavailable, getCart: unavailable, addItem: unavailable, addItems: unavailable, updateItem: unavailable, removeItem: unavailable, applyCoupon: unavailable };

  capabilitiesCache = { catalog, cart, market };
  logger.info("capabilities.initialized", {
    market: market.id,
    currency: market.currency,
    commerceAdapter: env.COMMERCE_ADAPTER,
  });
  return capabilitiesCache;
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
  return commerceCache = createPostgresCommerce({ pool: createCommercePool(env.DATABASE_URL), catalog, market, payment: getPayment(), origin: env.APP_ORIGIN });
}

export function getIntegrations(): Integrations {
  if (integrationsCache) return integrationsCache;
  // 浏览器 SDK 类 integration 必须在 consent 后加载（platform/consent）；当前全部 no-op。
  integrationsCache = { analytics: createNoopAnalytics() };
  return integrationsCache;
}
