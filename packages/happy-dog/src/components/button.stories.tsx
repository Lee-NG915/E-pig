import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

const meta = { title: "Components/Button", component: Button, args: { children: "Button" } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Figma styles: Default / Secondary / Outline / Ghost / Destructive / Link */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

/** Figma control sizes: Sm 32 / Md 40 / Lg 48 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small 32</Button>
      <Button size="default">Medium 40</Button>
      <Button size="lg">Large 48</Button>
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true } };
