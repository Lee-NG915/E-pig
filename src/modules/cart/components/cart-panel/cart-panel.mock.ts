import type { Cart } from "@/core/contracts/commerce/cart";
export const marketFixture = { id: "au", currency: "AUD" };
export const cartFixture: Cart = {
  id: "cart-1",
  market: "au",
  revision: 2,
  lines: [
    {
      id: "line-1",
      productId: "alto",
      variantId: "alto-small",
      variantLabel: "Compact / sandbox",
      name: "Alto Sofa",
      quantity: 2,
      unitPrice: { amount: 10, currency: "AUD" },
      lineTotal: { amount: 20, currency: "AUD" },
    },
  ],
  subtotal: { amount: 20, currency: "AUD" },
};
