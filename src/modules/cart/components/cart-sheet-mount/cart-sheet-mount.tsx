"use client";

import { CartSheet } from "@/modules/cart/components/cart-sheet/cart-sheet";
import {
  CartMarketProvider,
  type CartMarket,
} from "../cart-market-context/cart-market-context";

/**
 * 在 request-time market boundary 内挂载购物车抽屉的 client 边界。
 * 它提供 market context；服务端数据由浏览器共享 QueryClient 管理，
 * drawer open 状态独立保存在 UI external store。
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
