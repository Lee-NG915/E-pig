import "server-only";
import Stripe from "stripe";
import type { Money } from "@/core/contracts/commerce/catalog";
import type { PaymentPort, PaymentSession } from "@/core/contracts/capabilities/payment";
import { AppError } from "@/core/errors/errors";

/** Money remains main units everywhere else. Only this provider boundary converts to cents. */
export function toMinorUnits(money: Money): number {
  const scaled = money.amount * 100;
  const minor = Math.round(scaled);
  if (money.currency !== "AUD" || !Number.isFinite(scaled) || minor < 1 || minor > 99_999_999 || Math.abs(scaled - minor) > 0.000001) {
    throw new AppError("validation", "Sandbox payments require positive AUD amounts with at most two decimal places");
  }
  return minor;
}

function normalize(session: Stripe.Checkout.Session): PaymentSession {
  const metadata = session.metadata;
  if (
    session.livemode || session.mode !== "payment" || session.currency !== "aud" ||
    !Number.isSafeInteger(session.amount_total) || session.amount_total! <= 0 ||
    !metadata?.checkoutId || !metadata.cartId || metadata.market !== "au" ||
    session.client_reference_id !== metadata.checkoutId ||
    !session.payment_method_types.length || session.payment_method_types.some((method) => method !== "card") ||
    !session.status || !["open", "complete", "expired"].includes(session.status)
  ) throw new AppError("upstream", "Stripe returned an unsupported payment session");
  if (session.url) {
    const url = new URL(session.url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password) {
      throw new AppError("upstream", "Stripe returned an invalid hosted payment URL");
    }
  }
  if (session.status === "open" && !session.url) throw new AppError("upstream", "Stripe returned no hosted payment URL");
  return {
    id: session.id,
    checkoutId: metadata.checkoutId,
    cartId: metadata.cartId,
    market: metadata.market,
    total: { amount: session.amount_total! / 100, currency: "AUD" },
    status: session.status === "open" ? "open" : session.status === "complete" ? "complete" : "expired",
    paid: session.payment_status === "paid",
    livemode: false,
    url: session.url ?? undefined,
  };
}

export function createStripePaymentAdapter({ secretKey, webhookSecret, client }: {
  secretKey: string; webhookSecret: string; client?: Stripe;
}): PaymentPort {
  if (!secretKey.startsWith("sk_test_") || !webhookSecret.startsWith("whsec_")) {
    throw new AppError("upstream", "Stripe sandbox credentials are not configured");
  }
  const stripe = client ?? new Stripe(secretKey, { apiVersion: "2026-10-28.endive", maxNetworkRetries: 2, timeout: 15_000 });
  async function call(operation: () => Promise<Stripe.Checkout.Session>): Promise<PaymentSession> {
    try { return normalize(await operation()); }
    catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("upstream", "Unable to verify sandbox payment status", { cause: error, retryable: true });
    }
  }
  return {
    async createSession(input, idempotencyKey) {
      if (input.market !== "au") throw new AppError("validation", "Sandbox checkout only supports Australia");
      const unitAmount = toMinorUnits(input.total);
      return call(() => stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "hosted_page",
        // Current Endive API replaced payment_method_types with an allow-list filter.
        allowed_payment_method_types: ["card"],
        adaptive_pricing: { enabled: false },
        automatic_tax: { enabled: false },
        allow_promotion_codes: false,
        line_items: [{ quantity: 1, price_data: { currency: "aud", unit_amount: unitAmount, product_data: { name: "E-pig sandbox order" } } }],
        client_reference_id: input.checkoutId,
        metadata: { checkoutId: input.checkoutId, cartId: input.cartId, market: input.market },
        customer_email: input.email,
        expires_at: input.expiresAt,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      }, { idempotencyKey }));
    },
    retrieveSession(id) { return call(() => stripe.checkout.sessions.retrieve(id)); },
    expireSession(id) { return call(() => stripe.checkout.sessions.expire(id)); },
    parseWebhook(rawBody, signature) {
      let event: Stripe.Event;
      try { event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret); }
      catch (error) { throw new AppError("unauthorized", "Invalid Stripe webhook signature", { cause: error }); }
      if (event.livemode) throw new AppError("unauthorized", "Live payment events are not accepted");
      if (!["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(event.type)) return null;
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.livemode || !session.id || !session.metadata?.checkoutId || session.metadata.market !== "au") throw new AppError("validation", "Invalid checkout event metadata");
      return { id: event.id, sessionId: session.id, checkoutId: session.metadata.checkoutId, market: session.metadata.market };
    },
  };
}
