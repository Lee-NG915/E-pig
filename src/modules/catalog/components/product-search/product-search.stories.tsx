import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProductSearch } from "./product-search";
const meta = { title: "Modules/catalog/ProductSearch", component: ProductSearch, args: { marketId: "au", query: "", products: [] } } satisfies Meta<typeof ProductSearch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const EmptyQuery: Story = {};
export const NoResults: Story = { args: { query: "unknown" } };
export const Failed: Story = { args: { query: "chair", failed: true } };
