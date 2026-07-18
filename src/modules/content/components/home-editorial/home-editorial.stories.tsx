import type { Meta, StoryObj } from "@storybook/react-vite";

import { HomeEditorial } from "./home-editorial";

const meta = {
  title: "Modules/content/HomeEditorial",
  component: HomeEditorial,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HomeEditorial>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** dark 主题下的编辑区 */
export const Dark: Story = {
  globals: { theme: "dark" },
};
