import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it, onTestFinished } from "vitest";

import { runInProcessGroup } from "./after-sales-pg-process.mjs";
import {
  isProcessGroupAlive,
  terminateProcessGroup,
} from "./after-sales-process-group.mjs";

// A group member that proves SIGTERM was delivered and then ignores it.
const STUBBORN_GROUP_CHILD = `
const fs = require("node:fs");
process.on("SIGTERM", () => {
  fs.writeFileSync(process.env.FAKE_CHILD_TERM_FILE, "term");
});
setTimeout(() => process.exit(99), 10_000);
setInterval(() => {}, 1000);
`;

// Leader spawns the stubborn child into its own group, records both pids, then
// exits on its own before termination is requested.
const EXITING_LEADER = `
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const child = spawn(process.execPath, [process.env.FAKE_CHILD_SCRIPT], {
  stdio: "ignore",
  env: process.env,
});
fs.writeFileSync(process.env.FAKE_LEADER_PID_FILE, String(process.pid));
fs.writeFileSync(process.env.FAKE_CHILD_PID_FILE, String(child.pid));
setTimeout(() => process.exit(0), 50);
setInterval(() => {}, 1000);
`;

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

  it("cleans a stubborn child after its group leader has already exited", async () => {
    const directory = temporaryDirectory();
    const childScript = path.join(directory, "stubborn-child.cjs");
    const childPidFile = path.join(directory, "child-pid");
    const childTermFile = path.join(directory, "child-term");
    writeFileSync(childScript, STUBBORN_GROUP_CHILD);

    const leader = spawn(process.execPath, ["-e", EXITING_LEADER], {
      env: {
        ...process.env,
        FAKE_CHILD_SCRIPT: childScript,
        FAKE_LEADER_PID_FILE: path.join(directory, "leader-pid"),
        FAKE_CHILD_PID_FILE: childPidFile,
        FAKE_CHILD_TERM_FILE: childTermFile,
      },
      detached: true,
      stdio: "ignore",
    });
    const pgid = leader.pid;
    if (!pgid) throw new Error("leader process did not start");
    onTestFinished(() => {
      try {
        process.kill(-pgid, "SIGKILL");
      } catch {
        // The group is already gone.
      }
    });

    await new Promise((resolve, reject) => {
      leader.once("exit", resolve);
      leader.once("error", reject);
    });
    await waitForFile(childPidFile);
    const childPid = Number(readFileSync(childPidFile, "utf8"));

    // The leader exited, but its child is still alive and ignores TERM.
    expect(isProcessGroupAlive(pgid)).toBe(true);
    const started = Date.now();
    const cleaned = await terminateProcessGroup({
      pgid,
      termGraceMs: 200,
      killWaitMs: 2_000,
    });

    expect(cleaned).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(readFileSync(childTermFile, "utf8")).toBe("term");
    expect(isProcessAlive(childPid)).toBe(false);
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
