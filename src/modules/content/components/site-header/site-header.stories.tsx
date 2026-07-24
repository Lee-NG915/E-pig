import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";
import {
  addItem,
  getCartSnapshot,
  setCartOpen,
  setQuantity,
  type CartMarketIdentity,
  type DemoCartProduct,
} from "@/modules/cart/lib/cart-store";

import { SiteHeader } from "./site-header";

const market: CartMarket = { id: "sb-site-header", currency: "AUD", locale: "en-AU" };

const demoProduct: DemoCartProduct = {
  id: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  colour: "Moss weave",
  image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80",
  price: { amount: 2890, currency: "AUD" },
};

function resetCart(target: CartMarketIdentity) {
  for (const line of getCartSnapshot(target).lines) {
    setQuantity(target, line.productId, 0);
  }
  setCartOpen(target, false);
}

const meta = {
  title: "Modules/content/SiteHeader",
  component: SiteHeader,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <CartMarketProvider market={market}>
        <Story />
      </CartMarketProvider>
    ),
  ],
} satisfies Meta<typeof SiteHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 空袋：购物袋按钮无数量徽标 */
export const EmptyBag: Story = {
  loaders: [
    () => {
      resetCart(market);
    },
  ],
};

/** 袋内有商品：按钮右上角显示数量徽标 */
export const WithItems: Story = {
  loaders: [
    () => {
      resetCart(market);
      addItem(market, demoProduct);
      // addItem 会打开抽屉；本 story 不挂载抽屉，复位为关闭
      setCartOpen(market, false);
    },
  ],
};
