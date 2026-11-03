import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProductFilters } from "./product-filters";

const meta = {
  title: "Modules/catalog/ProductFilters",
  component: ProductFilters,
  args: { marketId: "au", handle: "sofas", currency: "AUD", availableColours: ["Forest Walk", "Winter Cream", "Green Wattle (Standard)"] },
} satisfies Meta<typeof ProductFilters>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Applied: Story = { args: { filters: { colours: ["Forest Walk"], minPrice: 3000, maxPrice: 4000, inStockOnly: true }, sort: "price-asc" } };
export const Invalid: Story = { args: { filters: { colours: ["Purple"], minPrice: 3000, maxPrice: 2000 }, issues: ["Colour “Purple” is not available in this collection.", "Minimum price must not exceed maximum price."] } };
export const NoColours: Story = { args: { availableColours: [], filters: { inStockOnly: true } } };
