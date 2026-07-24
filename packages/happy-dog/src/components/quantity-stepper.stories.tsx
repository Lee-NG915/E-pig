import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuantityStepper } from "./quantity-stepper";

function Demo(props: React.ComponentProps<typeof QuantityStepper>) {
  const [value, setValue] = React.useState(props.value);
  return <QuantityStepper {...props} value={value} onValueChange={setValue} />;
}

const noop = () => {};

const meta = {
  title: "Components/QuantityStepper",
  component: QuantityStepper,
  args: { value: 1, onValueChange: noop },
  render: (args) => <Demo {...args} />,
} satisfies Meta<typeof QuantityStepper>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithMax: Story = { args: { value: 4, max: 5, onValueChange: noop } };
export const Disabled: Story = { args: { value: 2, disabled: true, onValueChange: noop } };
