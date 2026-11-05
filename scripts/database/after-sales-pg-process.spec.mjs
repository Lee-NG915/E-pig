import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it, onTestFinished } from "vitest";

import { runInProcessGroup } from "./after-sales-pg-process.mjs";

// Real isolated child process: it records its pid, proves SIGTERM was delivered,
// ignores it, and only stops when the runner escalates to SIGKILL.
const IGNORE_TERM_CHILD = `
const fs = require("node:fs");
fs.writeFileSync(process.env.FAKE_PID_FILE, String(process.pid));
process.on("SIGTERM", () => {
  fs.writeFileSync(process.env.FAKE_TERM_FILE, "term");
});
// Safety net: never leave an orphan if the test runner itself dies early.
setTimeout(() => process.exit(99), 10_000);
setInterval(() => {}, 1000);
`;

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "epig-after-sales-pg-process-"));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(filePath, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(filePath) && Date.now() < deadline) {
    await delay(10);
  }
  if (!existsSync(filePath)) {
    throw new Error("fake child did not start");
  }
}

function fakeChildOptions(directory) {
  return {
    command: process.execPath,
    args: ["-e", IGNORE_TERM_CHILD],
    env: {
      ...process.env,
      FAKE_PID_FILE: path.join(directory, "pid"),
      FAKE_TERM_FILE: path.join(directory, "term"),
    },
    stdio: "ignore",
  };
}

describe("after-sales PostgreSQL runner process group", () => {
  it("escalates an ignored SIGTERM to SIGKILL and waits for the child group", async () => {
    const directory = temporaryDirectory();
    const options = fakeChildOptions(directory);
    const started = Date.now();

    const result = await runInProcessGroup({
      ...options,
      timeoutMs: 100,
      termGraceMs: 300,
      groupExitTimeoutMs: 2_000,
    });
    const elapsed = Date.now() - started;
    const pid = Number(readFileSync(path.join(directory, "pid"), "utf8"));

    expect(result.timedOut).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.groupExited).toBe(true);
    // The short grace is actually spent before escalation, and TERM was seen.
    expect(elapsed).toBeGreaterThanOrEqual(300);
    expect(readFileSync(path.join(directory, "term"), "utf8")).toBe("term");
    expect(isProcessAlive(pid)).toBe(false);
  });

  it("uses the same termination path for an external abort signal", async () => {
    const directory = temporaryDirectory();
    const options = fakeChildOptions(directory);
    const controller = new AbortController();

    const run = runInProcessGroup({
      ...options,
      timeoutMs: 60_000,
      termGraceMs: 200,
      groupExitTimeoutMs: 2_000,
      signal: controller.signal,
    });
    await waitForFile(path.join(directory, "pid"));
    controller.abort();
    const result = await run;
    const pid = Number(readFileSync(path.join(directory, "pid"), "utf8"));

    expect(result.timedOut).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.groupExited).toBe(true);
    expect(readFileSync(path.join(directory, "term"), "utf8")).toBe("term");
    expect(isProcessAlive(pid)).toBe(false);
  });

  it("returns the natural exit code without signaling a healthy child", async () => {
    const result = await runInProcessGroup({
      command: process.execPath,
      args: ["-e", "process.exit(7)"],
      env: process.env,
      stdio: "ignore",
      timeoutMs: 5_000,
      termGraceMs: 200,
    });

    expect(result).toMatchObject({
      code: 7,
      signal: null,
      timedOut: false,
      aborted: false,
      groupExited: true,
    });
  });
});
