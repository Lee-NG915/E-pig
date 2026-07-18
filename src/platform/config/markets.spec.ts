import { describe, expect, it } from "vitest";

import {
  getMarket,
  isLocaleSupported,
  isMarketId,
  marketIds,
  markets,
  resolveMarketFromHost,
} from "./markets";

describe("market registry", () => {
  it("marketIds 与 markets 记录一一对应", () => {
    expect(marketIds).toEqual(["au", "sg", "us"]);
    for (const id of marketIds) {
      expect(markets[id].id).toBe(id);
      expect(markets[id].locales).toContain(markets[id].defaultLocale);
    }
  });

  it("isMarketId 只接受 registry 里的 id", () => {
    expect(isMarketId("sg")).toBe(true);
    expect(isMarketId("us")).toBe(true);
    expect(isMarketId("xx")).toBe(false);
    expect(isMarketId("")).toBe(false);
  });

  it("getMarket 返回正确的货币与默认 locale", () => {
    expect(getMarket("au").currency).toBe("AUD");
    expect(getMarket("au").defaultLocale).toBe("en-AU");
    expect(getMarket("us").currency).toBe("USD");
  });
});

describe("resolveMarketFromHost（host → market 纯函数）", () => {
  it("精确匹配 registry hosts", () => {
    expect(resolveMarketFromHost("au.e-pig.local")?.id).toBe("au");
    expect(resolveMarketFromHost("sg.e-pig.local")?.id).toBe("sg");
  });

  it("剥离端口后再匹配", () => {
    expect(resolveMarketFromHost("au.localhost:3000")?.id).toBe("au");
  });

  it("首段子域名是 market id 时解析（如 sg.example.com）", () => {
    expect(resolveMarketFromHost("sg.example.com")?.id).toBe("sg");
    expect(resolveMarketFromHost("us.example.com")?.id).toBe("us");
  });

  it("未知 host 返回 null，不猜测", () => {
    expect(resolveMarketFromHost("example.com")).toBeNull();
    expect(resolveMarketFromHost("shop.example.com")).toBeNull();
    expect(resolveMarketFromHost("ca.example.com")).toBeNull();
    expect(resolveMarketFromHost(null)).toBeNull();
    expect(resolveMarketFromHost(undefined)).toBeNull();
    expect(resolveMarketFromHost("")).toBeNull();
  });
});

describe("isLocaleSupported", () => {
  it("locale 必须属于该 market", () => {
    expect(isLocaleSupported(getMarket("au"), "en-AU")).toBe(true);
    expect(isLocaleSupported(getMarket("sg"), "en-SG")).toBe(true);
    expect(isLocaleSupported(getMarket("au"), "fr-CA")).toBe(false);
    expect(isLocaleSupported(getMarket("us"), "zh-CN")).toBe(false);
  });
});
