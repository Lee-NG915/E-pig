import type { Meta, StoryObj } from "@storybook/react-vite";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { setCartOpen } from "@/modules/cart/lib/cart-store";
import { AddToComparison } from "../add-to-comparison/add-to-comparison";
import { comparisonProduct as product, secondComparisonProduct as second, installComparisonStoryData } from "../product-comparison/product-comparison.mock";
import { dismissComparisonFeedback } from "./comparison-feedback";
import { ComparisonDock } from "./comparison-dock";

const item = { productId: product.id, variantId: product.variants[0].id };
const meta = {
  title: "Modules/catalog/ComparisonDock",
  component: ComparisonDock,
  tags: ["!autodocs"],
  args: { marketId: "au" },
  parameters: { layout: "fullscreen" },
  beforeEach: () => { dismissComparisonFeedback("au"); setCartOpen({ id: "au", currency: "AUD" }, false); },
  decorators: [(Story) => <PathnameContext.Provider value="/au/collections/sofas"><div className="min-h-[90vh] p-8"><h2 className="mb-6 font-display text-2xl">Keep browsing while you compare</h2><AddToComparison marketId="au" item={item} productName={product.name} /><Story /></div></PathnameContext.Provider>],
} satisfies Meta<typeof ComparisonDock>;
export default meta;
type Story = StoryObj<typeof meta>;
export const StartCollecting: Story = { beforeEach: () => installComparisonStoryData([]) };
export const TwoProducts: Story = { beforeEach: () => installComparisonStoryData([item, { productId: second.id, variantId: second.variants[0].id }]) };
export const LoadFailure: Story = { beforeEach: () => installComparisonStoryData([item], "error") };
export const MobilePurchaseBar: Story = {
  beforeEach: () => installComparisonStoryData([item]),
  render: args => <PathnameContext.Provider value="/au/products/alto-sofa"><ComparisonDock {...args} /><div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background p-5 lg:hidden">Mobile purchase bar</div></PathnameContext.Provider>,
};
