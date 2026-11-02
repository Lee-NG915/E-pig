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
