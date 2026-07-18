// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * cart-store 是模块级 external store；每个用例用 vi.resetModules + 动态 import
 * 拿到全新模块实例，避免用例间状态泄漏。
 */
type CartStoreModule = typeof import("./cart-store");

let store: CartStoreModule;

const alto = {
  id: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  colour: "Moss weave",
  image: "https://example.com/alto.jpg",
  price: { amount: 2890, currency: "AUD" },
};

const nook = {
  id: "nook-coffee-table",
  name: "Nook Coffee Table",
  colour: "Smoked ash",
  image: "https://example.com/nook.jpg",
  price: { amount: 590, currency: "AUD" },
};

const auMarket = { id: "au", currency: "AUD" };
const sgMarket = { id: "sg", currency: "SGD" };

beforeEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  vi.resetModules();
  store = await import("./cart-store");
});

describe("demo cart store", () => {
  it("初始为空且关闭", () => {
    expect(store.getCartSnapshot(auMarket)).toEqual({ lines: [], open: false });
  });

  it("addItem 新增行并保存价格快照（展示不再回查 catalog）", () => {
    store.addItem(auMarket, alto);

    const { lines } = store.getCartSnapshot(auMarket);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      productId: "alto-modular-sofa",
      name: "Alto Modular Sofa",
      quantity: 1,
      priceAmount: 2890,
      priceCurrency: "AUD",
    });
  });

  it("重复 addItem 同商品只累加数量", () => {
    store.addItem(auMarket, alto);
    store.addItem(auMarket, alto);

    const { lines } = store.getCartSnapshot(auMarket);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  it("addItem 后 cart 自动打开", () => {
    store.addItem(auMarket, nook);
    expect(store.getCartSnapshot(auMarket).open).toBe(true);
  });

  it("setQuantity 到 0 移除该行", () => {
    store.addItem(auMarket, alto);
    store.setQuantity(auMarket, "alto-modular-sofa", 0);
    expect(store.getCartSnapshot(auMarket).lines).toHaveLength(0);
  });

  it("setQuantity 更新数量，多行互不影响", () => {
    store.addItem(auMarket, alto);
    store.addItem(auMarket, nook);
    store.setQuantity(auMarket, "nook-coffee-table", 5);

    const { lines } = store.getCartSnapshot(auMarket);
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.productId === "nook-coffee-table")?.quantity).toBe(5);
    expect(lines.find((line) => line.productId === "alto-modular-sofa")?.quantity).toBe(1);
  });

  it("setCartOpen 只切换开关，不影响行数据", () => {
    store.addItem(auMarket, alto);
    store.setCartOpen(auMarket, false);

    const snapshot = store.getCartSnapshot(auMarket);
    expect(snapshot.open).toBe(false);
    expect(snapshot.lines).toHaveLength(1);
  });

  it("按 market 隔离状态和带版本的 localStorage payload", () => {
    const sgProduct = { ...alto, price: { amount: 2990, currency: "SGD" } };

    store.addItem(auMarket, alto);
    store.addItem(sgMarket, sgProduct);

    expect(store.getCartSnapshot(auMarket).lines[0].priceCurrency).toBe("AUD");
    expect(store.getCartSnapshot(sgMarket).lines[0].priceCurrency).toBe("SGD");
    expect(window.localStorage.getItem(store.getCartStorageKey("au"))).toContain(
      '"marketId":"au"',
    );
    expect(window.localStorage.getItem(store.getCartStorageKey("sg"))).toContain(
      '"version":1',
    );
  });

  it("拒绝不完整或数值非法的持久化 schema", async () => {
    window.localStorage.setItem(
      store.getCartStorageKey("au"),
      JSON.stringify({
        version: 1,
        marketId: "au",
        lines: [{ ...alto, priceAmount: Number.NaN, priceCurrency: "AUD", quantity: 0 }],
      }),
    );
    vi.resetModules();
    store = await import("./cart-store");

    expect(store.getCartSnapshot(auMarket).lines).toEqual([]);
    expect(window.localStorage.getItem(store.getCartStorageKey("au"))).toBeNull();
  });

  it("恢复合法的同 market v1 payload", async () => {
    window.localStorage.setItem(
      store.getCartStorageKey("au"),
      JSON.stringify({
        version: 1,
        marketId: "au",
        lines: [
          {
            productId: alto.id,
            name: alto.name,
            colour: alto.colour,
            image: alto.image,
            priceAmount: alto.price.amount,
            priceCurrency: alto.price.currency,
            quantity: 2,
          },
        ],
      }),
    );
    vi.resetModules();
    store = await import("./cart-store");

    expect(store.getCartSnapshot(auMarket).lines[0]).toMatchObject({
      productId: alto.id,
      quantity: 2,
      priceCurrency: "AUD",
    });
  });

  it.each([
    ["version", { version: 2, marketId: "au" }],
    ["market", { version: 1, marketId: "sg" }],
  ])("拒绝错误的 %s 持久化字段", async (_label, envelope) => {
    window.localStorage.setItem(
      store.getCartStorageKey("au"),
      JSON.stringify({ ...envelope, lines: [] }),
    );
    vi.resetModules();
    store = await import("./cart-store");

    expect(store.getCartSnapshot(auMarket).lines).toEqual([]);
    expect(window.localStorage.getItem(store.getCartStorageKey("au"))).toBeNull();
  });

  it("拒绝与当前 market 不一致的持久化货币", async () => {
    window.localStorage.setItem(
      store.getCartStorageKey("au"),
      JSON.stringify({
        version: 1,
        marketId: "au",
        lines: [
          {
            productId: alto.id,
            name: alto.name,
            colour: alto.colour,
            image: alto.image,
            priceAmount: alto.price.amount,
            priceCurrency: "SGD",
            quantity: 1,
          },
        ],
      }),
    );
    vi.resetModules();
    store = await import("./cart-store");

    expect(store.getCartSnapshot(auMarket).lines).toEqual([]);
  });

  it("localStorage 读取和清理同时失败时保持空购物车且不抛错", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("storage disabled", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("storage disabled", "SecurityError");
    });

    expect(() => store.getCartSnapshot(auMarket)).not.toThrow();
    expect(store.getCartSnapshot(auMarket).lines).toEqual([]);
  });

  it("localStorage 写失败时仍更新内存状态且不抛错", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    expect(() => store.addItem(auMarket, alto)).not.toThrow();
    expect(store.getCartSnapshot(auMarket).lines).toHaveLength(1);
  });

  it("拒绝把其他货币的商品加入当前 market", () => {
    const foreignProduct = { ...alto, price: { amount: 2890, currency: "SGD" } };

    expect(() => store.addItem(auMarket, foreignProduct)).toThrow(/currency/i);
    expect(store.getCartSnapshot(auMarket).lines).toEqual([]);
  });
});
