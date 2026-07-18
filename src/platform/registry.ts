import "server-only";

import { createMockCartAdapter } from "@/adapters/commerce/mock/cart";
import { createMockCatalogAdapter } from "@/adapters/commerce/mock/catalog";
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

  if (env.COMMERCE_ADAPTER !== "mock") {
    // 注册新 adapter 时在此扩展分支；未知值在 env schema 已被拦截。
    throw new AppError("validation", `Unsupported COMMERCE_ADAPTER: ${env.COMMERCE_ADAPTER}`);
  }

  if (process.env.NODE_ENV === "production" && !process.env.COMMERCE_ADAPTER) {
    // 04 §9：production 必需能力缺失时启动失败。mock 允许跑 demo 镜像，但必须显式告警。
    logger.warn("capabilities.mock_in_production", {
      hint: "COMMERCE_ADAPTER 未显式设置，正在生产环境使用 mock commerce adapter",
    });
  }

  const catalog = createMockCatalogAdapter({ market });
  const cart = createMockCartAdapter({ catalog, market, logger: createLogger({ module: "cart" }) });

  capabilitiesCache = { catalog, cart, market };
  logger.info("capabilities.initialized", {
    market: market.id,
    currency: market.currency,
    commerceAdapter: env.COMMERCE_ADAPTER,
  });
  return capabilitiesCache;
}

export function getIntegrations(): Integrations {
  if (integrationsCache) return integrationsCache;
  // 浏览器 SDK 类 integration 必须在 consent 后加载（platform/consent）；当前全部 no-op。
  integrationsCache = { analytics: createNoopAnalytics() };
  return integrationsCache;
}
