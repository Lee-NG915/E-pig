import type { Meta, StoryObj } from "@storybook/react-vite";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import { marketFixture } from "@/modules/cart/components/cart-panel/cart-panel.mock";
import { OrderHistory } from "./order-history";
const meta = {
  title: "Modules/order/OrderHistory",
  component: OrderHistory,
  args: { market: marketFixture },
  beforeEach: () => {
    getStorefrontQueryClient().setQueryDefaults(["orders", "au", "list"], {
      staleTime: Infinity,
    });
    getStorefrontQueryClient().setQueryData(["orders", "au", "list"], {
      orders: [],
    });
  },
} satisfies Meta<typeof OrderHistory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
