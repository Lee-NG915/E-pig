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
  variants: [{ id: "sky", sku: "SANDBOX-SKY", label: "Sky", price: { amount: 1139.33, currency: "AUD" }, image: "/pdp/pdp-yellow-couch.png", availability: "in-stock", maxQuantity: 5 }],
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
    product: { ...product, variants: product.variants.map(variant => ({ ...variant, availability: "out-of-stock" })) },
  },
};

const configured: ProductDetailData = {
  ...product,
  name: "Demo modular sofa",
  description: "Explore colours and sizes. These options and prices are controlled story data.",
  variants: [
    { ...product.variants[0], id: "cream-2", label: "Cream / 2 Sections", options: [{ name: "Colour", value: "Cream" }, { name: "Size", value: "2 Sections" }], dimensions: { width: 190, depth: 104, height: 93, unit: "cm" } },
    { ...product.variants[0], id: "green-2", label: "Green / 2 Sections", image: "/pdp/pdp-main.png", options: [{ name: "Colour", value: "Green" }, { name: "Size", value: "2 Sections" }], dimensions: { width: 190, depth: 104, height: 93, unit: "cm" } },
    { ...product.variants[0], id: "green-3", label: "Green / 3 Sections", image: "/pdp/pdp-main.png", price: { amount: 1500, currency: "AUD" }, options: [{ name: "Colour", value: "Green" }, { name: "Size", value: "3 Sections" }], dimensions: { width: 267, depth: 104, height: 93, unit: "cm" } },
  ],
};

export const SelectedConfiguration: Story = { args: { product: configured, initialVariantId: "green-3" } };
export const InvalidDeepLink: Story = { args: { product: configured, initialVariantId: "removed-variant" } };

export const DemoReviewsAndDelivery: Story = {
  args: {
    product: { ...configured, demoReviews: [
      { id: "sample-a", kind: "demo", authorLabel: "Example reviewer A", rating: 5, title: "Exploring a layout", body: "Sample content for trying the review controls, not a customer experience.", publishedAt: "2026-10-20" },
      { id: "sample-b", kind: "demo", authorLabel: "Example reviewer B", rating: 3, title: "Checking dimensions", body: "An illustrative review. No purchase or product performance is verified.", publishedAt: "2026-10-22" },
    ] },
  },
};

export const TwoPieceSet: Story = {
  args: {
    product: configured,
    bundleCompanion: {
      ...product, id: "demo-ottoman", slug: "demo-ottoman", name: "Demo ottoman",
      description: "Controlled companion data for the two-piece set demonstration.",
      variants: [{ ...product.variants[0], id: "ottoman-cream", label: "Cream", price: { amount: 300, currency: "AUD" } }],
    },
  },
};
