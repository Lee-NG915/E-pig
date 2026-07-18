"use client";

import { CartSheet } from "@/modules/cart/components/cart-sheet";

/**
 * 在根布局挂载购物车抽屉的 client 边界。
 * 它不"提供"任何 context —— cart 状态在 modules/cart/lib/cart-store
 * 的模块级 external store 里，组件各自用 useCartStore 订阅。
 */
export function CartSheetMount({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <CartSheet locale={locale} />
    </>
  );
}
