import type { Meta, StoryObj } from "@storybook/react-vite";

import { blogPosts } from "@/modules/content/lib/blog-posts";

import { BlogCard } from "./blog-card";

const meta = {
  title: "Modules/content/BlogCard",
  component: BlogCard,
  parameters: { layout: "centered" },
  args: { post: blogPosts[0] },
  decorators: [(Story) => <div className="w-[330px] sm:w-[465px]"><Story /></div>],
} satisfies Meta<typeof BlogCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const WithoutNewBadge: Story = { args: { post: { ...blogPosts[0], isNew: false } } };
