import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("market proxy", () => {
  it("imports and bypasses APIs without evaluating request environment, but rejects public requests without MARKET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("MARKET", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Netlify imports the proxy bundle without request-time environment values.
    const { proxy } = await import("./proxy");
    for (const path of ["/api", "/api/payments/stripe", "/api/au/cart", "/api/sg/orders"]) {
      const response = await proxy(new NextRequest(`https://store.test${path}`));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    await expect(proxy(new NextRequest("https://store.test/cart"))).rejects.toThrow("Invalid environment variables");
  });
  it.each(["au", "sg", "us"])("normalizes public requests using runtime MARKET=%s", async (market) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("MARKET", market);
    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("https://store.test/cart?q=1"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`https://store.test/${market}/cart?q=1`);
    const sameMarket = await proxy(new NextRequest(`https://store.test/${market}/cart?q=1`));
    expect(sameMarket.headers.get("x-middleware-next")).toBe("1");
  });
});
