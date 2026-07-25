import type { Meta, StoryObj } from "@storybook/react-vite";

import { CartMarketProvider, useCartMarket } from "./cart-market-context";

/** demo 消费方：直接渲染 context 值，验证 provider 的传递。 */
function MarketInspector() {
  const market = useCartMarket();
  return (
    <dl className="grid w-fit grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border bg-card p-4 text-sm">
      <dt className="text-muted-foreground">id</dt>
      <dd className="font-medium">{market.id}</dd>
      <dt className="text-muted-foreground">currency</dt>
      <dd className="font-medium">{market.currency}</dd>
    </dl>
  );
}

const meta = {
  title: "Modules/cart/CartMarketContext",
  component: CartMarketProvider,
  args: {
    market: { id: "au", currency: "AUD" },
    children: <MarketInspector />,
  },
} satisfies Meta<typeof CartMarketProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** 另一市场：SGD */
export const SgMarket: Story = {
  args: {
    market: { id: "sg", currency: "SGD" },
  },
};
