import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProductReviews } from "./product-reviews";
const meta = { title: "Modules/catalog/ProductReviews", component: ProductReviews, args: { reviews: [
  { id: "sample-a", kind: "demo", authorLabel: "Example A", rating: 5, title: "Choosing a size", body: "Illustrative feedback used to demonstrate review details. Not a customer review.", publishedAt: "2026-10-20" },
  { id: "sample-b", kind: "demo", authorLabel: "Example B", rating: 3, title: "A measurement question", body: "Illustrative feedback used to demonstrate filtering. Not a customer review.", publishedAt: "2026-10-24" },
] } } satisfies Meta<typeof ProductReviews>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SampleReviews: Story = {};
export const Empty: Story = { args: { reviews: [] } };
