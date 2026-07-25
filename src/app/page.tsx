import { Suspense } from "react";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { env } from "@/platform/config/env";

/**
 * 根 `/`：request-time 跳到本进程市场首页。
 * 同时给 Turbopack 一个稳定的 `/page` 入口，避免迁移到 `[market]` 后
 * HMR 因缺失 app endpoint /page 反复 panic 导致浏览器整页刷新。
 */
async function RedirectToActiveMarket(): Promise<never> {
  await connection();
  redirect(`/${env.MARKET}`);
}

export default function RootPage() {
  return (
    <Suspense fallback={null}>
      <RedirectToActiveMarket />
    </Suspense>
  );
}
