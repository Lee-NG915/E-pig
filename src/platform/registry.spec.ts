import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("./config/env");
  vi.doUnmock("./logging/logger");
});

describe("platform registry after-sales wiring", () => {
  it("exposes the mock after-sales capability through the typed registry", async () => {
    const { getCapabilities } = await import("./registry");
    const { market, afterSales } = getCapabilities();
    const order = await afterSales.getServiceOrder({
      kind: "service",
      market: market.id,
      actorId: "registry-test",
      allowedMarkets: [market.id],
    }, `ord_mock_${market.id}`);

    expect(order.market).toBe(market.id);
    expect(order.items.length).toBeGreaterThan(0);
  });

  it("warns when the production runtime is still using the mock adapter", async () => {
    const warn = vi.fn();
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
    };
    vi.doMock("./config/env", () => ({
      env: {
        MARKET: "au",
        COMMERCE_ADAPTER: "mock",
        NODE_ENV: "production",
      },
    }));
    vi.doMock("./logging/logger", () => ({ createLogger: () => logger }));
    vi.resetModules();

    const { getCapabilities } = await import("./registry");
    getCapabilities();

    expect(warn).toHaveBeenCalledWith(
      "capabilities.after_sales_mock_in_production",
      expect.objectContaining({ hint: expect.stringContaining("不提供真实售后能力") }),
    );
  });
});
