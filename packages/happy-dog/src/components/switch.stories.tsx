import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./switch";

const meta = { title: "Components/Switch", component: Switch } satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Figma: checked False/True × states Default / Disabled */
export const States: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <label className="flex items-center gap-2 text-sm">
        <Switch /> Off
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Switch defaultChecked /> On
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Switch disabled /> Disabled
      </label>
    </div>
  ),
};
