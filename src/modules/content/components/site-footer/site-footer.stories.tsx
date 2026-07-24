import type { Meta, StoryObj } from "@storybook/react-vite";

import { SiteFooter } from "./site-footer";

const meta = {
  title: "Modules/content/SiteFooter",
  component: SiteFooter,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SiteFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** dark 主题下的页脚 */
export const Dark: Story = {
  globals: { theme: "dark" },
};
