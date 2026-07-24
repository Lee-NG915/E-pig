/**
 * Consent port（03 §5 / 05：P0 只提供 consent port，公开生产前必须接 CMP）。
 * P0 不加载任何浏览器 SDK；这里的默认值是开发默认值，不是合规方案。
 */

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export type ConsentState = Record<ConsentCategory, boolean>;

/** 开发默认：只有必要类；analytics/marketing 显式开启前一律视为未授权。 */
export const defaultConsentState: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
};

/** 浏览器 SDK 必须在 consent 后加载 —— integration 初始化前的统一检查点。 */
export function isConsentGranted(state: ConsentState, category: ConsentCategory): boolean {
  return state[category] === true;
}
