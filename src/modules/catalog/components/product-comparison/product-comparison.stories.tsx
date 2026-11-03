import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ProductComparison } from "./product-comparison";
import { comparisonProduct as product, secondComparisonProduct as second } from "./product-comparison.mock";

const first = { item: { productId: product.id, variantId: product.variants[0].id }, product, variant: product.variants[0], usedDefault: false };
const meta = {
  title: "Modules/catalog/ProductComparison",
  component: ProductComparison,
  args: { marketId: "au", products: [product, second], entries: [first], issues: [] },
  decorators: [(Story) => <AppRouterContext.Provider value={{ back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }}><Story /></AppRouterContext.Provider>],
} satisfies Meta<typeof ProductComparison>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OneOption: Story = {};
export const Empty: Story = { args: { entries: [] } };
export const UnavailableOption: Story = { args: { entries: [{ item: { productId: product.id, variantId: "unknown" }, product, usedDefault: false, error: "This option is unavailable in the catalog. Select another option." }] } };
export const ThreeOptions: Story = { args: { entries: [first,
  { item: { productId: product.id, variantId: product.variants[1].id }, product, variant: product.variants[1], usedDefault: false },
  { item: { productId: second.id, variantId: second.variants[0].id }, product: second, variant: second.variants[0], usedDefault: true },
] } };

export const LongProductMenu: Story = {
  args: {
    entries: [],
    products: Array.from({ length: 40 }, (_, index) => ({ ...product, id: `sample-${index}`, name: `Sample ${index + 1} — Modular sofa with a long configuration name` })),
  },
};
