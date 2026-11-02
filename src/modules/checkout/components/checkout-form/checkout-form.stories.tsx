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
export const SgBrowseOnly: Story = {
  args: { market: { id: "sg", currency: "SGD" } },
};
