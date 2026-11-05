import { afterEach, describe, expect, it, vi } from "vitest";

import type { AfterSalesPort } from "@/core/contracts/after-sales";

const createLogger = vi.fn();
const createCommercePool = vi.fn();
const createPostgresAfterSalesAdapter = vi.fn();

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const baseEnv = {
  MARKET: "au",
  NODE_ENV: "test",
  COMMERCE_ADAPTER: "mock",
  AFTER_SALES_ADAPTER: "mock",
  DATABASE_DRIVER: "neon",
  DATABASE_URL: undefined as string | undefined,
  CART_COOKIE_SECRET: undefined as string | undefined,
  APP_ORIGIN: undefined as string | undefined,
};

function reset() {
  vi.resetModules();
  vi.doUnmock("./config/env");
  vi.doUnmock("./logging/logger");
  vi.doUnmock("@/adapters/commerce/postgres/pool");
  vi.doUnmock("@/adapters/after-sales/postgres/after-sales");
  vi.clearAllMocks();
}

async function loadRegistry(overrides: Partial<typeof baseEnv> = {}) {
  createLogger.mockReturnValue(logger);
  createCommercePool.mockReturnValue({ query: vi.fn(), connect: vi.fn() });
  createPostgresAfterSalesAdapter.mockReturnValue({
    createRequest: vi.fn(),
  } as unknown as AfterSalesPort);

  vi.doMock("./config/env", () => ({ env: { ...baseEnv, ...overrides } }));
  vi.doMock("./logging/logger", () => ({ createLogger }));
  vi.doMock("@/adapters/commerce/postgres/pool", () => ({
    createCommercePool,
    transaction: vi.fn(),
  }));
  vi.doMock("@/adapters/after-sales/postgres/after-sales", () => ({
    createPostgresAfterSalesAdapter,
  }));
  return import("./registry");
}

afterEach(reset);

describe("platform registry after-sales wiring", () => {
  it("exposes the mock after-sales capability through the typed registry", async () => {
    const { getCapabilities } = await loadRegistry();
    const { market, afterSales } = getCapabilities();
    const order = await afterSales.getServiceOrder({
      kind: "service",
      market: market.id,
      actorId: "registry-test",
      allowedMarkets: [market.id],
    }, `ord_mock_${market.id}`);

    expect(order.market).toBe(market.id);
    expect(order.items.length).toBeGreaterThan(0);
    expect(createCommercePool).not.toHaveBeenCalled();
  });

  it("warns when the production runtime is still using the mock adapter", async () => {
    const { getCapabilities } = await loadRegistry({ NODE_ENV: "production" });
    expect(getCapabilities().afterSales).toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      "capabilities.after_sales_mock_in_production",
      expect.objectContaining({ hint: expect.stringContaining("不提供真实售后能力") }),
    );
  });

  it("fails closed when postgres is selected with a mock commerce adapter", async () => {
    const { getAfterSales } = await loadRegistry({
      AFTER_SALES_ADAPTER: "postgres",
      COMMERCE_ADAPTER: "mock",
      DATABASE_URL: "postgres://synthetic.invalid/test",
    });
    const afterSales = getAfterSales();

    await expect(afterSales.getServiceOrder({
      kind: "service",
      market: "au",
      actorId: "registry-test",
      allowedMarkets: ["au"],
    }, "ord_unavailable")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(createCommercePool).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "capabilities.after_sales_unavailable",
      { reason: "commerce_adapter_mismatch" },
    );
  });

  it("fails closed when postgres is selected without DATABASE_URL", async () => {
    const { getAfterSales } = await loadRegistry({
      AFTER_SALES_ADAPTER: "postgres",
      COMMERCE_ADAPTER: "postgres",
    });
    const afterSales = getAfterSales();

    await expect(afterSales.listServiceRequests({
      kind: "service",
      market: "au",
      actorId: "registry-test",
      allowedMarkets: ["au"],
    })).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(createCommercePool).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "capabilities.after_sales_unavailable",
      { reason: "database_url_missing" },
    );
  });

  it("creates and caches one explicit tcp pool and after-sales adapter", async () => {
    const { getAfterSales, getCommercePool } = await loadRegistry({
      AFTER_SALES_ADAPTER: "postgres",
      COMMERCE_ADAPTER: "postgres",
      DATABASE_URL: "postgres://synthetic.invalid/test",
      DATABASE_DRIVER: "tcp",
    });

    const firstAdapter = getAfterSales();
    const secondAdapter = getAfterSales();
    const firstPool = getCommercePool();
    const secondPool = getCommercePool();

    expect(secondAdapter).toBe(firstAdapter);
    expect(secondPool).toBe(firstPool);
    expect(createCommercePool).toHaveBeenCalledTimes(1);
    expect(createCommercePool).toHaveBeenCalledWith(
      "postgres://synthetic.invalid/test",
      "tcp",
    );
    expect(createPostgresAfterSalesAdapter).toHaveBeenCalledTimes(1);
  });

  it("keeps neon as the default database driver", async () => {
    const { getCommercePool } = await loadRegistry({
      AFTER_SALES_ADAPTER: "postgres",
      COMMERCE_ADAPTER: "postgres",
      DATABASE_URL: "postgres://synthetic.invalid/test",
      DATABASE_DRIVER: undefined,
    });

    getCommercePool();

    expect(createCommercePool).toHaveBeenCalledWith(
      "postgres://synthetic.invalid/test",
      "neon",
    );
  });

  it("renders catalog capabilities without creating a database pool", async () => {
    const { getCapabilities } = await loadRegistry({
      AFTER_SALES_ADAPTER: "postgres",
      COMMERCE_ADAPTER: "postgres",
    });

    expect(getCapabilities().catalog).toBeDefined();
    expect(createCommercePool).not.toHaveBeenCalled();
  });

  it("rejects an unregistered after-sales adapter", async () => {
    const { getAfterSales } = await loadRegistry({ AFTER_SALES_ADAPTER: "other" });

    expect(() => getAfterSales()).toThrow("Unsupported AFTER_SALES_ADAPTER: other");
  });
});
