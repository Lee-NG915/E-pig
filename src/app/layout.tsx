import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "E-pig — Furniture for slower days",
  description:
    "A lightweight, local-first ecommerce frontend demo built with Next.js, Tailwind CSS and shadcn/ui.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Phase 1 三个 market 均为英语；region-specific locale 在 request-time
    // market boundaries 中用于金额/UI。未来加入非英语市场时升级为 [lang] root layout。
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
