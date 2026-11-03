import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ProductListItem } from "@/core/contracts/commerce/catalog";
import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";

import { ProductList } from "./product-list";

const market: CartMarket = { id: "au", currency: "AUD" };

const products: ProductListItem[] = [
  {
    id: "alto-modular-sofa",
    slug: "alto-modular-sofa",
    name: "Alto Modular Sofa",
    category: "Sofas",
    colour: "Moss weave",
    image:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=85",
    price: { amount: 2890, currency: "AUD" },
    badge: "Bestseller",
    compareAt: { amount: 3290, currency: "AUD" },
  },
  {
    id: "cove-lounge-chair",
    slug: "cove-lounge-chair",
    name: "Cove Lounge Chair",
    category: "Lounge chairs",
    colour: "Oat boucle",
    image:
      "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1200&q=85",
    price: { amount: 890, currency: "AUD" },
    badge: "New",
  },
  {
    id: "nook-coffee-table",
    slug: "nook-coffee-table",
    name: "Nook Coffee Table",
    category: "Tables",
    colour: "Smoked ash",
    image:
      "https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=1200&q=85",
    price: { amount: 590, currency: "AUD" },
  },
];

const meta = {
  title: "Modules/catalog/ProductList",
  component: ProductList,
  args: {
    products,
    collection: { handle: "living-room", title: "Living Room" },
    marketId: market.id,
    availableColours: ["Moss weave", "Oat boucle", "Smoked ash"],
  },
  decorators: [
    (Story) => (
      <CartMarketProvider market={market}>
        <Story />
      </CartMarketProvider>
    ),
  ],
} satisfies Meta<typeof ProductList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SortedByName: Story = {
  args: { sort: "name" },
};

export const Empty: Story = {
  args: { products: [] },
};

export const NoFilterMatches: Story = { args: { products: [], sort: "price-asc", filters: { colours: ["Moss weave"], maxPrice: 100 } } };
export const InvalidFilter: Story = { args: { products: [], filterIssues: ["Minimum price must be a number from 0 to 1,000,000."] } };

/** Toggle between the two mobile densities; desktop columns stay unchanged. */
export const MobileDensity: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
