import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  addItem,
  getCartSnapshot,
  setCartOpen,
  setQuantity,
  type CartMarketIdentity,
  type DemoCartProduct,
} from "@/modules/cart/lib/cart-store";

import type { CartMarket } from "../cart-market-context/cart-market-context";
import { CartSheetMount } from "./cart-sheet-mount";

const market: CartMarket = { id: "sb-cart-sheet-mount", currency: "AUD", locale: "en-AU" };

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

const demoChildren = (
  <p className="p-6 text-sm text-muted-foreground">
    页面内容（children）。抽屉关闭时 CartSheetMount 只渲染 children，不提供任何额外 context。
  </p>
);

const meta = {
  title: "Modules/cart/CartSheetMount",
  component: CartSheetMount,
  // 含 portal 弹层的打开态，不用 autodocs 聚合页。
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { market, children: demoChildren },
} satisfies Meta<typeof CartSheetMount>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 默认关闭：只渲染 children */
export const Closed: Story = {
  loaders: [
    () => {
      resetCart(market);
    },
  ],
};

/** 打开且有行项目：children 之上叠出抽屉 */
export const OpenWithLines: Story = {
  loaders: [
    () => {
      resetCart(market);
      addItem(market, demoProduct);
    },
  ],
};
