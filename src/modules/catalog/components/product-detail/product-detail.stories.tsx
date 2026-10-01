import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ProductDetail as ProductDetailData } from "@/core/contracts/commerce/catalog";
import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";

import { ProductDetail } from "./product-detail";

const market: CartMarket = { id: "au", currency: "AUD" };

const product: ProductDetailData = {
  id: "floating-phone",
  slug: "floating-phone",
  name: "Floating Phone",
  category: "Armchairs",
  colour: "Sky",
  image: "/pdp/pdp-yellow-couch.png",
  price: { amount: 1139.33, currency: "AUD" },
  description:
    "Met minim Mollie non desert Alamo est sit cliquey dolor do met sent. RELIT official consequent door ENIM RELIT Mollie. Excitation venial consequent sent nostrum met.",
  materials: ["Fabric"],
  gallery: [
    { src: "/pdp/pdp-yellow-couch.png", alt: "Floating Phone main image" },
    { src: "/pdp/pdp-main.png", alt: "Floating Phone alternate image" },
  ],
  rating: 4,
  reviewCount: 10,
  availability: "in-stock",
  colourOptions: [
    { id: "sky", label: "Sky", swatch: "#23A6F0" },
    { id: "mint", label: "Mint", swatch: "#2DC071" },
    { id: "coral", label: "Coral", swatch: "#E77C40" },
    { id: "ink", label: "Ink", swatch: "#252B42" },
  ],
};

const meta = {
  title: "Modules/catalog/ProductDetail",
  component: ProductDetail,
  args: { product },
  decorators: [
    (Story) => (
      <CartMarketProvider market={market}>
        <Story />
      </CartMarketProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ProductDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NarrowMobile: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
};

export const OutOfStock: Story = {
  args: {
    product: { ...product, availability: "out-of-stock" },
  },
};
