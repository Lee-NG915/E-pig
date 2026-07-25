import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";
import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";

import { ProductCard } from "./product-card";

/** story 专属 market：与 app（au/sg/us）及其它 story 的 demo cart 互不影响。 */
const market: CartMarket = { id: "au", currency: "AUD" };

const product: ProductListItem = {
  id: "alto-modular-sofa",
  slug: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  category: "Sofas",
  colour: "Moss weave",
  image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=85",
  price: { amount: 2890, currency: "AUD" },
};

const meta = {
  title: "Modules/catalog/ProductCard",
  component: ProductCard,
  args: { product },
  decorators: [
    (Story) => (
      <CartMarketProvider market={market}>
        <div className="w-full max-w-xs">
          <Story />
        </div>
      </CartMarketProvider>
    ),
  ],
} satisfies Meta<typeof ProductCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** badge 徽标 + compareAt 划线价同时出现 */
export const WithBadgeAndCompareAt: Story = {
  args: {
    product: {
      ...product,
      badge: "Bestseller",
      compareAt: { amount: 3490, currency: "AUD" },
    },
  },
};
