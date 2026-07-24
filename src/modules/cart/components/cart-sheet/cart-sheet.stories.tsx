import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  addItem,
  getCartSnapshot,
  setCartOpen,
  setQuantity,
  type CartMarketIdentity,
  type DemoCartProduct,
} from "@/modules/cart/lib/cart-store";

import { CartMarketProvider, type CartMarket } from "../cart-market-context/cart-market-context";
import { CartSheet } from "./cart-sheet";

const market: CartMarket = { id: "sb-cart-sheet", currency: "AUD", locale: "en-AU" };

const demoProduct: DemoCartProduct = {
  id: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  colour: "Moss weave",
  image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80",
  price: { amount: 2890, currency: "AUD" },
};

/** 每个 story 渲染前重置本文件专属的 demo cart，保证状态矩阵可重复。 */
function resetCart(target: CartMarketIdentity) {
  for (const line of getCartSnapshot(target).lines) {
    setQuantity(target, line.productId, 0);
  }
  setCartOpen(target, false);
}

const meta = {
  title: "Modules/cart/CartSheet",
  component: CartSheet,
  // Sheet 经 portal 弹层渲染，autodocs 页会把多个打开态叠在一起，本组件只用 canvas。
  tags: ["!autodocs"],
  decorators: [
    (Story) => (
      <CartMarketProvider market={market}>
        <Story />
      </CartMarketProvider>
    ),
  ],
} satisfies Meta<typeof CartSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 空袋打开：空态文案 + Keep browsing */
export const Empty: Story = {
  loaders: [
    () => {
      resetCart(market);
      setCartOpen(market, true);
    },
  ],
};

/** 有行项目：行信息 + 步进器 + 小计 + 禁用 checkout */
export const WithLines: Story = {
  loaders: [
    () => {
      resetCart(market);
      // addItem 会把抽屉置为打开
      addItem(market, demoProduct);
    },
  ],
};
