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
  variantCount: 1,
  defaultVariantId: "alto-default",
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

/** Curated Koala display imagery; these remain the demo's controlled test prices. */
export const WithColourPreviews: Story = {
  args: {
    product: {
      id: "tamarama-modular-sofa",
      slug: "tamarama-modular-sofa",
      name: "Tamarama Modular Sofa",
      category: "Sofas",
      colour: "Winter Cream",
      price: { amount: 2600, currency: "AUD" },
      image: "https://cdn.shopify.com/s/files/1/0643/6136/5640/files/TAM_WC_2S_R_01_PRODUCT.webp?v=1778828181",
      gallery: [
        { src: "https://au.koala.com/cdn/shop/files/TAM_WC_2S_S_01_LIFESTYLE.webp?v=1780387674", alt: "Winter Cream sofa in a room setting" },
      ],
      defaultVariantId: "tamarama-modular-sofa-default",
      variantCount: 4,
      variantPreviews: [
        {
          variantId: "tamarama-modular-sofa-default",
          colour: "Winter Cream",
          image: "https://cdn.shopify.com/s/files/1/0643/6136/5640/files/TAM_WC_2S_R_01_PRODUCT.webp?v=1778828181",
          gallery: [{ src: "https://au.koala.com/cdn/shop/files/TAM_WC_2S_S_01_LIFESTYLE.webp?v=1780387674", alt: "Winter Cream sofa in a room setting" }],
          price: { amount: 2600, currency: "AUD" },
        },
        {
          variantId: "tamarama-modular-sofa-forest-walk-2-sections",
          colour: "Forest Walk",
          image: "https://cdn.shopify.com/s/files/1/0643/6136/5640/files/TAM_FW_2S_R_01_PRODUCT_b09ee6dc-1684-4022-a090-8a72294dd978.png?v=1778477102",
          gallery: [{ src: "https://au.koala.com/cdn/shop/files/TAM_FW_2S_S_01_LIFESTYLE.webp?v=1780387811", alt: "Forest Walk sofa in a room setting" }],
          price: { amount: 2600, currency: "AUD" },
        },
      ],
    },
  },
};
