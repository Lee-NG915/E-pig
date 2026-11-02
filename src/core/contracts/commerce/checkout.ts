import { z } from "zod";
import type { Money } from "./catalog";
import type { CartLine, CartMutationOptions } from "./cart";

/** AU-only sandbox address; no fulfilment or tax calculation is implied. */
export const checkoutInputSchema = z.object({
  revision: z.number().int().nonnegative(),
  expectedTotal: z.object({ amount: z.number().finite().positive(), currency: z.literal("AUD") }),
  contact: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    phone: z.string().trim().max(40).optional(),
  }),
  address: z.object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(100),
    state: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]),
    postalCode: z.string().regex(/^\d{4}$/, "Enter a four-digit Australian postcode"),
    country: z.literal("AU"),
  }),
});


export type CheckoutContact = { name: string; email: string; phone?: string };
export type CheckoutAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: "AU";
};
export type CheckoutInput = {
  revision: number;
  expectedTotal: Money;
  contact: CheckoutContact;
  address: CheckoutAddress;
};
export type Checkout = {
  id: string;
  cartId: string;
  market: string;
  revision: number;
  status: "creating" | "open" | "paid" | "expired";
  lines: CartLine[];
  total: Money;
  contact: CheckoutContact;
  address: CheckoutAddress;
  paymentUrl?: string;
  orderId?: string;
  createdAt: string;
};
export interface CheckoutPort {
  start(cartId: string, input: CheckoutInput, options: CartMutationOptions): Promise<Checkout>;
  get(cartId: string, checkoutId: string): Promise<Checkout>;
  reconcile(cartId: string, checkoutId: string): Promise<Checkout>;
  /** Expire at provider and verify terminal state before unlocking. URL visits never cancel. */
  cancel(cartId: string, checkoutId: string): Promise<Checkout>;
}
