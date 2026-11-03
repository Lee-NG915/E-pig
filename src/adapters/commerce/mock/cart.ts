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
  const appliedMutations = new Set<string>();
  const cartQueues = new Map<string, Promise<void>>();

  function money(amount: number): Money {
    return { amount: Math.round(amount * 100) / 100, currency: market.currency };
  }

  function recompute(cart: Cart): Cart {
    cart.revision += 1;
    const subtotal = cart.lines.reduce((total, line) => total + line.lineTotal.amount, 0);
    cart.subtotal = money(subtotal);
    const subtotalCents = Math.round(subtotal * 100);
    const discountCents = market.id === "au" && cart.couponCode === DEMO_COUPON ? Math.round(subtotalCents / 10) : 0;
    cart.discount = market.id === "au" && cart.couponCode === DEMO_COUPON ? money(discountCents / 100) : undefined;
    cart.total = money((subtotalCents - discountCents) / 100);
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
    const result = previous.then(async () => {
      const draft = cloneCart(requireCart(cartId));
      if (draft.lockedCheckoutId) throw new AppError("conflict", "Cart is locked for payment");
      const updated = await operation(draft);
      carts.set(cartId, cloneCart(updated));
      appliedMutations.add(scopedKey);
      return cloneCart(updated);
    });
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
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10) throw new AppError("validation", "Quantity must be between 1 and 10");
    const product = await catalog.getProduct(input.productId);
    const variant = product.variants.find(item => item.id === input.variantId);
    if (!variant || variant.availability !== "in-stock" || input.quantity > variant.maxQuantity) throw new AppError("validation", "This variant or quantity is unavailable");
    if (variant.price.currency !== market.currency || !Number.isFinite(variant.price.amount) || variant.price.amount <= 0) throw new AppError("validation", "This variant cannot currently be priced");
    return {
      id: crypto.randomUUID(),
      productId: product.id,
      variantId: input.variantId,
      variantLabel: variant.label,
      name: product.name,
      colour: product.colour,
      image: variant.image,
      quantity: input.quantity,
      unitPrice: variant.price,
      lineTotal: money(variant.price.amount * input.quantity),
      availability: variant.availability,
    };
  }
  async function appendItems(cart: Cart, items: AddCartLineInput[]): Promise<Cart> {
    if (!Array.isArray(items) || items.length < 1 || items.length > 2) throw new AppError("validation", "Add one or two items at a time");
    for (const input of items) {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new AppError("validation", "quantity must be a positive integer");
      const index = cart.lines.findIndex(line => line.productId === input.productId && line.variantId === input.variantId);
      const existing = cart.lines[index];
      const line = await buildLine({ ...input, quantity: input.quantity + (existing?.quantity ?? 0) });
      if (existing) cart.lines[index] = { ...line, id: existing.id };
      else cart.lines.push(line);
    }
    return recompute(cart);
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
        revision: 0,
        lines: [],
        subtotal: money(0),
        total: money(0),
      };
      carts.set(cart.id, cart);
      createKeys.set(key, cart.id);
      logger.info("cart.created", { cartId: cart.id, market: market.id });
      return cloneCart(cart);
    },

    async findCartByCreationKey(idempotencyKey) {
      const existingId = createKeys.get(requireIdempotencyKey({ idempotencyKey }));
      return existingId ? cloneCart(requireCart(existingId)) : null;
    },

    async hasMutation(cartId, idempotencyKey) {
      const key = requireIdempotencyKey({ idempotencyKey });
      return carts.has(cartId) && appliedMutations.has(`${cartId}:${key}`);
    },

    async getCart(cartId) {
      return cloneCart(requireCart(cartId));
    },

    async addItem(cartId, input, options) {
      const signature = JSON.stringify(["add", input.productId, input.variantId, input.quantity]);
      return mutateOnce(cartId, options, signature, cart => appendItems(cart, [input]));
    },
    async addItems(cartId, items, options) {
      return mutateOnce(cartId, options, JSON.stringify(["addItems", items]), cart => appendItems(cart, items));
    },

    async updateItem(cartId, lineId, quantity, options) {
      return mutateOnce(cartId, options, JSON.stringify(["update", lineId, quantity]), async (cart) => {
        if (!Number.isInteger(quantity)) {
          throw new AppError("validation", "quantity must be an integer");
        }
        const line = cart.lines.find((item) => item.id === lineId);
        if (!line) throw new AppError("not_found", `Cart line not found: ${lineId}`);
        if (quantity <= 0) {
          cart.lines = cart.lines.filter((item) => item.id !== lineId);
        } else {
          Object.assign(line, await buildLine({ productId: line.productId, variantId: line.variantId, quantity }), { id: lineId });
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
        if (market.id !== "au") throw new AppError("validation", "Demo coupons are available in AU only");
        if (normalized && normalized !== DEMO_COUPON) throw new AppError("validation", normalized === "EXPIRED10" ? "This demo coupon has expired" : "This demo coupon is not valid");
        if (normalized && !cart.lines.length) throw new AppError("validation", "Add an item before applying a demo coupon");
        if (normalized) cart.couponCode = normalized;
        else delete cart.couponCode;
        return recompute(cart);
      });
    },
  };
}
