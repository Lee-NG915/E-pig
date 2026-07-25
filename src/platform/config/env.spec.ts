import { describe, expect, it } from "vitest";

import { serverEnvSchema } from "./env";

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

  it("LOG_LEVEL 缺省为 info，拒绝非法级别", () => {
    expect(serverEnvSchema.LOG_LEVEL.parse(undefined)).toBe("info");
    expect(serverEnvSchema.LOG_LEVEL.parse("debug")).toBe("debug");
    expect(() => serverEnvSchema.LOG_LEVEL.parse("verbose")).toThrow();
  });
});
