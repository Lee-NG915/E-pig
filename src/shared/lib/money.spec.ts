import { describe, expect, it } from "vitest";

import { formatMarketPrice, formatPrice } from "./money";

describe("formatMarketPrice", () => {
  it("按 market 推导 locale，不要求调用方传 locale", () => {
    expect(formatMarketPrice({ amount: 2890, currency: "AUD" }, "au")).toBe("$2,890");
    expect(formatMarketPrice({ amount: 1890, currency: "USD" }, "us")).toBe("$1,890");
  });

  it("未知 market 抛错", () => {
    expect(() => formatMarketPrice({ amount: 1, currency: "AUD" }, "xx")).toThrow(/unknown market/);
  });
});

describe("formatPrice", () => {
  it("AUD / en-AU 使用本地货币符号", () => {
    expect(formatPrice({ amount: 2890, currency: "AUD" }, "en-AU")).toBe("$2,890");
  });

  it("USD / en-US", () => {
    expect(formatPrice({ amount: 1890, currency: "USD" }, "en-US")).toBe("$1,890");
  });

  it("GBP / en-GB", () => {
    expect(formatPrice({ amount: 1490, currency: "GBP" }, "en-GB")).toBe("£1,490");
  });

  it("SGD / en-SG 带千分位与货币标识", () => {
    const formatted = formatPrice({ amount: 2490, currency: "SGD" }, "en-SG");
    expect(formatted).toContain("2,490");
    expect(formatted).toMatch(/SGD|\$/);
  });

  it("整数金额不显示小数位，非整数保留两位", () => {
    expect(formatPrice({ amount: 590, currency: "AUD" }, "en-AU")).toBe("$590");
    expect(formatPrice({ amount: 59.5, currency: "AUD" }, "en-AU")).toContain("59.50");
  });
});
