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

beforeEach(async () => {
  vi.resetModules();
  store = await import("./cart-store");
});

describe("demo cart store", () => {
  it("初始为空且关闭", () => {
    expect(store.getCartSnapshot()).toEqual({ lines: [], open: false });
  });

  it("addItem 新增行并保存价格快照（展示不再回查 catalog）", () => {
    store.addItem(alto);

    const { lines } = store.getCartSnapshot();
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
    store.addItem(alto);
    store.addItem(alto);

    const { lines } = store.getCartSnapshot();
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  it("addItem 后 cart 自动打开", () => {
    store.addItem(nook);
    expect(store.getCartSnapshot().open).toBe(true);
  });

  it("setQuantity 到 0 移除该行", () => {
    store.addItem(alto);
    store.setQuantity("alto-modular-sofa", 0);
    expect(store.getCartSnapshot().lines).toHaveLength(0);
  });

  it("setQuantity 更新数量，多行互不影响", () => {
    store.addItem(alto);
    store.addItem(nook);
    store.setQuantity("nook-coffee-table", 5);

    const { lines } = store.getCartSnapshot();
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.productId === "nook-coffee-table")?.quantity).toBe(5);
    expect(lines.find((line) => line.productId === "alto-modular-sofa")?.quantity).toBe(1);
  });

  it("setCartOpen 只切换开关，不影响行数据", () => {
    store.addItem(alto);
    store.setCartOpen(false);

    const snapshot = store.getCartSnapshot();
    expect(snapshot.open).toBe(false);
    expect(snapshot.lines).toHaveLength(1);
  });
});
