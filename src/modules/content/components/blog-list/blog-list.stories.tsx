import type { Meta, StoryObj } from "@storybook/react-vite";

import { blogPosts } from "@/modules/content/lib/blog-posts";

import { BlogList } from "./blog-list";

const meta = {
  title: "Modules/content/BlogList",
  component: BlogList,
  parameters: { layout: "fullscreen" },
  args: { posts: blogPosts },
} satisfies Meta<typeof BlogList>;

export default meta;
type Story = StoryObj<typeof meta>;
export const DesktopAndMobile: Story = {};
export const Empty: Story = { args: { posts: [] } };
