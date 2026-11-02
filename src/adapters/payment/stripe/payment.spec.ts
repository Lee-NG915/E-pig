import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import type { PaymentRequest } from "@/core/contracts/capabilities/payment";
import { createStripePaymentAdapter, toMinorUnits } from "./payment";

const request: PaymentRequest = { checkoutId: "checkout-1", cartId: "cart-1", market: "au", total: { amount: 12.34, currency: "AUD" }, email: "guest@example.com", expiresAt: 1793653200, successUrl: "https://shop.example/au/checkout/return", cancelUrl: "https://shop.example/au/checkout/return?cancelled=1" };
const secretKey = "sk_test_fixture_not_a_real_key";
const webhookSecret = "whsec_fixture_not_a_real_secret";
function fixture() {
  const client = new Stripe(secretKey);
  const session = { id: "cs_test_1", livemode: false, mode: "payment", status: "open", payment_status: "unpaid", amount_total: 1234, currency: "aud", metadata: { checkoutId: "checkout-1", cartId: "cart-1", market: "au" }, client_reference_id: "checkout-1", payment_method_types: ["card"], url: "https://checkout.stripe.com/c/pay/cs_test_1" } as unknown as Stripe.Checkout.Session;
  const response = session as Stripe.Response<Stripe.Checkout.Session>;
  vi.spyOn(client.checkout.sessions, "create").mockResolvedValue(response);
  vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(response);
  const adapter = createStripePaymentAdapter({ secretKey, webhookSecret, client });
  return { adapter, client, session };
}
describe("Stripe sandbox boundary", () => {
  it("converts main units exactly once and refuses unsupported currencies/precision", () => {
    expect(toMinorUnits({ amount: 12.34, currency: "AUD" })).toBe(1234);
    expect(toMinorUnits({ amount: 0.29, currency: "AUD" })).toBe(29);
    expect(() => toMinorUnits({ amount: 1.005, currency: "AUD" })).toThrow();
    expect(() => toMinorUnits({ amount: 12, currency: "USD" })).toThrow();
  });
  it("fails closed on missing or live credentials", () => {
    expect(() => createStripePaymentAdapter({ secretKey: "sk_live_fake", webhookSecret })).toThrow();
    expect(() => createStripePaymentAdapter({ secretKey: "", webhookSecret })).toThrow();
  });
  it("creates hosted AUD card-only sessions with stable expiry and idempotency", async () => {
    const { adapter, client } = fixture();
    const result = await adapter.createSession(request, "checkout:checkout-1");
    expect(result.total).toEqual({ amount: 12.34, currency: "AUD" });
    expect(client.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ mode: "payment", allowed_payment_method_types: ["card"], adaptive_pricing: { enabled: false }, expires_at: request.expiresAt, line_items: [{ quantity: 1, price_data: { currency: "aud", unit_amount: 1234, product_data: { name: "E-pig sandbox order" } } }], metadata: { checkoutId: "checkout-1", cartId: "cart-1", market: "au" } }), { idempotencyKey: "checkout:checkout-1" });
  });
  it.each(["live", "currency", "payment-method", "redirect"])("rejects unexpected %s provider sessions", async (change) => {
    const { adapter, session } = fixture();
    if (change === "live") session.livemode = true;
    if (change === "currency") session.currency = "usd";
    if (change === "payment-method") session.payment_method_types = ["card", "klarna"];
    if (change === "redirect") session.url = "https://attacker.example/";
    await expect(adapter.retrieveSession(session.id)).rejects.toMatchObject({ kind: "upstream" });
  });
  it("verifies raw webhook bytes and rejects invalid signatures, reserialization and live events", () => {
    const { adapter, client, session } = fixture();
    const raw = JSON.stringify({ id: "evt_test_1", object: "event", livemode: false, type: "checkout.session.completed", data: { object: session } });
    const header = client.webhooks.generateTestHeaderString({ payload: raw, secret: webhookSecret });
    expect(adapter.parseWebhook(raw, header)).toEqual({ id: "evt_test_1", sessionId: session.id, checkoutId: "checkout-1", market: "au" });
    expect(() => adapter.parseWebhook(`${raw} `, header)).toThrow();
    expect(() => adapter.parseWebhook(raw, "invalid")).toThrow();
    const live = raw.replace('"livemode":false', '"livemode":true');
    expect(() => adapter.parseWebhook(live, client.webhooks.generateTestHeaderString({ payload: live, secret: webhookSecret }))).toThrow();
  });
});
