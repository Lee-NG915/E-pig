import type { Money } from "./catalog";
import type { CartLine } from "./cart";
import type { CheckoutAddress, CheckoutContact } from "./checkout";

export type Order = {
  id: string;
  checkoutId: string;
  cartId: string;
  market: string;
  status: "paid";
  lines: CartLine[];
  subtotal?: Money;
  discount?: Money;
  couponCode?: string;
  total: Money;
  contact: CheckoutContact;
  address: CheckoutAddress;
  createdAt: string;
};
export interface OrderPort {
  list(cartId: string): Promise<Order[]>;
  get(cartId: string, orderId: string): Promise<Order>;
}
