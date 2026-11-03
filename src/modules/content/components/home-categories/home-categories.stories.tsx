import type { Meta, StoryObj } from "@storybook/react-vite";

import { HomeCategories } from "./home-categories";

const meta = {
  title: "Modules/content/HomeCategories",
  component: HomeCategories,
  args: { marketId: "au" },
} satisfies Meta<typeof HomeCategories>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const UnitedStates: Story = { args: { marketId: "us" } };

export const Dark: Story = { globals: { theme: "dark" } };
