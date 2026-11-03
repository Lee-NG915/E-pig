import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeliveryEstimate } from "./delivery-estimate";
const meta = { title: "Modules/checkout/DeliveryEstimate", component: DeliveryEstimate, args: { marketId: "au" } } satisfies Meta<typeof DeliveryEstimate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const CheckoutEstimate: Story = { args: { postalCode: "2000" } };
export const Unknown: Story = { args: { postalCode: "9999" } };
export const Unsupported: Story = { args: { marketId: "sg" } };
