import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  cartQueryKey,
  getStorefrontQueryClient,
  setCartOpen,
} from "../../lib/cart-store";
import { CartMarketProvider } from "../cart-market-context/cart-market-context";
import { cartFixture, marketFixture } from "../cart-panel/cart-panel.mock";
import { CartSheet } from "./cart-sheet";
const meta = {
  title: "Modules/cart/CartSheet",
  component: CartSheet,
  tags: ["!autodocs"],
  decorators: [
    (Story) => (
      <CartMarketProvider market={marketFixture}>
        <Story />
      </CartMarketProvider>
    ),
  ],
  beforeEach: () => {
    getStorefrontQueryClient().setQueryDefaults(cartQueryKey(marketFixture), {
      staleTime: Infinity,
    });
    setCartOpen(marketFixture, true);
  },
} satisfies Meta<typeof CartSheet>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithLines: Story = {
  beforeEach: () => {
    getStorefrontQueryClient().setQueryData(cartQueryKey(marketFixture), {
      cart: cartFixture,
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

export const KeyboardFocusReturn: Story = {
  beforeEach: () => {
    getStorefrontQueryClient().setQueryData(cartQueryKey(marketFixture), {
      cart: null,
      checkoutEnabled: true,
    });
    setCartOpen(marketFixture, false);
  },
  render: () => (
    <>
      <button
        className="m-6 rounded-md bg-primary px-5 py-3 text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
        data-cart-trigger={marketFixture.id}
        onClick={(event) =>
          setCartOpen(marketFixture, true, event.currentTarget)
        }
      >
        Open bag and return focus with Escape
      </button>
      <CartSheet />
    </>
  ),
};
