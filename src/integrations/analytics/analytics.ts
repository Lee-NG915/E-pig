import { createLogger } from "@/platform/logging/logger";

/**
 * Analytics integration 契约（04 §5：可降级 fan-out 副作用，不是业务 port）。
 * 业务事件名保持内部语义（product_viewed、cart_item_added…），
 * 由具体 integration 映射到 GA/PostHog/Klaviyo 格式 —— UI 只发一次。
 */

export type AnalyticsEvent = {
  name: string;
  properties?: Record<string, unknown>;
};

export interface AnalyticsIntegration {
  track(event: AnalyticsEvent): void;
}

const logger = createLogger({ integration: "analytics" });

/**
 * 禁用时的 no-op 实现。规则（04 §9）：no-op 也必须留下结构化日志，
 * 否则"事件发了没"无法观测。
 */
export function createNoopAnalytics(): AnalyticsIntegration {
  return {
    track(event) {
      logger.debug("analytics.noop_track", { eventName: event.name });
    },
  };
}
