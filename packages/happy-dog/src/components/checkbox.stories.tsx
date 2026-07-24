import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./checkbox";

const meta = { title: "Components/Checkbox", component: Checkbox } satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Figma: checked False/True × states Default / Disabled */
export const States: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox /> Unchecked
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox defaultChecked /> Checked
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox disabled /> Disabled
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox defaultChecked disabled /> Checked disabled
      </label>
    </div>
  ),
};
