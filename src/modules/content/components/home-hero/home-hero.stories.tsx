import type { Meta, StoryObj } from "@storybook/react-vite";

import { HomeHero } from "./home-hero";

const meta = {
  title: "Modules/content/HomeHero",
  component: HomeHero,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HomeHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** dark 主题下的首屏 */
export const Dark: Story = {
  globals: { theme: "dark" },
};
