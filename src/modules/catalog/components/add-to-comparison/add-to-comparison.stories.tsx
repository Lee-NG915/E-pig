import type { Meta, StoryObj } from "@storybook/react-vite";
import { addCompareItem, clearCompareSelection } from "../../lib/compare-store";
import { dismissComparisonFeedback, useComparisonFeedback } from "../comparison-dock/comparison-feedback";
import { AddToComparison } from "./add-to-comparison";

function Feedback() {
  const feedback = useComparisonFeedback("au");
  return <p role="status" className="mt-4 max-w-sm text-sm">{feedback?.message}</p>;
}
const meta = {
  title: "Modules/catalog/AddToComparison",
  component: AddToComparison,
  tags: ["!autodocs"],
  args: { marketId: "au", item: { productId: "sofa", variantId: "green" }, productName: "Modular Sofa" },
  decorators: [(Story) => <div className="p-6"><Story /><Feedback /></div>],
  beforeEach: () => { clearCompareSelection("au"); dismissComparisonFeedback("au"); },
} satisfies Meta<typeof AddToComparison>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AlreadyAdded: Story = { beforeEach: () => { addCompareItem("au", { productId: "sofa", variantId: "green" }); } };
export const UpdateOption: Story = { beforeEach: () => { addCompareItem("au", { productId: "sofa", variantId: "cream" }); } };
export const FullList: Story = { beforeEach: () => { for (const productId of ["chair", "bed", "table"]) addCompareItem("au", { productId, variantId: "default" }); } };
