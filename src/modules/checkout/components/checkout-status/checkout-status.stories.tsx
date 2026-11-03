import type { Meta, StoryObj } from "@storybook/react-vite";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import {
  cartFixture,
  marketFixture,
} from "@/modules/cart/components/cart-panel/cart-panel.mock";
import { CheckoutStatus } from "./checkout-status";
const checkout = {
  id: "story-checkout",
  cartId: cartFixture.id,
  market: "au",
  revision: 2,
  status: "open",
  lines: cartFixture.lines,
  total: cartFixture.subtotal,
  contact: { name: "Sandbox Buyer", email: "test@example.com" },
  address: {
    line1: "1 Test Street",
    city: "Sydney",
    state: "NSW",
    postalCode: "2000",
    country: "AU",
  },
  createdAt: "2026-11-02T00:00:00Z",
};
const meta = {
  title: "Modules/checkout/CheckoutStatus",
  component: CheckoutStatus,
  args: { market: marketFixture, checkoutId: "story-checkout" },
  beforeEach: () => {
    getStorefrontQueryClient().setQueryDefaults(
      ["checkout", "au", "story-checkout"],
      { staleTime: Infinity },
    );
    getStorefrontQueryClient().setQueryData(
      ["checkout", "au", "story-checkout"],
      { checkout },
    );
  },
} satisfies Meta<typeof CheckoutStatus>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {};
export const DemoCoupon: Story = {
  beforeEach: () => {
    getStorefrontQueryClient().setQueryData(["checkout", "au", "story-checkout"], {
      checkout: { ...checkout, subtotal: checkout.total, couponCode: "DEMO10", discount: { amount: 2, currency: "AUD" }, total: { amount: 18, currency: "AUD" } },
    });
  },
};
export const Paid: Story = {
  beforeEach: () => {
    getStorefrontQueryClient().setQueryData(
      ["checkout", "au", "story-checkout"],
      { checkout: { ...checkout, status: "paid", orderId: "story-order" } },
    );
  },
};
