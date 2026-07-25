/**
 * 客户端轻量埋点入口（modules 可用）。
 * 当前写入 debug 日志；接入真实 SDK 时由 app 层替换为 Integrations.analytics。
 * Vitest 下 console.debug 无害；不读 process.env（边界规则）。
 */
export function track(name: string, properties?: Record<string, unknown>): void {
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[track]", name, properties ?? {});
  }
}
