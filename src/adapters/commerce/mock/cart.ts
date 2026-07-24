import type { CatalogPort, Money } from "@/core/contracts/commerce/catalog";
import type {
  AddCartLineInput,
  Cart,
  CartLine,
  CartMutationOptions,
  CartPort,
} from "@/core/contracts/commerce/cart";
import { AppError } from "@/core/errors/errors";
import type { Logger } from "@/platform/logging/logger";
import type { Market } from "@/platform/config/markets";

const DEMO_COUPON = "DEMO10";
const DEMO_COUPON_RATE = 0.1;

/**
 * Mock CartAdapter：进程内内存实现，证明 CartPort seam 可工作。
 * 真实后端的订单金额、库存锁定必须由受信任服务端完成（03 §3）——
 * 这里只服务本地开发与 contract test，永远不进生产。
 */
export function createMockCartAdapter({
  catalog,
  market,
  logger,
}: {
  catalog: CatalogPort;
  market: Market;
  logger: Logger;
}): CartPort {
  const carts = new Map<string, Cart>();
  /** idempotencyKey → cartId，createCart 重放时返回同一 cart */
  const createKeys = new Map<string, string>();
  const mutations = new Map<string, { signature: string; result: Promise<Cart> }>();
  const cartQueues = new Map<string, Promise<void>>();

  function money(amount: number): Money {
    return { amount: Math.round(amount * 100) / 100, currency: market.currency };
  }

  function recompute(cart: Cart): Cart {
    const subtotal = cart.lines.reduce((total, line) => total + line.lineTotal.amount, 0);
    cart.subtotal = money(subtotal);
    cart.discount = cart.couponCode === DEMO_COUPON ? money(subtotal * DEMO_COUPON_RATE) : undefined;
    return cart;
  }

  function requireCart(cartId: string): Cart {
    const cart = carts.get(cartId);
    if (!cart) throw new AppError("not_found", `Cart not found: ${cartId}`);
    return cart;
  }

  function cloneCart(cart: Cart): Cart {
    return structuredClone(cart);
  }

  function requireIdempotencyKey({ idempotencyKey }: CartMutationOptions): string {
    const key = idempotencyKey.trim();
    if (!key) throw new AppError("validation", "idempotencyKey must not be empty");
    return key;
  }

  async function mutateOnce(
    cartId: string,
    options: CartMutationOptions,
    signature: string,
    operation: (cart: Cart) => Promise<Cart> | Cart,
  ): Promise<Cart> {
    const scopedKey = `${cartId}:${requireIdempotencyKey(options)}`;
    const existing = mutations.get(scopedKey);
    if (existing) {
      if (existing.signature !== signature) {
        throw new AppError("conflict", "idempotencyKey was already used for another mutation");
      }
      logger.debug("cart.mutation_replayed", { cartId, signature });
      return cloneCart(await existing.result);
    }

    const previous = cartQueues.get(cartId) ?? Promise.resolve();
    const result = previous.then(async () => cloneCart(await operation(requireCart(cartId))));
    const queueTail = result.then(
      () => undefined,
      () => undefined,
    );
    cartQueues.set(cartId, queueTail);
    void queueTail.then(() => {
      if (cartQueues.get(cartId) === queueTail) cartQueues.delete(cartId);
    });
    mutations.set(scopedKey, { signature, result });
    try {
      return cloneCart(await result);
    } catch (error) {
      if (mutations.get(scopedKey)?.result === result) mutations.delete(scopedKey);
      throw error;
    }
  }

  async function buildLine(input: AddCartLineInput): Promise<CartLine> {
    const product = await catalog.getProduct(input.productId);
    return {
      id: crypto.randomUUID(),
      productId: product.id,
      name: product.name,
      colour: product.colour,
      image: product.image,
      quantity: input.quantity,
      unitPrice: product.price,
      lineTotal: money(product.price.amount * input.quantity),
    };
  }

  return {
    async createCart({ idempotencyKey }) {
      const key = requireIdempotencyKey({ idempotencyKey });
      const existingId = createKeys.get(key);
      if (existingId) {
        logger.debug("cart.create.replayed", { cartId: existingId });
        return cloneCart(requireCart(existingId));
      }
      const cart: Cart = {
        id: crypto.randomUUID(),
        market: market.id,
        lines: [],
        subtotal: money(0),
      };
      carts.set(cart.id, cart);
      createKeys.set(key, cart.id);
      logger.info("cart.created", { cartId: cart.id, market: market.id });
      return cloneCart(cart);
    },

    async getCart(cartId) {
      return cloneCart(requireCart(cartId));
    },

    async addItem(cartId, input, options) {
      const signature = JSON.stringify(["add", input.productId, input.quantity]);
      return mutateOnce(cartId, options, signature, async (cart) => {
        if (!Number.isInteger(input.quantity) || input.quantity < 1) {
          throw new AppError("validation", "quantity must be a positive integer");
        }
        const existing = cart.lines.find((line) => line.productId === input.productId);
        if (existing) {
          existing.quantity += input.quantity;
          existing.lineTotal = money(existing.unitPrice.amount * existing.quantity);
        } else {
          cart.lines.push(await buildLine(input));
        }
        logger.info("cart.item_added", {
          cartId,
          productId: input.productId,
          quantity: input.quantity,
        });
        return recompute(cart);
      });
    },

    async updateItem(cartId, lineId, quantity, options) {
      return mutateOnce(cartId, options, JSON.stringify(["update", lineId, quantity]), (cart) => {
        if (!Number.isInteger(quantity)) {
          throw new AppError("validation", "quantity must be an integer");
        }
        const line = cart.lines.find((item) => item.id === lineId);
        if (!line) throw new AppError("not_found", `Cart line not found: ${lineId}`);
        if (quantity <= 0) {
          cart.lines = cart.lines.filter((item) => item.id !== lineId);
        } else {
          line.quantity = quantity;
          line.lineTotal = money(line.unitPrice.amount * quantity);
        }
        return recompute(cart);
      });
    },

    async removeItem(cartId, lineId, options) {
      return mutateOnce(cartId, options, JSON.stringify(["remove", lineId]), (cart) => {
        cart.lines = cart.lines.filter((item) => item.id !== lineId);
        return recompute(cart);
      });
    },

    async applyCoupon(cartId, code, options) {
      const normalized = code.trim().toUpperCase();
      return mutateOnce(cartId, options, JSON.stringify(["coupon", normalized]), (cart) => {
        if (!normalized) throw new AppError("validation", "coupon code must not be empty");
        cart.couponCode = normalized;
        return recompute(cart);
      });
    },
  };
}
