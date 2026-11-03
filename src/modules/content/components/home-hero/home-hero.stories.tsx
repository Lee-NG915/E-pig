import type { Meta, StoryObj } from "@storybook/react-vite";

import { HomeHero } from "./home-hero";

const meta = {
  title: "Modules/content/HomeHero",
  component: HomeHero,
  parameters: { layout: "fullscreen" },
  args: { marketId: "au" },
} satisfies Meta<typeof HomeHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Singapore: Story = { args: { marketId: "sg" } };

/** dark 主题下的首屏 */
export const Dark: Story = {
  globals: { theme: "dark" },
};
