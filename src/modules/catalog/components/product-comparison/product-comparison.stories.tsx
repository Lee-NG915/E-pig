import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProductComparison } from "./product-comparison";
import { comparisonProduct as product, secondComparisonProduct as second, thirdComparisonProduct as third, installComparisonStoryData } from "./product-comparison.mock";

const firstItem = { productId: product.id, variantId: product.variants[0].id };
const secondItem = { productId: second.id, variantId: second.variants[0].id };
const meta = {
  title: "Modules/catalog/ProductComparison",
  component: ProductComparison,
  args: { marketId: "au" },
  beforeEach: () => installComparisonStoryData([firstItem, secondItem]),
} satisfies Meta<typeof ProductComparison>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TwoProducts: Story = {};
export const OneProduct: Story = { beforeEach: () => installComparisonStoryData([firstItem]) };
export const Empty: Story = { beforeEach: () => installComparisonStoryData([]) };
export const ThreeProducts: Story = { beforeEach: () => installComparisonStoryData([firstItem, secondItem, { productId: third.id, variantId: third.variants[0].id }]) };
export const OutOfStock: Story = { beforeEach: () => installComparisonStoryData([{ productId: product.id, variantId: product.variants[1].id }, secondItem]) };
export const UnavailableProduct: Story = { beforeEach: () => installComparisonStoryData([firstItem, { productId: "removed", variantId: "old" }]) };
export const UnknownOption: Story = { beforeEach: () => installComparisonStoryData([{ productId: product.id, variantId: "unknown" }]) };
export const Loading: Story = { beforeEach: () => installComparisonStoryData([firstItem, secondItem], "loading") };
export const DetailsError: Story = { beforeEach: () => installComparisonStoryData([firstItem], "error") };
