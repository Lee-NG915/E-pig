import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { CatalogPort, Money } from "@/core/contracts/commerce/catalog";
import type { AddCartLineInput, Cart, CartLine, CartMutationOptions, CartPort } from "@/core/contracts/commerce/cart";
import { checkoutInputSchema, type Checkout, type CheckoutInput, type CheckoutPort } from "@/core/contracts/commerce/checkout";
import type { Order, OrderPort } from "@/core/contracts/commerce/order";
import type { PaymentEvent, PaymentPort, PaymentRequest, PaymentSession } from "@/core/contracts/capabilities/payment";
import { AppError } from "@/core/errors/errors";
import type { Market } from "@/platform/config/markets";
import { transaction, type CommercePool, type CommerceQuery } from "./pool";

const MAX_QUANTITY = 10;
const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;
type StoredCheckout = { checkout: Checkout; request: PaymentRequest; sessionId?: string; firstAttempt: number; signature: string };
const signature = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function requestKey(options: CartMutationOptions): string {
  const key = options.idempotencyKey;
  if (typeof key !== "string" || key.length < 16 || key.length > 200 || !/^[a-zA-Z0-9:_-]+$/.test(key)) {
    throw new AppError("validation", "Use a unique request key of 16–200 letters, digits, colons, underscores or hyphens");
  }
  return key;
}
function rowCheckout(row: Record<string, unknown>): StoredCheckout {
  return {
    checkout: row.data as Checkout,
    request: row.payment_request as PaymentRequest,
    sessionId: (row.session_id as string | null) ?? undefined,
    firstAttempt: new Date(row.first_attempt_at as string).getTime(),
    signature: row.input_signature as string,
  };
}

