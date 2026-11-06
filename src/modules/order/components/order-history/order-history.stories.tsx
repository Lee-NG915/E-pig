import type { Meta, StoryObj } from "@storybook/react-vite";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import { cartFixture, marketFixture } from "@/modules/cart/components/cart-panel/cart-panel.mock";
import { OrderHistory } from "./order-history";
const meta = {
  title: "Modules/order/OrderHistory",
  component: OrderHistory,
  args: { market: marketFixture },
  beforeEach: () => {
    getStorefrontQueryClient().setQueryDefaults(["orders", "au", "list"], {
      staleTime: Infinity,
    });
    getStorefrontQueryClient().setQueryData(["orders", "au", "list"], {
      orders: [],
    });
  },
} satisfies Meta<typeof OrderHistory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const DemoCoupon: Story = {
  beforeEach: () => {
    getStorefrontQueryClient().setQueryData(["orders", "au", "list"], {
      orders: [{ id: "demo-order", status: "paid", createdAt: "2026-11-03T00:00:00Z", lines: cartFixture.lines,
        subtotal: cartFixture.subtotal, couponCode: "DEMO10", discount: { amount: 2, currency: "AUD" }, total: { amount: 18, currency: "AUD" },
      }],
    });
  },
};
export const DetailWithAfterSales: Story = {
  args: { orderId: "demo-order-detail" },
  beforeEach: () => {
    getStorefrontQueryClient().setQueryDefaults(
      ["orders", "au", "demo-order-detail"],
      { staleTime: Infinity },
    );
    getStorefrontQueryClient().setQueryData(
      ["orders", "au", "demo-order-detail"],
      {
        order: {
          id: "demo-order-detail",
          cartId: "demo-cart-detail",
          checkoutId: "demo-checkout",
          market: "au",
          status: "paid",
          createdAt: "2026-11-03T00:00:00Z",
          lines: cartFixture.lines,
          total: { amount: 18, currency: "AUD" },
          contact: { name: "Demo Buyer", email: "buyer@example.test" },
          address: {
            line1: "1 Demo Street",
            city: "Sydney",
            state: "NSW",
            postalCode: "2000",
            country: "AU",
          },
        },
      },
    );
  },
};
