#!/usr/bin/env node

import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("Could not allocate port"))));
    });
  });
}

async function fetchWithRetry(url, init) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (init?.redirect === "manual" || response.ok) return response;
      lastError = new Error(`Unexpected HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("Server did not become ready");
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("Run this smoke through `pnpm smoke:runtime-market`.");

const port = await getAvailablePort();
const child = spawn(process.execPath, [path.resolve(pnpmCli), "start"], {
  cwd: process.cwd(),
  env: { ...process.env, MARKET: "sg", PORT: String(port), HOSTNAME: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: process.platform !== "win32",
});
let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));

try {
  // 内容断言走规范市场首页（跟随 redirect 亦可）。
  const home = await fetchWithRetry(`http://127.0.0.1:${port}/sg`);
  const homeHtml = await home.text();

  const rootRedirect = await fetchWithRetry(`http://127.0.0.1:${port}/`, {
    redirect: "manual",
  });
  const foreign = await fetchWithRetry(`http://127.0.0.1:${port}/au/collections/sofas`, {
    redirect: "manual",
  });

  const assertions = [
    [rootRedirect.status === 308, "expected / to 308"],
    [
      (rootRedirect.headers.get("location") ?? "").replace(/\/$/, "") === "/sg",
      "expected / → /sg",
    ],
    [homeHtml.includes('<html lang="en">'), "expected the shared English document language"],
    [homeHtml.includes("Singapore"), "expected Singapore market content"],
    [homeHtml.includes("SGD"), "expected SGD market currency"],
    // Locale belongs to money/date formatting; it is no longer developer copy in the footer.
    [homeHtml.includes("/sg/products/"), "expected market-prefixed SG product links"],
    [!homeHtml.includes('<html lang="en-AU">'), "must not leak build-time en-AU html lang"],
    [!homeHtml.includes('<html lang="en-SG">'), "regional locale belongs to runtime UI, not the shell"],
    [!homeHtml.includes("Australia · AUD"), "must not leak AU market content"],
    [!homeHtml.includes("Sydney studio"), "shared shell must not contain AU-only studio copy"],
    [foreign.status === 308, "expected foreign market prefix to 308"],
    [
      (foreign.headers.get("location") ?? "").includes("/sg/collections/sofas"),
      "expected /au/... to redirect into /sg/...",
    ],
  ];
  const failure = assertions.find(([passed]) => !passed);
  if (failure) throw new Error(`${failure[1]}\n${output}`);
  process.stdout.write("[runtime-market-smoke] PASS — SG runtime config is consistent.\n");
} finally {
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
