#!/usr/bin/env node
/**
 * 本地开发入口闸门：必须显式设置 MARKET，避免默默跑在错误市场上。
 * 用法：node scripts/require-market.mjs next dev
 */
import { spawn } from "node:child_process";

const market = process.env.MARKET?.trim();
const allowed = new Set(["au", "sg", "us"]);

if (!market || !allowed.has(market)) {
  console.error(`
[e-pig] MARKET is required for local development.

  Examples:
    pnpm dev:au
    pnpm dev:sg
    pnpm dev:us
    MARKET=sg pnpm dev

  Registered markets: au | sg | us
`);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("[e-pig] require-market.mjs: missing command to run");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
