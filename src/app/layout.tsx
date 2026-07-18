import type { Metadata } from "next";

import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount";
import { getActiveMarket } from "@/platform/config/active-market";

import "./globals.css";

export const metadata: Metadata = {
  title: "E-pig — Furniture for slower days",
  description:
    "A lightweight, local-first ecommerce frontend demo built with Next.js, Tailwind CSS and shadcn/ui.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // 同步读取进程启动期 env，prerender 安全；dev 模式天然按请求渲染。
  // 多市场 host 解析（Phase 4）落地后改为 request-time 读取。
  const market = getActiveMarket();

  return (
    <html lang={market.defaultLocale}>
      <body>
        <CartSheetMount locale={market.defaultLocale}>{children}</CartSheetMount>
      </body>
    </html>
  );
}
