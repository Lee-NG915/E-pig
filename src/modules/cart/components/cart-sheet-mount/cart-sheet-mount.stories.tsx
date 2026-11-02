import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  cartQueryKey,
  getStorefrontQueryClient,
  setCartOpen,
} from "../../lib/cart-store";
import { cartFixture, marketFixture } from "../cart-panel/cart-panel.mock";
import { CartSheetMount } from "./cart-sheet-mount";
const meta = {
  title: "Modules/cart/CartSheetMount",
  component: CartSheetMount,
  tags: ["!autodocs"],
  args: {
    market: marketFixture,
    children: <p className="p-6">Market chrome content</p>,
  },
  beforeEach: () => {
    getStorefrontQueryClient().setQueryDefaults(cartQueryKey(marketFixture), {
      staleTime: Infinity,
    });
    getStorefrontQueryClient().setQueryData(cartQueryKey(marketFixture), {
      cart: cartFixture,
      checkoutEnabled: true,
    });
    setCartOpen(marketFixture, false);
  },
} satisfies Meta<typeof CartSheetMount>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Closed: Story = {};
export const OpenWithLines: Story = {
  beforeEach: () => setCartOpen(marketFixture, true),
};
