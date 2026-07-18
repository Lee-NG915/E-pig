"use client";

import { CartSheet } from "@/modules/cart/components/cart-sheet";
import { CartMarketProvider, type CartMarket } from "./cart-market-context";

/**
 * 在 request-time market boundary 内挂载购物车抽屉的 client 边界。
 * 它不"提供"任何 context —— cart 状态在 modules/cart/lib/cart-store
 * 的模块级 external store 里，组件各自用 useCartStore 订阅。
 */
export function CartSheetMount({
  market,
  children,
}: {
  market: CartMarket;
  children: React.ReactNode;
}) {
  return (
    <CartMarketProvider market={market}>
      {children}
      <CartSheet />
    </CartMarketProvider>
  );
}
