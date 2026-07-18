import { describe, expect, it } from "vitest";

import { isAppError } from "@/core/errors/errors";
import { getMarket } from "@/platform/config/markets";
import { createLogger } from "@/platform/logging/logger";

import { createMockCartAdapter } from "./cart";
import { createMockCatalogAdapter } from "./catalog";

function setup() {
  const market = getMarket("au");
  const catalog = createMockCatalogAdapter({ market });
  const cart = createMockCartAdapter({ catalog, market, logger: createLogger() });
  return { cart, catalog };
}

describe("mock cart adapter", () => {
  it("createCart 幂等：同一 idempotencyKey 重放返回同一 cart", async () => {
    const { cart } = setup();
    const first = await cart.createCart({ idempotencyKey: "op-1" });
    const replayed = await cart.createCart({ idempotencyKey: "op-1" });
    expect(replayed.id).toBe(first.id);

    const other = await cart.createCart({ idempotencyKey: "op-2" });
    expect(other.id).not.toBe(first.id);
  });

  it("addItem 合并同商品行并重算小计", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-add" });

    await cart.addItem(created.id, { productId: "alto-modular-sofa", quantity: 1 }, { idempotencyKey: "a1" });
    const updated = await cart.addItem(
      created.id,
      { productId: "alto-modular-sofa", quantity: 2 },
      { idempotencyKey: "a2" },
    );

    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0].quantity).toBe(3);
    expect(updated.subtotal.amount).toBe(updated.lines[0].unitPrice.amount * 3);
    expect(updated.subtotal.currency).toBe("AUD");
  });

  it("addItem 拒绝非法 quantity 与未知商品", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-invalid" });

    await expect(
      cart.addItem(created.id, { productId: "alto-modular-sofa", quantity: 0 }, { idempotencyKey: "q0" }),
    ).rejects.toMatchObject({ kind: "validation" });

    await expect(
      cart.addItem(created.id, { productId: "ghost", quantity: 1 }, { idempotencyKey: "g1" }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("updateItem 到 0 等价于移除该行", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-update" });
    const withLine = await cart.addItem(
      created.id,
      { productId: "nook-coffee-table", quantity: 2 },
      { idempotencyKey: "u1" },
    );

    const emptied = await cart.updateItem(created.id, withLine.lines[0].id, 0);
    expect(emptied.lines).toHaveLength(0);
    expect(emptied.subtotal.amount).toBe(0);
  });

  it("applyCoupon DEMO10 产生 10% 折扣；空 code 抛 validation", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-coupon" });
    await cart.addItem(created.id, { productId: "cove-lounge-chair", quantity: 1 }, { idempotencyKey: "c1" });

    const discounted = await cart.applyCoupon(created.id, "demo10");
    expect(discounted.couponCode).toBe("DEMO10");
    expect(discounted.discount?.amount).toBeCloseTo(discounted.subtotal.amount * 0.1, 2);

    await expect(cart.applyCoupon(created.id, "  ")).rejects.toMatchObject({ kind: "validation" });
  });

  it("getCart 未知 id 抛 not_found", async () => {
    const { cart } = setup();
    try {
      await cart.getCart("missing");
      expect.unreachable("should throw");
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect((error as { kind: string }).kind).toBe("not_found");
    }
  });
});
