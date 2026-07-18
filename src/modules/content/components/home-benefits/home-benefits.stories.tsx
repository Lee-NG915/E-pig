import type { Meta, StoryObj } from "@storybook/react-vite";

import { HomeBenefits } from "./home-benefits";

const meta = {
  title: "Modules/content/HomeBenefits",
  component: HomeBenefits,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HomeBenefits>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** dark 主题下的权益条 */
export const Dark: Story = {
  globals: { theme: "dark" },
};
