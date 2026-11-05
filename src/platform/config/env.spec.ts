import { describe, expect, it } from "vitest";

import {
  afterSalesServiceConfigSchema,
  afterSalesServiceMarketsSchema,
  serverEnvSchema,
} from "./env";

describe("env schema", () => {
  it("测试环境 MARKET 缺省时回退到 au", () => {
    expect(serverEnvSchema.MARKET.parse(undefined)).toBe("au");
  });

  it("MARKET 接受 registry 中的市场", () => {
    expect(serverEnvSchema.MARKET.parse("sg")).toBe("sg");
    expect(serverEnvSchema.MARKET.parse("us")).toBe("us");
  });

  it("MARKET 拒绝未知市场（启动失败而非静默猜测）", () => {
    expect(() => serverEnvSchema.MARKET.parse("xx")).toThrow();
  });

  it("COMMERCE_ADAPTER 缺省为 mock", () => {
    expect(serverEnvSchema.COMMERCE_ADAPTER.parse(undefined)).toBe("mock");
  });

  it("COMMERCE_ADAPTER 拒绝未注册的 adapter", () => {
    expect(() => serverEnvSchema.COMMERCE_ADAPTER.parse("shopify")).toThrow();
  });

  it("accepts persistent commerce and rejects live payment keys and unsafe origins", () => {
    expect(serverEnvSchema.COMMERCE_ADAPTER.parse("postgres")).toBe("postgres");
    expect(serverEnvSchema.STRIPE_SECRET_KEY.safeParse("sk_live_not-allowed").success).toBe(false);
    expect(serverEnvSchema.STRIPE_SECRET_KEY.parse("sk_test_example")).toBe("sk_test_example");
    expect(serverEnvSchema.APP_ORIGIN.safeParse("https://user:password@example.test").success).toBe(false);
    expect(serverEnvSchema.APP_ORIGIN.safeParse("http://example.test").success).toBe(false);
    expect(serverEnvSchema.APP_ORIGIN.parse("http://localhost:3000")).toBe("http://localhost:3000");
    expect(serverEnvSchema.CART_COOKIE_SECRET.safeParse("short").success).toBe(false);
  });

  it("LOG_LEVEL 缺省为 info，拒绝非法级别", () => {
    expect(serverEnvSchema.LOG_LEVEL.parse(undefined)).toBe("info");
    expect(serverEnvSchema.LOG_LEVEL.parse("debug")).toBe("debug");
    expect(() => serverEnvSchema.LOG_LEVEL.parse("verbose")).toThrow();
  });

  it("keeps service configuration optional at startup", () => {
    expect(serverEnvSchema.AFTER_SALES_SERVICE_TOKEN.parse(undefined)).toBeUndefined();
    expect(serverEnvSchema.AFTER_SALES_SERVICE_MARKETS.parse(undefined)).toBeUndefined();
    expect(serverEnvSchema.AFTER_SALES_SERVICE_TOKEN.parse("s".repeat(32))).toBe("s".repeat(32));
  });

  it("parses an ordered, deduplicated service market allowlist", () => {
    expect(afterSalesServiceMarketsSchema.parse("au, sg,au")).toEqual(["au", "sg"]);
    expect(() => afterSalesServiceMarketsSchema.parse("")).toThrow();
    expect(() => afterSalesServiceMarketsSchema.parse("au,xx")).toThrow();
    expect(() => afterSalesServiceMarketsSchema.parse("au,,sg")).toThrow();
  });

  it("validates a strong, whitespace-free service token and at least one market", () => {
    const token = "synthetic-service-token-32-characters-minimum";
    expect(afterSalesServiceConfigSchema.safeParse({ token, markets: "au" }).success).toBe(true);
    expect(afterSalesServiceConfigSchema.safeParse({ token: "short", markets: "au" }).success).toBe(false);
    expect(
      afterSalesServiceConfigSchema.safeParse({ token: `${token} `, markets: "au" }).success,
    ).toBe(false);
    expect(afterSalesServiceConfigSchema.safeParse({ token, markets: "" }).success).toBe(false);
    expect(afterSalesServiceConfigSchema.safeParse({ token }).success).toBe(false);
  });
});
