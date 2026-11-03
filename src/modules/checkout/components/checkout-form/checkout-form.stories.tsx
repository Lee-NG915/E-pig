import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  cartQueryKey,
  getStorefrontQueryClient,
} from "@/modules/cart/lib/cart-store";
import {
  cartFixture,
  marketFixture,
} from "@/modules/cart/components/cart-panel/cart-panel.mock";
import { CheckoutForm } from "./checkout-form";
const meta = {
  title: "Modules/checkout/CheckoutForm",
  component: CheckoutForm,
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
} satisfies Meta<typeof CheckoutForm>;
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
          variantLabel: "2 Sections / Regular / Forest Walk · Sandbox option",
          image: "https://cdn.shopify.com/s/files/1/0643/6136/5640/files/TAM_FW_2S_R_01_PRODUCT_b09ee6dc-1684-4022-a090-8a72294dd978.png?v=1778477102",
        }],
      },
      checkoutEnabled: true,
    });
  },
};
export const SgBrowseOnly: Story = {
  args: { market: { id: "sg", currency: "SGD" } },
};
