import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "./separator";

const meta = { title: "Components/Separator", component: Separator } satisfies Meta<typeof Separator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-72 text-sm">
      <p>Above the separator</p>
      <Separator className="my-4" />
      <p>Below the separator</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-6 items-center gap-3 text-sm">
      <span>Left</span>
      <Separator orientation="vertical" />
      <span>Right</span>
    </div>
  ),
};
