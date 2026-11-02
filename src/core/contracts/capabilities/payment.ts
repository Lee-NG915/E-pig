import type { Money } from "../commerce/catalog";

export type PaymentRequest = {
  checkoutId: string;
  cartId: string;
  market: "au";
  total: Money;
  email: string;
  expiresAt: number;
  successUrl: string;
  cancelUrl: string;
};
export type PaymentSession = {
  id: string;
  checkoutId: string;
  cartId: string;
  market: string;
  total: Money;
  status: "open" | "complete" | "expired";
  paid: boolean;
  livemode: boolean;
  url?: string;
};
/** Only produced after signature verification; the service still retrieves authoritative state. */
export type PaymentEvent = { id: string; sessionId: string; checkoutId: string; market: string };
export interface PaymentPort {
  createSession(input: PaymentRequest, idempotencyKey: string): Promise<PaymentSession>;
  retrieveSession(sessionId: string): Promise<PaymentSession>;
  expireSession(sessionId: string): Promise<PaymentSession>;
  parseWebhook(rawBody: string, signature: string): PaymentEvent | null;
}
