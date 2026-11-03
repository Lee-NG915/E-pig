import type { Meta, StoryObj } from "@storybook/react-vite";
import { cartQueryKey, getStorefrontQueryClient } from "../../lib/cart-store";
import { CartPanel } from "./cart-panel";
import { cartFixture, marketFixture } from "./cart-panel.mock";
const meta = {
  title: "Modules/cart/CartPanel",
  component: CartPanel,
  args: { market: marketFixture },
  beforeEach: () => {
    getStorefrontQueryClient().setQueryDefaults(cartQueryKey(marketFixture), {
      staleTime: Infinity,
    });
    getStorefrontQueryClient().setQueryData(cartQueryKey(marketFixture), {
      cart: cartFixture,
      checkoutEnabled: true,
    });
  },
} satisfies Meta<typeof CartPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const DemoCoupon: Story = {
  beforeEach: () => {
    getStorefrontQueryClient().setQueryData(cartQueryKey(marketFixture), {
      cart: { ...cartFixture, couponCode: "DEMO10", discount: { amount: 2, currency: "AUD" }, total: { amount: 18, currency: "AUD" } },
      checkoutEnabled: true,
    });
  },
};
export const SelectedVariant: Story = {
  beforeEach: () => {
    getStorefrontQueryClient().setQueryData(cartQueryKey(marketFixture), {
      cart: {
        ...cartFixture,
        lines: [{
          ...cartFixture.lines[0],
          variantLabel: "3 Sections / Regular / Forest Walk · Sandbox option",
          image: "https://cdn.shopify.com/s/files/1/0643/6136/5640/files/TAM_FW_2S_R_01_PRODUCT_b09ee6dc-1684-4022-a090-8a72294dd978.png?v=1778477102",
        }],
      },
      checkoutEnabled: true,
    });
  },
};
export const DrawerWidth: Story = {
  args: { compact: true },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
};
export const Locked: Story = {
  beforeEach: () => {
    getStorefrontQueryClient().setQueryData(cartQueryKey(marketFixture), {
      cart: { ...cartFixture, lockedCheckoutId: "checkout-1" },
      checkoutEnabled: true,
    });
  },
};
export const Empty: Story = {
  beforeEach: () => {
    getStorefrontQueryClient().setQueryData(cartQueryKey(marketFixture), {
      cart: null,
      checkoutEnabled: true,
    });
  },
};
