/**
 * CartPort（04 §5/§7）：购物车契约。
 * 写操作必须支持幂等键 —— 前端的 disabled/loading 只是体验，不是幂等保证。
 */

import type { Money } from "./catalog";

export type CartLine = {
  id: string;
  productId: string;
  variantId: string;
  /** Snapshot from the priced variant; absent on legacy cart/order data. */
  sku?: string;
  variantLabel: string;
  availability?: "in-stock" | "out-of-stock";
  problem?: string;
  name: string;
  colour?: string;
  image?: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
};

export type Cart = {
  id: string;
  market: string;
  revision: number;
  lockedCheckoutId?: string;
  lines: CartLine[];
  subtotal: Money;
  discount?: Money;
  couponCode?: string;
  /** Final server-calculated total; absent on legacy snapshots. */
  total?: Money;
};

export type AddCartLineInput = {
  productId: string;
  variantId: string;
  quantity: number;
};

export type CartMutationOptions = {
  idempotencyKey: string;
};

export interface CartPort {
  /** 同一 idempotencyKey 重复调用必须返回同一购物车，不创建新 cart */
  createCart(input: { idempotencyKey: string }): Promise<Cart>;
  /** Read an existing creation key in this market; never creates a cart. */
  findCartByCreationKey(idempotencyKey: string): Promise<Cart | null>;
  /** True only for a committed mutation on this cart in this market. */
  hasMutation(cartId: string, idempotencyKey: string): Promise<boolean>;
  /** 未找到时抛 AppError({ kind: "not_found" }) */
  getCart(cartId: string): Promise<Cart>;
  addItem(
    cartId: string,
    input: AddCartLineInput,
    options: CartMutationOptions,
  ): Promise<Cart>;
  /** Atomically add 1–2 lines. Any invalid item rejects the whole operation. */
  addItems(cartId: string, items: AddCartLineInput[], options: CartMutationOptions): Promise<Cart>;
  /** quantity <= 0 等价于 removeItem */
  updateItem(
    cartId: string,
    lineId: string,
    quantity: number,
    options: CartMutationOptions,
  ): Promise<Cart>;
  removeItem(cartId: string, lineId: string, options: CartMutationOptions): Promise<Cart>;
  applyCoupon(cartId: string, code: string, options: CartMutationOptions): Promise<Cart>;
}
