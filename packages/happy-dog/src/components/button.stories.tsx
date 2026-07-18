import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

const meta = { title: "Components/Button", component: Button, args: { children: "Button" } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Variants: Story = { render: () => <div className="flex gap-3"><Button>Default</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button></div> };
