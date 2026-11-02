import type { Meta, StoryObj } from "@storybook/react-vite";

import type { Cart } from "@/core/contracts/commerce/cart";
import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";
import {
  cartQueryKey,
  getStorefrontQueryClient,
  setCartOpen,
} from "@/modules/cart/lib/cart-store";

import { SiteHeader } from "./site-header";

const market: CartMarket = { id: "au", currency: "AUD" };
const cart: Cart = {
  id: "header-story-cart",
  market: "au",
  revision: 1,
  lines: [{
    id: "header-story-line", productId: "alto-modular-sofa", variantId: "alto-default",
    variantLabel: "Sandbox test option", name: "Alto Modular Sofa", quantity: 2,
    unitPrice: { amount: 2890, currency: "AUD" }, lineTotal: { amount: 5780, currency: "AUD" },
  }],
  subtotal: { amount: 5780, currency: "AUD" },
};

function seedCart(value: Cart | null) {
  const client = getStorefrontQueryClient();
  client.setQueryDefaults(cartQueryKey(market), { staleTime: Infinity });
  client.setQueryData(cartQueryKey(market), { cart: value, checkoutEnabled: true });
  setCartOpen(market, false);
}

const meta = {
  title: "Modules/content/SiteHeader",
  component: SiteHeader,
  parameters: { layout: "fullscreen" },
  beforeEach: () => seedCart(null),
  decorators: [
    (Story) => <CartMarketProvider market={market}><Story /></CartMarketProvider>,
  ],
} satisfies Meta<typeof SiteHeader>;

export default meta;
type Story = StoryObj<typeof meta>;
export const EmptyBag: Story = {};
export const WithItems: Story = { beforeEach: () => seedCart(cart) };
