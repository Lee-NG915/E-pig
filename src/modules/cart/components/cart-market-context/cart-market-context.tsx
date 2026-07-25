"use client";

import { createContext, use } from "react";

import type { CartMarketIdentity } from "@/modules/cart/lib/cart-store";

/** 购物车/UI 市场身份：只带 market id + currency；locale 从 registry 按 id 推导。 */
export type CartMarket = CartMarketIdentity;

const CartMarketContext = createContext<CartMarket | null>(null);

export function CartMarketProvider({
  market,
  children,
}: {
  market: CartMarket;
  children: React.ReactNode;
}) {
  return <CartMarketContext value={market}>{children}</CartMarketContext>;
}

export function useCartMarket(): CartMarket {
  const market = use(CartMarketContext);
  if (!market) throw new Error("useCartMarket must be used inside CartMarketProvider");
  return market;
}
