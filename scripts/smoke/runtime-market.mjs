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

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
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
});
let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));

try {
  const response = await fetchWithRetry(`http://127.0.0.1:${port}/`);
  const html = await response.text();
  const assertions = [
    [html.includes('<html lang="en">'), "expected the shared English document language"],
    [html.includes("Singapore"), "expected Singapore market content"],
    [html.includes("SGD"), "expected SGD market currency"],
    [html.includes("en-SG"), "expected the SG regional locale in runtime content"],
    [!html.includes('<html lang="en-AU">'), "must not leak build-time en-AU html lang"],
    [!html.includes('<html lang="en-SG">'), "regional locale belongs to runtime UI, not the shell"],
    [!html.includes("Australia · AUD"), "must not leak AU market content"],
    [!html.includes("Sydney studio"), "shared shell must not contain AU-only studio copy"],
  ];
  const failure = assertions.find(([passed]) => !passed);
  if (failure) throw new Error(`${failure[1]}\n${output}`);
  process.stdout.write("[runtime-market-smoke] PASS — SG runtime config is consistent.\n");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
