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
  if (args[0] === "port") {
    console.log("127.0.0.1:49153");
    return;
  }
  if (args[0] === "exec" && args.includes("SHOW server_version")) {
    console.log("16.4");
    return;
  }
  if (args[0] === "exec" && args.some((value) => value.startsWith("SELECT"))) {
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

function startRunner({ directory, immediateRun = false }) {
  const binaryDirectory = path.join(directory, "bin");
  mkdirSync(binaryDirectory);
  writeBinary(binaryDirectory, "docker", FAKE_DOCKER);
  writeBinary(binaryDirectory, "pnpm", FAKE_PNPM);

  const child = spawn(process.execPath, [runnerPath], {
    env: {
      ...process.env,
      PATH: `${binaryDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_DOCKER_STATE: directory,
      FAKE_PNPM_PID_FILE: path.join(directory, "pnpm-pid"),
      FAKE_PNPM_STARTED_FILE: path.join(directory, "pnpm-started"),
      FAKE_PNPM_TERM_FILE: path.join(directory, "pnpm-term"),
      ...(immediateRun ? { FAKE_DOCKER_IMMEDIATE_RUN: "1" } : {}),
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

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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
