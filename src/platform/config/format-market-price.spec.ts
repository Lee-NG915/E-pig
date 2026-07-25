import { describe, expect, it } from "vitest";

import { formatMarketPrice } from "./format-market-price";

describe("formatMarketPrice", () => {
  it("按 market 推导 locale，不要求调用方传 locale", () => {
    expect(formatMarketPrice({ amount: 2890, currency: "AUD" }, "au")).toBe("$2,890");
    expect(formatMarketPrice({ amount: 1890, currency: "USD" }, "us")).toBe("$1,890");
  });

  it("未知 market 抛错", () => {
    expect(() => formatMarketPrice({ amount: 1, currency: "AUD" }, "xx")).toThrow(/unknown market/);
  });
});
