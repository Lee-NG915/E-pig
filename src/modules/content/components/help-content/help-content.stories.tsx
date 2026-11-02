import type { Meta, StoryObj } from "@storybook/react-vite";
import { HelpContent } from "./help-content";
const meta = { title: "Modules/content/HelpContent", component: HelpContent, args: { topic: "payment", marketId: "au" } } satisfies Meta<typeof HelpContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Payment: Story = {};
export const Privacy: Story = { args: { topic: "privacy" } };
