import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";

const meta = { title: "Components/Input", component: Input, args: { placeholder: "Email address" } } satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Figma sizes: Sm 32 / Md 40 */
export const Sizes: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-3">
      <Input size="sm" placeholder="Small 32" />
      <Input size="md" placeholder="Medium 40" />
    </div>
  ),
};

/** Error state is driven by aria-invalid. */
export const Error: Story = { args: { "aria-invalid": true, defaultValue: "not-an-email" } };

export const Disabled: Story = { args: { disabled: true, placeholder: "Disabled" } };
