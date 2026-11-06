import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, onTestFinished } from "vitest";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(scriptDirectory, "run-after-sales-pg.mjs");

// Minimal docker double: the "run" call stays in flight until the test writes
// allow-run, which lets the test deliver SIGTERM before the container exists.
const FAKE_DOCKER = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

process.stdout.on("error", () => {});
process.stderr.on("error", () => {});

const state = process.env.FAKE_DOCKER_STATE;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(state, "calls.log"), args.join(" ") + "\\n");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const containerFile = path.join(state, "container");
const containerExists = () => fs.existsSync(containerFile);

function countAttempt(name) {
  const file = path.join(state, name);
  let value = 0;
  try {
    value = Number(fs.readFileSync(file, "utf8")) || 0;
  } catch {
    // First attempt.
  }
  value += 1;
  fs.writeFileSync(file, String(value));
  return value;
}

async function main() {
  if (args[0] === "version") {
    console.log("27.3.1");
    return;
  }
  if (args[0] === "image" && args[1] === "inspect") {
    console.log("sha256:fake");
    return;
  }
  if (args[0] === "run") {
    fs.writeFileSync(path.join(state, "run-started"), "");
    if (!process.env.FAKE_DOCKER_IMMEDIATE_RUN) {
      while (!fs.existsSync(path.join(state, "allow-run"))) await sleep(10);
    }
    fs.writeFileSync(containerFile, "");
    fs.writeFileSync(path.join(state, "created"), "");
    console.log("fake-container-id");
    return;
  }
  if (args[0] === "exec" && args[2] === "pg_isready") return;
  if (args[0] === "exec" && args.at(-1) === "SELECT 1") {
    const attempt = countAttempt("readiness-attempts");
    if (attempt <= Number(process.env.FAKE_DOCKER_READY_FAILURES ?? 0)) {
      console.error('psql: error: connection failed: FATAL:  database "e_pig_5c" does not exist');
      process.exit(2);
    }
    if (attempt <= Number(process.env.FAKE_DOCKER_HANG_READINESS ?? 0)) {
      await sleep(60_000);
    }
    console.log("1");
    return;
  }
  if (args[0] === "port") {
    console.log("127.0.0.1:49153");
    return;
  }
  if (args[0] === "exec" && args.includes("SHOW server_version")) {
    console.log("16.4");
    return;
  }
  if (args[0] === "exec" && args.some((value) => value.startsWith("SELECT (SELECT"))) {
    console.log("1,1");
    return;
  }
  if (args[0] === "inspect") {
    if (!containerExists()) process.exit(1);
    if (args.includes("-f")) console.log("");
    return;
  }
  if (args[0] === "rm") {
    if (containerExists()) fs.rmSync(containerFile);
    return;
  }
  if (args[0] === "volume") process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

// Stand-in for the vitest process group: records its pid, then waits for TERM.
const FAKE_PNPM = `#!/usr/bin/env node
const fs = require("node:fs");

process.stdout.on("error", () => {});
process.stderr.on("error", () => {});

fs.writeFileSync(process.env.FAKE_PNPM_PID_FILE, String(process.pid));
fs.writeFileSync(process.env.FAKE_PNPM_STARTED_FILE, "started");
if (process.env.FAKE_PNPM_EXIT_CODE) {
  process.exit(Number(process.env.FAKE_PNPM_EXIT_CODE));
}
process.on("SIGTERM", () => {
  fs.writeFileSync(process.env.FAKE_PNPM_TERM_FILE, "term");
  process.exit(143);
});
setTimeout(() => process.exit(99), 10_000);
setInterval(() => {}, 1000);
`;

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "epig-after-sales-pg-runner-"));
  onTestFinished(() => {
    for (const name of ["pnpm-pid"]) {
      const pidFile = path.join(directory, name);
      if (!existsSync(pidFile)) continue;
      const pid = Number(readFileSync(pidFile, "utf8"));
      if (!Number.isInteger(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function writeBinary(directory, name, source) {
  const binary = path.join(directory, name);
  writeFileSync(binary, source);
  chmodSync(binary, 0o755);
}

function startRunner({ directory, immediateRun = false, env = {}, args = [] }) {
  const binaryDirectory = path.join(directory, "bin");
  mkdirSync(binaryDirectory);
  writeBinary(binaryDirectory, "docker", FAKE_DOCKER);
  writeBinary(binaryDirectory, "pnpm", FAKE_PNPM);

  const child = spawn(process.execPath, [runnerPath, ...args], {
    env: {
      ...process.env,
      PATH: `${binaryDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_DOCKER_STATE: directory,
      FAKE_PNPM_PID_FILE: path.join(directory, "pnpm-pid"),
      FAKE_PNPM_STARTED_FILE: path.join(directory, "pnpm-started"),
      FAKE_PNPM_TERM_FILE: path.join(directory, "pnpm-term"),
      ...(immediateRun ? { FAKE_DOCKER_IMMEDIATE_RUN: "1" } : {}),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  const exit = new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal, output }));
  });

  onTestFinished(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  });

  return { child, exit };
}

async function waitForFile(filePath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(filePath) && Date.now() < deadline) {
    await delay(10);
  }
  if (!existsSync(filePath)) {
    throw new Error(`timed out waiting for ${path.basename(filePath)}`);
  }
}

async function waitForMissing(filePath, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (existsSync(filePath) && Date.now() < deadline) {
    await delay(10);
  }
  return !existsSync(filePath);
}

function readinessAttempts(directory) {
  const file = path.join(directory, "readiness-attempts");
  return existsSync(file) ? Number(readFileSync(file, "utf8")) : 0;
}

async function waitForReadinessAttempts(directory, count, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (readinessAttempts(directory) < count && Date.now() < deadline) {
    await delay(10);
  }
  if (readinessAttempts(directory) < count) {
    throw new Error(`timed out waiting for ${count} readiness probes`);
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("after-sales PostgreSQL runner readiness", () => {
  it("queries the target database instead of trusting pg_isready", async () => {
    const directory = temporaryDirectory();
    const runner = startRunner({
      directory,
      immediateRun: true,
      env: {
        FAKE_DOCKER_READY_FAILURES: "2",
        FAKE_PNPM_EXIT_CODE: "0",
      },
    });

    // pg_isready in the fake already succeeds, but the target SQL probe fails
    // twice. A pg_isready-only runner would have started the test process.
    await waitForReadinessAttempts(directory, 2);
    expect(existsSync(path.join(directory, "pnpm-started"))).toBe(false);

    const result = await runner.exit;
    expect(result.code, result.output).toBe(0);
    expect(readinessAttempts(directory)).toBe(3);
    expect(existsSync(path.join(directory, "pnpm-started"))).toBe(true);

    const calls = readFileSync(path.join(directory, "calls.log"), "utf8");
    expect(calls).toContain(" psql -h 127.0.0.1 ");
    expect(calls).not.toContain("pg_isready");
    expect(
      await waitForMissing(path.join(directory, "container")),
      `container survived runner exit\n${result.output}`,
    ).toBe(true);
  }, 20_000);

  it("bounds a hung readiness probe and continues until the target database responds", async () => {
    const directory = temporaryDirectory();
    const runner = startRunner({
      directory,
      immediateRun: true,
      env: {
        FAKE_DOCKER_HANG_READINESS: "1",
        FAKE_PNPM_EXIT_CODE: "0",
      },
    });

    const result = await runner.exit;
    expect(result.code, result.output).toBe(0);
    // The first command was killed by the per-command timeout, then retried.
    expect(readinessAttempts(directory)).toBe(2);
    expect(existsSync(path.join(directory, "pnpm-started"))).toBe(true);
    expect(
      await waitForMissing(path.join(directory, "container")),
      `container survived runner exit\n${result.output}`,
    ).toBe(true);
  }, 30_000);
});

describe("after-sales PostgreSQL runner fixed modes", () => {
  it("rejects arbitrary database URLs and commands before Docker runs", async () => {
    const directory = temporaryDirectory();
    const runner = startRunner({
      directory,
      immediateRun: true,
      args: ["--database-url=postgres://production.example/app"],
    });
    const result = await runner.exit;

    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Usage:");
    expect(existsSync(path.join(directory, "calls.log"))).toBe(false);
    expect(existsSync(path.join(directory, "pnpm-started"))).toBe(false);
  });

  it("accepts only the single fixed --browser mode flag", async () => {
    const directory = temporaryDirectory();
    const runner = startRunner({
      directory,
      immediateRun: true,
      args: ["--browser", "--command=sh"],
    });
    const result = await runner.exit;

    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Usage:");
    expect(existsSync(path.join(directory, "calls.log"))).toBe(false);
    expect(existsSync(path.join(directory, "pnpm-started"))).toBe(false);
  });
});

describe("after-sales PostgreSQL runner signal lifecycle", () => {
  it("waits out an in-flight docker run before cleanup and removes its container", async () => {
    const directory = temporaryDirectory();
    const runner = startRunner({ directory });
    const containerFile = path.join(directory, "container");
    const createdFile = path.join(directory, "created");
    const allowRunFile = path.join(directory, "allow-run");

    await waitForFile(path.join(directory, "run-started"));
    runner.child.kill("SIGTERM");

    // The buggy runner exits during setup, before the daemon creates anything.
    // Give it that window, then let the delayed docker run finish regardless.
    const exitedDuringSetup = await Promise.race([
      runner.exit.then(() => true),
      delay(750).then(() => false),
    ]);
    writeFileSync(allowRunFile, "");

    const result = await runner.exit;
    await waitForFile(createdFile);

    expect(result.code).not.toBe(0);
    expect(
      await waitForMissing(containerFile),
      `delayed container survived runner exit (exitedDuringSetup=${exitedDuringSetup})\n${result.output}`,
    ).toBe(true);
    expect(existsSync(path.join(directory, "pnpm-started"))).toBe(false);
  }, 20_000);

  it("aborts the active test process group before cleaning up", async () => {
    const directory = temporaryDirectory();
    const runner = startRunner({ directory, immediateRun: true });
    const pidFile = path.join(directory, "pnpm-pid");

    await waitForFile(path.join(directory, "pnpm-started"));
    const pid = Number(readFileSync(pidFile, "utf8"));
    runner.child.kill("SIGTERM");
    const result = await runner.exit;

    await waitForFile(path.join(directory, "pnpm-term"));
    expect(result.code).not.toBe(0);
    expect(isProcessAlive(pid)).toBe(false);
    expect(
      await waitForMissing(path.join(directory, "container")),
      `container survived runner exit\n${result.output}`,
    ).toBe(true);
  }, 20_000);
});
