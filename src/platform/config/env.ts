import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

import { setLogLevel } from "@/platform/logging/logger";

import { marketIds } from "./markets";

/**
 * 环境变量 schema（04 §2：server/client schema，启动即失败）。
 * 导出为独立常量以便单测直接验证 zod 行为（不触发 createEnv 的进程级解析）。
 */
export const serverEnvSchema = {
  /** 本进程服务哪个市场；非秘密配置本体在 ./markets registry */
  MARKET: z.enum(marketIds).default("au"),
  /** commerce adapter 选择；P0 只有 mock，真实后端接入后扩展（如 "custom-rest"） */
  COMMERCE_ADAPTER: z.enum(["mock"]).default("mock"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
} as const;

/**
 * 浏览器公开变量 schema。规则（04 §7 Hard Rule）：
 * 永远不要把 server secret 加进 NEXT_PUBLIC_*。
 */
export const clientEnvSchema = {
  // NEXT_PUBLIC_BASE_URL: z.url().optional(),
} as const;

export const env = createEnv({
  server: serverEnvSchema,
  client: clientEnvSchema,
  runtimeEnv: {
    MARKET: process.env.MARKET,
    COMMERCE_ADAPTER: process.env.COMMERCE_ADAPTER,
    LOG_LEVEL: process.env.LOG_LEVEL,
  },
});

// env 是启动期唯一被允许读取进程环境并回写 logger 配置的位置。
setLogLevel(env.LOG_LEVEL);
