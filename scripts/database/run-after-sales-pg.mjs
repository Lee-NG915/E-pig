import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildChildEnv,
  createInstanceIdentity,
  parseDockerPortOutput,
  PG_TEST_IMAGE,
  TEST_DATABASE,
  TEST_USER,
} from "./after-sales-pg-safety.mjs";
import { runInProcessGroup } from "./after-sales-pg-process.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const READY_TIMEOUT_MS = 60_000;
const TEST_PROCESS_TIMEOUT_MS = 240_000;
const TEST_PROCESS_TERM_GRACE_MS = 5_000;
const VITEST_CONFIG = "scripts/database/after-sales-pg.vitest.config.ts";

let containerName;
let containerCreated = false;
let cleanupPromise;
let activeRun;
let requestedSignal;

function log(message) {
  console.info(`[after-sales-pg] ${message}`);
}

function throwIfCancelled() {
  if (requestedSignal) {
    throw new Error(`run cancelled by ${requestedSignal}`);
  }
}

async function docker(args, options = {}) {
  return execFileAsync("docker", args, {
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

async function requireDocker() {
  try {
    const { stdout } = await docker(["version", "--format", "{{.Server.Version}}"]);
    log(`docker_server=${stdout.trim()}`);
  } catch {
    throw new Error("Docker is unavailable; this command fails instead of skipping");
  }
  try {
    await docker(["image", "inspect", PG_TEST_IMAGE, "--format", "{{.Id}}"]);
  } catch {
    throw new Error(`${PG_TEST_IMAGE} is not available locally; pull it explicitly and rerun`);
  }
}

async function waitUntilReady(name) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    throwIfCancelled();
    try {
      await docker(["exec", name, "pg_isready", "-U", TEST_USER, "-d", TEST_DATABASE]);
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`PostgreSQL did not become ready within ${READY_TIMEOUT_MS}ms`);
}

async function serverVersion(name) {
  const { stdout } = await docker([
    "exec",
    name,
    "psql",
    "-U",
    TEST_USER,
    "-d",
    TEST_DATABASE,
    "-tAc",
    "SHOW server_version",
  ]);
  return stdout.trim();
}

async function durableRowCounts(name) {
  const { stdout } = await docker([
    "exec",
    name,
    "psql",
    "-U",
    TEST_USER,
    "-d",
    TEST_DATABASE,
    "-tAc",
    "SELECT (SELECT count(*) FROM after_sales_requests)::text || ',' || (SELECT count(*) FROM after_sales_tickets)::text",
  ]);
  const [requests, tickets] = stdout.trim().split(",").map((value) => Number(value));
  return { requests, tickets };
}

function runTests(childEnv, signal) {
  return runInProcessGroup({
    command: "pnpm",
    args: ["exec", "vitest", "run", "--config", VITEST_CONFIG],
    cwd: repositoryRoot,
    env: childEnv,
    stdio: "inherit",
    timeoutMs: TEST_PROCESS_TIMEOUT_MS,
    termGraceMs: TEST_PROCESS_TERM_GRACE_MS,
    signal,
    onTimeout: () => {
      log(`test_process_timeout=${TEST_PROCESS_TIMEOUT_MS}ms; terminating process group`);
    },
  });
}

async function cleanup() {
  if (!containerName || !containerCreated) return true;
  const name = containerName;
  let volumes = [];
  try {
    const { stdout } = await docker([
      "inspect",
      "-f",
      '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{"\\n"}}{{end}}{{end}}',
      name,
    ]);
    volumes = stdout.split(/\r?\n/).filter(Boolean);
  } catch {
    // The container may not have been created; there is nothing owned to clean.
  }

  try {
    await docker(["rm", "-f", "-v", name]);
  } catch {
    // Already removed or never created; verification below is authoritative.
  }

  let volumesRemaining = 0;
  let removedVolumes = 0;
  for (const volume of volumes) {
    try {
      await docker(["volume", "inspect", volume]);
    } catch {
      removedVolumes += 1;
      continue;
    }
    try {
      await docker(["volume", "rm", "-f", volume]);
    } catch {
      // Fall through to the verification below; never run global docker cleanup.
    }
    try {
      await docker(["volume", "inspect", volume]);
      volumesRemaining += 1;
    } catch {
      removedVolumes += 1;
    }
  }

  let containerRemoved = true;
  try {
    await docker(["inspect", name]);
    containerRemoved = false;
  } catch {
    containerRemoved = true;
  }

  const clean = containerRemoved && volumesRemaining === 0;
  log(
    `cleanup container=${name} container_removed=${containerRemoved} `
      + `tracked_volumes=${volumes.length} removed_volumes=${removedVolumes} `
      + `remaining_volumes=${volumesRemaining} clean=${clean}`,
  );
  return clean;
}

function cleanupOnce() {
  cleanupPromise ??= cleanup();
  return cleanupPromise;
}

async function main() {
  const identity = createInstanceIdentity();
  containerName = identity.containerName;
  const password = randomBytes(24).toString("base64url");

  await requireDocker();
  throwIfCancelled();

  // The password is passed through the docker CLI environment, not argv. The
  // flag is set before run settles: once the request reaches the daemon, a
  // container may exist even if this CLI process is interrupted.
  containerCreated = true;
  await docker(
    [
      "run",
      "-d",
      "--name",
      identity.containerName,
      "--label",
      identity.scopeLabel,
      "--label",
      identity.instanceLabel,
      "-e",
      "POSTGRES_USER",
      "-e",
      "POSTGRES_DB",
      "-e",
      "POSTGRES_PASSWORD",
      "-p",
      "127.0.0.1::5432",
      PG_TEST_IMAGE,
    ],
    {
      env: {
        ...process.env,
        POSTGRES_USER: TEST_USER,
        POSTGRES_DB: TEST_DATABASE,
        POSTGRES_PASSWORD: password,
      },
    },
  );
  throwIfCancelled();

  await waitUntilReady(identity.containerName);
  throwIfCancelled();
  const { stdout: portOutput } = await docker([
    "port",
    identity.containerName,
    "5432/tcp",
  ]);
  const { host, port } = parseDockerPortOutput(portOutput);
  if (host !== "127.0.0.1") {
    throw new Error("The dedicated PostgreSQL port is not loopback-only");
  }
  throwIfCancelled();
  const version = await serverVersion(identity.containerName);
  log(
    `container=${identity.containerName} label=${identity.instanceLabel} `
      + `loopback=${host}:${port} pg_version=${version} database=${TEST_DATABASE} user=${TEST_USER}`,
  );
  throwIfCancelled();

  const childEnv = buildChildEnv({
    baseEnv: process.env,
    port,
    password,
    containerName: identity.containerName,
  });
  const controller = new AbortController();
  const testRun = runTests(childEnv, controller.signal);
  activeRun = { abort: () => controller.abort(), promise: testRun };
  const result = await testRun;
  activeRun = undefined;
  throwIfCancelled();
  const testExitCode =
    result.code === 0 &&
    result.signal === null &&
    !result.timedOut &&
    !result.aborted &&
    !result.spawnError
      ? 0
      : 1;
  log(
    `test_command_exit=${testExitCode} timed_out=${result.timedOut} aborted=${result.aborted} `
      + `signal=${result.signal ?? "none"} group_exited=${result.groupExited}`
      + (result.spawnError ? ` spawn_error=${result.spawnError.message}` : ""),
  );

  if (testExitCode === 0) {
    // A green Vitest run with no durable rows would mean the dedicated spec did
    // not actually execute; treat that as failure instead of skip-as-pass.
    const counts = await durableRowCounts(identity.containerName);
    log(`durable_rows requests=${counts.requests} tickets=${counts.tickets}`);
    if (counts.requests < 1 || counts.tickets < 1) {
      throw new Error("Dedicated spec exited 0 without durable after-sales rows; not accepting as passed");
    }
  }

  return testExitCode;
}

function requestCancellation(signal) {
  if (requestedSignal) return;
  requestedSignal = signal;
  log(`received=${signal}; cancelling and waiting for the current step to settle`);
  activeRun?.abort();
}

process.on("SIGINT", () => requestCancellation("SIGINT"));
process.on("SIGTERM", () => requestCancellation("SIGTERM"));

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  if (requestedSignal) {
    log(`cancelled by ${requestedSignal}: ${error instanceof Error ? error.message : String(error)}`);
  } else {
    log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
  exitCode = 1;
} finally {
  // Cleanup runs only after main settles: a SIGTERM during setup must not race
  // an in-flight docker run whose container the daemon may create afterwards.
  const clean = await cleanupOnce();
  process.exitCode = requestedSignal
    ? (clean ? 128 : 1)
    : (exitCode === 0 && clean ? 0 : 1);
}
