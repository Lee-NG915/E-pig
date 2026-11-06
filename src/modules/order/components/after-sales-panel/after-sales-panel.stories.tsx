import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  afterSalesCartId,
  afterSalesMarket,
  afterSalesOrderId,
  installAfterSalesStory,
  type AfterSalesStoryMode,
} from "./after-sales-panel.mock";
import { AfterSalesPanel } from "./after-sales-panel";

const meta = {
  title: "Modules/order/AfterSalesPanel",
  component: AfterSalesPanel,
  args: {
    market: afterSalesMarket,
    cartId: afterSalesCartId,
    orderId: afterSalesOrderId,
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof AfterSalesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function story(mode: AfterSalesStoryMode): Story {
  return {
    beforeEach: () => installAfterSalesStory(mode),
  };
}

export const Loading: Story = story("loading");
export const Empty: Story = story("empty");
export const Forbidden: Story = story("forbidden");
export const Error: Story = story("error");
export const Stale: Story = story("stale");
export const Conflict: Story = story("conflict");
export const Retrying: Story = story("retrying");
export const Success: Story = story("success");
export const Pending: Story = story("pending");
export const UnknownResult: Story = story("unknown");
export const NarrowSuccess: Story = {
  ...story("success"),
  decorators: [
    (Story) => (
      <div className="w-[288px]">
        <Story />
      </div>
    ),
  ],
};
