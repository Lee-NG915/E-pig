import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./skeleton";

const meta = { title: "Components/Skeleton", component: Skeleton } satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Figma variants: Text / Media / Circle / Swatch */
export const Variants: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <Skeleton variant="text" />
      <Skeleton variant="text" className="w-2/3" />
      <Skeleton variant="media" />
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" />
        <Skeleton variant="swatch" />
      </div>
    </div>
  ),
};
