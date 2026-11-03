import { describe, expect, it } from "vitest";

import { isAppError } from "@/core/errors/errors";
import { getMarket } from "@/platform/config/markets";
import { createLogger } from "@/platform/logging/logger";

import { createMockCartAdapter } from "./cart";
import { createMockCatalogAdapter } from "./catalog";

function setup(marketId: "au" | "sg" | "us" = "au") {
  const market = getMarket(marketId);
  const catalog = createMockCatalogAdapter({ market });
  const cart = createMockCartAdapter({ catalog, market, logger: createLogger() });
  return { cart, catalog };
}

describe("mock cart adapter", () => {
  it("reads existing creation identity and committed receipts without creating or crossing cart/market scope", async () => {
    const { cart } = setup();
    const creationKey = "create:read-only-test";
    expect(await cart.findCartByCreationKey(creationKey)).toBeNull();
    const first = await cart.createCart({ idempotencyKey: creationKey });
    const other = await cart.createCart({ idempotencyKey: "create:other" });
    expect(await cart.hasMutation(first.id, "add-receipt")).toBe(false);
    const added = await cart.addItem(first.id, { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 1 }, { idempotencyKey: "add-receipt" });
    expect(await cart.findCartByCreationKey(creationKey)).toEqual(added);
    expect(await cart.hasMutation(first.id, "add-receipt")).toBe(true);
    expect(await cart.hasMutation(other.id, "add-receipt")).toBe(false);
    expect(await cart.findCartByCreationKey("never-created")).toBeNull();
    const found = (await cart.findCartByCreationKey(creationKey))!;
    found.lines[0].quantity = 99;
    expect(await cart.getCart(first.id)).toEqual(added);
    for (const marketId of ["sg", "us"] as const) {
      const marketCart = setup(marketId).cart;
      expect(await marketCart.findCartByCreationKey(creationKey)).toBeNull();
      expect(await marketCart.hasMutation(first.id, "add-receipt")).toBe(false);
      const own = await marketCart.createCart({ idempotencyKey: creationKey });
      expect((await marketCart.findCartByCreationKey(creationKey))?.id).toBe(own.id);
      expect(own.id).not.toBe(first.id);
    }
  });

  it("does not report a receipt for a rejected mutation", async () => {
    const { cart } = setup();
    const first = await cart.createCart({ idempotencyKey: "create:failed-test" });
    await expect(cart.addItem(first.id, { productId: "tamarama-modular-sofa", variantId: "missing", quantity: 1 }, { idempotencyKey: "failed-add" })).rejects.toMatchObject({ kind: "validation" });
    expect(await cart.hasMutation(first.id, "failed-add")).toBe(false);
    expect(await cart.getCart(first.id)).toEqual(first);
  });

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

    await cart.addItem(created.id, { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 1 }, { idempotencyKey: "a1" });
    const updated = await cart.addItem(
      created.id,
      { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 2 },
      { idempotencyKey: "a2" },
    );

    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0].quantity).toBe(3);
    expect(updated.subtotal.amount).toBe(updated.lines[0].unitPrice.amount * 3);
    expect(updated.subtotal.currency).toBe("AUD");
  });

  it("addItem 重放同一幂等键时不重复增加数量", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-replay" });
    const input = { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 2 };

    const first = await cart.addItem(created.id, input, { idempotencyKey: "same-add" });
    const replayed = await cart.addItem(created.id, input, { idempotencyKey: "same-add" });

    expect(first.lines[0].quantity).toBe(2);
    expect(replayed.lines[0].quantity).toBe(2);
    expect((await cart.getCart(created.id)).lines[0].quantity).toBe(2);
  });

  it("addItem 并发重放同一幂等键时只执行一次", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-concurrent" });
    const input = { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 1 };

    await Promise.all([
      cart.addItem(created.id, input, { idempotencyKey: "concurrent-add" }),
      cart.addItem(created.id, input, { idempotencyKey: "concurrent-add" }),
    ]);

    expect((await cart.getCart(created.id)).lines[0].quantity).toBe(1);
  });

  it("不同幂等键并发加入同一商品时仍合并为一行", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-concurrent-distinct" });
    const input = { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 1 };

    await Promise.all([
      cart.addItem(created.id, input, { idempotencyKey: "concurrent-a" }),
      cart.addItem(created.id, input, { idempotencyKey: "concurrent-b" }),
    ]);

    const current = await cart.getCart(created.id);
    expect(current.lines).toHaveLength(1);
    expect(current.lines[0].quantity).toBe(2);
  });

  it("同一幂等键不能复用于不同 mutation payload", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-conflict" });
    await cart.addItem(
      created.id,
      { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 1 },
      { idempotencyKey: "reused-key" },
    );

    await expect(
      cart.addItem(
        created.id,
        { productId: "koala-luxe-mattress", variantId: "koala-luxe-mattress-default", quantity: 1 },
        { idempotencyKey: "reused-key" },
      ),
    ).rejects.toMatchObject({ kind: "conflict" });
  });

  it("addItem 拒绝非法 quantity 与未知商品", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-invalid" });

    await expect(
      cart.addItem(created.id, { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 0 }, { idempotencyKey: "q0" }),
    ).rejects.toMatchObject({ kind: "validation" });

    await expect(
      cart.addItem(created.id, { productId: "ghost", variantId: "ghost-default", quantity: 1 }, { idempotencyKey: "g1" }),
    ).rejects.toMatchObject({ kind: "not_found" });

    await cart.addItem(
      created.id,
      { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 1 },
      { idempotencyKey: "valid-first" },
    );
    await expect(
      cart.addItem(
        created.id,
        { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: -1 },
        { idempotencyKey: "invalid-existing" },
      ),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("updateItem 到 0 等价于移除该行", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-update" });
    const withLine = await cart.addItem(
      created.id,
      { productId: "koala-luxe-mattress", variantId: "koala-luxe-mattress-default", quantity: 2 },
      { idempotencyKey: "u1" },
    );

    const emptied = await cart.updateItem(created.id, withLine.lines[0].id, 0, {
      idempotencyKey: "remove-via-update",
    });
    expect(emptied.lines).toHaveLength(0);
    expect(emptied.subtotal.amount).toBe(0);
  });

  it("applyCoupon DEMO10 produces a final total, rejects invalid replacements and removes an empty code", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "op-coupon" });
    await cart.addItem(created.id, { productId: "suffolk-armchair", variantId: "suffolk-armchair-default", quantity: 1 }, { idempotencyKey: "c1" });

    const discounted = await cart.applyCoupon(created.id, "demo10", {
      idempotencyKey: "coupon-demo10",
    });
    expect(discounted.couponCode).toBe("DEMO10");
    expect(discounted.discount?.amount).toBeCloseTo(discounted.subtotal.amount * 0.1, 2);
    expect(discounted.total?.amount).toBeCloseTo(discounted.subtotal.amount - discounted.discount!.amount, 2);
    for (const code of ["INVALID", "EXPIRED10"]) {
      await expect(cart.applyCoupon(created.id, code, { idempotencyKey: code })).rejects.toMatchObject({ kind: "validation" });
      expect(await cart.getCart(created.id)).toEqual(discounted);
    }
    const removed = await cart.applyCoupon(created.id, "  ", { idempotencyKey: "coupon-empty" });
    expect(removed.couponCode).toBeUndefined();
    expect(removed.discount).toBeUndefined();
    expect(removed.total).toEqual(removed.subtotal);
  });

  it("atomically merges a bundle with variant prices and rolls back invalid second items", async () => {
    const { cart } = setup();
    const created = await cart.createCart({ idempotencyKey: "bundle" });
    const line = { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-forest-walk-3-sections", quantity: 1 };
    const items = [line, line];
    const merged = await cart.addItems(created.id, items, { idempotencyKey: "bundle-add" });
    expect(merged.lines).toHaveLength(1);
    expect(merged.lines[0]).toMatchObject({ quantity: 2, unitPrice: { amount: 3550 }, lineTotal: { amount: 7100 }, image: expect.stringContaining("TAM_FW_3S_R") });
    expect(merged.revision).toBe(1);
    expect(await cart.addItems(created.id, items, { idempotencyKey: "bundle-add" })).toEqual(merged);
    for (const invalid of [{ ...line, variantId: "missing" }, { ...line, quantity: 5 }]) {
      await expect(cart.addItems(created.id, [line, invalid], { idempotencyKey: JSON.stringify(invalid) })).rejects.toMatchObject({ kind: "validation" });
      expect(await cart.getCart(created.id)).toEqual(merged);
    }
  });

  it.each(["sg", "us"] as const)("rejects coupons in %s", async id => {
    const market = getMarket(id);
    const cart = createMockCartAdapter({ catalog: createMockCatalogAdapter({ market }), market, logger: createLogger() });
    const created = await cart.createCart({ idempotencyKey: "coupon-market" });
    await expect(cart.applyCoupon(created.id, "DEMO10", { idempotencyKey: "coupon" })).rejects.toMatchObject({ kind: "validation" });
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
