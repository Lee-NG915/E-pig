import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const meta = { title: "Components/Badge", component: Badge, args: { children: "Badge" } } satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Variants: Story = { render: () => <div className="flex gap-3"><Badge>Default</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="outline">Outline</Badge></div> };