/** All state survives process restarts. Provider calls intentionally run outside DB locks. */
export function createPostgresCommerce({ pool, catalog, market, payment, origin, now = () => new Date() }: {
  pool: CommercePool; catalog: CatalogPort; market: Market; payment: PaymentPort; origin: string; now?: () => Date;
}): { cart: CartPort; checkout: CheckoutPort; orders: OrderPort; handlePaymentEvent(event: PaymentEvent): Promise<void> } {
  const site = new URL(origin);
  if (site.username || site.password || (site.protocol !== "https:" && !(site.protocol === "http:" && site.hostname === "localhost"))) throw new AppError("validation", "Invalid checkout origin");
  const money = (amount: number): Money => ({ amount: Math.round(amount * 100) / 100, currency: market.currency });

  async function readCart(db: CommerceQuery, cartId: string, lock = false): Promise<Cart> {
    const { rows } = await db.query(`SELECT data FROM commerce_carts WHERE id = $1 AND market = $2${lock ? " FOR UPDATE" : ""}`, [cartId, market.id]);
    if (!rows[0]) throw new AppError("not_found", "Cart not found");
    return rows[0].data as Cart;
  }
  async function saveCart(db: CommerceQuery, cart: Cart) {
    await db.query("UPDATE commerce_carts SET data = $1 WHERE id = $2 AND market = $3", [JSON.stringify(cart), cart.id, market.id]);
  }
  async function priceLine(line: CartLine, strict: boolean): Promise<CartLine> {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) throw new AppError("validation", "Quantity must be between 1 and 10");
    const unavailable = (problem: string): CartLine => {
      if (strict) throw new AppError("validation", problem);
      // A removed product's last snapshot remains visible solely so the customer can remove it.
      return { ...line, availability: "out-of-stock", problem };
    };
    let product;
    try { product = await catalog.getProduct(line.productId); }
    catch (error) {
      if (error instanceof AppError && error.kind === "not_found") return unavailable("This product is no longer available. Remove it to continue.");
      throw error;
    }
    const variant = product.variants.find((item) => item.id === line.variantId);
    if (!variant) return unavailable("This variant is no longer available. Remove it to continue.");
    if (variant.price.currency !== market.currency || !Number.isFinite(variant.price.amount) || variant.price.amount <= 0) return unavailable("This variant cannot currently be priced. Remove it to continue.");
    const priced: CartLine = { ...line, sku: variant.sku, name: product.name, variantLabel: variant.label, image: variant.image, unitPrice: variant.price, lineTotal: money(variant.price.amount * line.quantity), availability: variant.availability };
    delete priced.problem;
    const problem = variant.availability !== "in-stock"
      ? "This variant is unavailable. Remove it to continue."
      : line.quantity > variant.maxQuantity ? `Maximum quantity for this variant is ${variant.maxQuantity}` : undefined;
    if (problem && strict) throw new AppError("validation", problem);
    return problem ? { ...priced, problem } : priced;
  }
  async function reprice(cart: Cart, strict: boolean | string[] = false): Promise<Cart> {
    const lines = await Promise.all(cart.lines.map((line) => priceLine(line, strict === true || (Array.isArray(strict) && strict.includes(line.id)))));
    const subtotalCents = Math.round(lines.reduce((sum, line) => sum + line.lineTotal.amount, 0) * 100);
    const discountCents = market.id === "au" && cart.couponCode === "DEMO10" ? Math.round(subtotalCents / 10) : 0;
    return { ...cart, lines, subtotal: money(subtotalCents / 100), discount: cart.couponCode === "DEMO10" && market.id === "au" ? money(discountCents / 100) : undefined, total: money((subtotalCents - discountCents) / 100) };
  }
  function appendItems(current: Cart, items: AddCartLineInput[]): string[] {
    if (!Array.isArray(items) || items.length < 1 || items.length > 2) throw new AppError("validation", "Add one or two items at a time");
    return items.map(input => {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new AppError("validation", "Quantity must be a positive integer");
      const existing = current.lines.find(line => line.productId === input.productId && line.variantId === input.variantId);
      if (existing) { existing.quantity += input.quantity; return existing.id; }
      const lineId = randomUUID();
      current.lines.push({ id: lineId, productId: input.productId, variantId: input.variantId, quantity: input.quantity } as CartLine);
      return lineId;
    });
  }
  async function mutate(cartId: string, options: CartMutationOptions, payload: unknown, change: (cart: Cart) => string[]): Promise<Cart> {
    const key = requestKey(options); const hash = signature(payload);
    return transaction(pool, async (db) => {
      const cart = await readCart(db, cartId, true);
      const prior = (await db.query("SELECT signature, result FROM commerce_mutations WHERE cart_id = $1 AND request_key = $2", [cartId, key])).rows[0];
      if (prior) {
        if (prior.signature !== hash) throw new AppError("conflict", "Request key already used for another operation");
        return prior.result as Cart;
      }
      if (cart.lockedCheckoutId) throw new AppError("conflict", "Cart is locked for payment");
      const changedLineIds = change(cart);
      const updated = await reprice({ ...cart, revision: cart.revision + 1 }, changedLineIds);
      await saveCart(db, updated);
      await db.query("INSERT INTO commerce_mutations(cart_id, request_key, signature, result) VALUES ($1, $2, $3, $4)", [cartId, key, hash, JSON.stringify(updated)]);
      return updated;
    });
  }
  const cart: CartPort = {
    async createCart(options) {
      const key = requestKey(options);
      const created: Cart = { id: randomUUID(), market: market.id, revision: 0, lines: [], subtotal: money(0), total: money(0) };
      const { rows } = await pool.query("INSERT INTO commerce_carts(id, market, creation_key, data) VALUES ($1, $2, $3, $4) ON CONFLICT (market, creation_key) DO UPDATE SET creation_key = EXCLUDED.creation_key RETURNING data", [created.id, market.id, key, JSON.stringify(created)]);
      return rows[0].data as Cart;
    },
    async findCartByCreationKey(idempotencyKey) {
      const key = requestKey({ idempotencyKey });
      const { rows } = await pool.query("SELECT data FROM commerce_carts WHERE market = $1 AND creation_key = $2", [market.id, key]);
      return rows[0] ? rows[0].data as Cart : null;
    },
    async hasMutation(cartId, idempotencyKey) {
      const key = requestKey({ idempotencyKey });
      const { rows } = await pool.query("SELECT 1 FROM commerce_mutations AS mutation JOIN commerce_carts AS cart ON cart.id = mutation.cart_id WHERE mutation.cart_id = $1 AND mutation.request_key = $2 AND cart.market = $3", [cartId, key, market.id]);
      return rows.length > 0;
    },
    async getCart(id) {
      const current = await readCart(pool, id);
      // The locked cart is the immutable quoted snapshot. Unlocked reads always use current catalogue prices.
      return current.lockedCheckoutId ? current : reprice(current);
    },
    addItem(id, input, options) {
      return mutate(id, options, ["add", input.productId, input.variantId, input.quantity], current => appendItems(current, [input]));
    },
    addItems(id, items, options) {
      return mutate(id, options, ["addItems", items], current => appendItems(current, items));
    },
    updateItem(id, lineId, quantity, options) {
      return mutate(id, options, ["update", lineId, quantity], (current) => {
        if (!Number.isInteger(quantity)) throw new AppError("validation", "Quantity must be an integer");
        const line = current.lines.find((item) => item.id === lineId);
        if (!line) throw new AppError("not_found", "Cart line not found");
        if (quantity <= 0) { current.lines = current.lines.filter((item) => item.id !== lineId); return []; }
        line.quantity = quantity;
        return [lineId];
      });
    },
    removeItem(id, lineId, options) { return mutate(id, options, ["remove", lineId], (current) => { current.lines = current.lines.filter((line) => line.id !== lineId); return []; }); },
    applyCoupon(id, code, options) {
      const normalized = code.trim().toUpperCase();
      return mutate(id, options, ["coupon", normalized], current => {
        if (market.id !== "au") throw new AppError("validation", "Demo coupons are available in AU only");
        if (normalized && normalized !== "DEMO10") throw new AppError("validation", normalized === "EXPIRED10" ? "This demo coupon has expired" : "This demo coupon is not valid");
        if (normalized && !current.lines.length) throw new AppError("validation", "Add an item before applying a demo coupon");
        if (normalized) current.couponCode = normalized;
        else delete current.couponCode;
        return [];
      });
    },
  };

  async function readCheckout(db: CommerceQuery, cartId: string, id: string): Promise<StoredCheckout> {
    const { rows } = await db.query("SELECT * FROM commerce_checkouts WHERE id = $1 AND cart_id = $2 AND market = $3", [id, cartId, market.id]);
    if (!rows[0]) throw new AppError("not_found", "Checkout not found");
    return rowCheckout(rows[0]);
  }
  function verifySession(stored: StoredCheckout, session: PaymentSession) {
    const current = stored.checkout;
    if (session.livemode || session.checkoutId !== current.id || session.cartId !== current.cartId || session.market !== current.market || session.total.currency !== current.total.currency || session.total.amount !== current.total.amount || (stored.sessionId && stored.sessionId !== session.id)) {
      throw new AppError("conflict", "Payment session does not match the frozen checkout");
    }
  }
  async function applySession(cartId: string, checkoutId: string, session: PaymentSession): Promise<Checkout> {
    return transaction(pool, async (db) => {
      const currentCart = await readCart(db, cartId, true);
      const stored = await readCheckout(db, cartId, checkoutId);
      verifySession(stored, session);
      const current = stored.checkout;
      if (current.status === "paid") return current; // terminal, even for delayed expiration events
      if (session.paid && session.status !== "complete") throw new AppError("conflict", "Inconsistent payment status");
      if (session.paid) {
        if (current.status === "expired" || currentCart.lockedCheckoutId !== current.id) throw new AppError("conflict", "Terminal checkout requires manual reconciliation");
        const order: Order = { id: randomUUID(), checkoutId: current.id, cartId, market: market.id, status: "paid", lines: current.lines, subtotal: current.subtotal, discount: current.discount, couponCode: current.couponCode, total: current.total, contact: current.contact, address: current.address, createdAt: now().toISOString() };
        await db.query("INSERT INTO commerce_orders(id, checkout_id, cart_id, market, data) VALUES ($1, $2, $3, $4, $5)", [order.id, current.id, cartId, market.id, JSON.stringify(order)]);
        current.status = "paid"; current.orderId = order.id; delete current.paymentUrl;
        currentCart.lines = []; currentCart.subtotal = money(0); currentCart.total = money(0); currentCart.revision += 1; delete currentCart.lockedCheckoutId; delete currentCart.couponCode; delete currentCart.discount;
        await saveCart(db, currentCart);
      } else if (session.status === "expired") {
        current.status = "expired"; delete current.paymentUrl;
        if (currentCart.lockedCheckoutId === current.id) { delete currentCart.lockedCheckoutId; currentCart.revision += 1; await saveCart(db, currentCart); }
      } else if (current.status !== "expired") {
        current.status = "open";
        current.paymentUrl = session.status === "open" ? session.url : undefined;
      }
      await db.query("UPDATE commerce_checkouts SET data = $1, session_id = $2 WHERE id = $3", [JSON.stringify(current), session.id, current.id]);
      return current;
    });
  }
  async function ensureSession(cartId: string, checkoutId: string): Promise<StoredCheckout> {
    const stored = await readCheckout(pool, cartId, checkoutId);
    if (stored.sessionId || stored.checkout.status === "paid" || stored.checkout.status === "expired") return stored;
    // Stripe may prune idempotency records after 24h. Leave uncertain attempts locked, never recreate.
    if (now().getTime() - stored.firstAttempt >= IDEMPOTENCY_WINDOW_MS) {
      throw new AppError("conflict", "Payment creation requires manual reconciliation", { publicMessage: "Payment status is uncertain. Your cart remains protected; contact support with the checkout reference." });
    }
    const session = await payment.createSession(stored.request, `checkout:${stored.checkout.id}`);
    verifySession(stored, session);
    await applySession(cartId, checkoutId, session);
    return readCheckout(pool, cartId, checkoutId);
  }
  const checkout: CheckoutPort = {
    async start(cartId, supplied: CheckoutInput, options) {
      if (market.id !== "au" || market.currency !== "AUD") throw new AppError("validation", "Sandbox checkout is only available in Australia");
      const parsed = checkoutInputSchema.safeParse(supplied);
      if (!parsed.success) throw new AppError("validation", "Enter a valid Australian contact and shipping address");
      const input = parsed.data; const key = requestKey(options); const hash = signature(input);
      const checkoutId = await transaction(pool, async (db) => {
        const current = await readCart(db, cartId, true);
        const prior = (await db.query("SELECT signature, checkout_id FROM commerce_checkout_requests WHERE cart_id = $1 AND request_key = $2", [cartId, key])).rows[0];
        if (prior) {
          if (prior.signature !== hash) throw new AppError("conflict", "Request key already used for another checkout");
          return prior.checkout_id as string;
        }
        const existing = (await db.query("SELECT * FROM commerce_checkouts WHERE cart_id = $1 AND revision = $2", [cartId, input.revision])).rows[0];
        let id: string;
        if (existing) {
          if (existing.input_signature !== hash) throw new AppError("conflict", "This cart revision already has a different checkout");
          id = existing.id as string;
        } else {
          if (current.revision !== input.revision || current.lockedCheckoutId) throw new AppError("conflict", "Cart changed or is locked");
          const priced = await reprice(current, true);
          if (!priced.lines.length) throw new AppError("validation", "Your cart is empty");
          const total = priced.total ?? priced.subtotal;
          if (total.amount !== input.expectedTotal.amount || total.currency !== input.expectedTotal.currency) throw new AppError("conflict", "Prices changed; review your cart before continuing", { publicMessage: "Prices changed. Refresh your cart and review the new total before continuing." });
          id = randomUUID();
          const createdAt = now();
          const created: Checkout = { id, cartId, market: market.id, revision: current.revision, status: "creating", lines: priced.lines, subtotal: priced.subtotal, discount: priced.discount, couponCode: priced.couponCode, total, contact: input.contact, address: input.address, createdAt: createdAt.toISOString() };
          const returnUrl = `${site.origin}/${market.id}/checkout/return?checkoutId=${id}`;
          const request: PaymentRequest = { checkoutId: id, cartId, market: "au", total: created.total, email: input.contact.email, expiresAt: Math.floor(createdAt.getTime() / 1000) + 23 * 60 * 60, successUrl: returnUrl, cancelUrl: `${returnUrl}&cancelled=1` };
          await db.query("INSERT INTO commerce_checkouts(id, cart_id, market, revision, input_signature, data, payment_request, first_attempt_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [id, cartId, market.id, current.revision, hash, JSON.stringify(created), JSON.stringify(request), createdAt.toISOString()]);
          await saveCart(db, { ...priced, lockedCheckoutId: id });
        }
        await db.query("INSERT INTO commerce_checkout_requests(cart_id, request_key, signature, checkout_id) VALUES ($1, $2, $3, $4)", [cartId, key, hash, id]);
        return id;
      });
      return (await ensureSession(cartId, checkoutId)).checkout;
    },
    async get(cartId, id) { return (await readCheckout(pool, cartId, id)).checkout; },
    async reconcile(cartId, id) {
      const stored = await ensureSession(cartId, id);
      if (stored.checkout.status === "paid" || stored.checkout.status === "expired") return stored.checkout;
      return applySession(cartId, id, await payment.retrieveSession(stored.sessionId!));
    },
    async cancel(cartId, id) {
      const stored = await ensureSession(cartId, id);
      if (stored.checkout.status === "paid" || stored.checkout.status === "expired") return stored.checkout;
      const before = await payment.retrieveSession(stored.sessionId!);
      verifySession(stored, before);
      if (before.status === "open") await payment.expireSession(stored.sessionId!);
      return applySession(cartId, id, await payment.retrieveSession(stored.sessionId!));
    },
  };
  const orders: OrderPort = {
    async list(cartId) {
      await readCart(pool, cartId);
      const { rows } = await pool.query("SELECT data FROM commerce_orders WHERE cart_id = $1 AND market = $2 ORDER BY data->>'createdAt' DESC", [cartId, market.id]);
      return rows.map((row) => row.data as Order);
    },
    async get(cartId, id) {
      const { rows } = await pool.query("SELECT data FROM commerce_orders WHERE id = $1 AND cart_id = $2 AND market = $3", [id, cartId, market.id]);
      if (!rows[0]) throw new AppError("not_found", "Order not found");
      return rows[0].data as Order;
    },
  };
  return { cart, checkout, orders, async handlePaymentEvent(event) {
    if (event.market !== market.id) throw new AppError("not_found", "Payment market not found");
    const row = (await pool.query("SELECT cart_id FROM commerce_checkouts WHERE id = $1 AND market = $2", [event.checkoutId, market.id])).rows[0];
    if (!row) throw new AppError("not_found", "Checkout not found");
    const cartId = row.cart_id as string;
    // A verified event supplies a session ID even if creation succeeded before our DB write failed.
    // Never create a session from a webhook: retrieve and validate the existing provider object.
    const session = await payment.retrieveSession(event.sessionId);
    if (session.id !== event.sessionId) throw new AppError("conflict", "Webhook session identity mismatch");
    await applySession(cartId, event.checkoutId, session);
  } };
}
