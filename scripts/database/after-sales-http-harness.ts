import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  signalProcessGroup,
  terminateProcessGroup,
} from "./after-sales-process-group.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDirectory, "../..");

const COPY_FILES = [
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "postcss.config.mjs",
  "components.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
];
const COPY_DIRECTORIES = ["src", "public"];
const STOP_TERM_GRACE_MS = 5_000;
const STOP_KILL_WAIT_MS = 2_000;
const SIGNAL_TERM_GRACE_MS = 1_500;
const SIGNAL_KILL_WAIT_MS = 1_500;

/**
 * Any inherited variable that could point the app at a real database, a real
 * payment provider or a real marketplace deployment is stripped. Only the
 * runner-owned synthetic configuration is added back.
 */
const BLOCKED_ENV = /^(?:DATABASE_URL|DATABASE_DRIVER|NEON_DATABASE_URL|PG[A-Z_]*|POSTGRES_[A-Z_]*|AFTER_SALES_.*|COMMERCE_ADAPTER|MARKET|NODE_ENV|NODE_OPTIONS|NODE_PATH|CART_COOKIE_SECRET|APP_ORIGIN|STRIPE_.*|LOG_LEVEL|NEXT_PUBLIC_.*|E_PIG_AFTER_SALES_PG_.*)$/;

/**
 * A stop is only a success when the whole detached group was observed gone.
 * Callers must never turn an unconfirmed cleanup into `server_stopped=true`.
 */
export function assertProcessGroupStopped(
  pgid: number | undefined,
  stopped: boolean,
): void {
  if (!stopped) {
    throw new Error(
      `Could not confirm cleanup of the Next dev process group${pgid ? ` (pgid ${pgid})` : ""}; `
        + "the last-resort exit kill remains armed",
    );
  }
}

export type ServerEnvironmentConfig = {
  market: string;
  databaseUrl: string;
  cookieSecret: string;
  serviceToken: string;
  origin: string;
};

export function buildServerEnvironment(
  baseEnv: NodeJS.ProcessEnv,
  config: ServerEnvironmentConfig,
): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(baseEnv)) {
    if (typeof value !== "string") continue;
    if (BLOCKED_ENV.test(name)) continue;
    env[name] = value;
  }
  return {
    ...env,
    NODE_ENV: "development",
    MARKET: config.market,
    COMMERCE_ADAPTER: "postgres",
    AFTER_SALES_ADAPTER: "postgres",
    DATABASE_DRIVER: "tcp",
    DATABASE_URL: config.databaseUrl,
    CART_COOKIE_SECRET: config.cookieSecret,
    APP_ORIGIN: config.origin,
    AFTER_SALES_SERVICE_TOKEN: config.serviceToken,
    AFTER_SALES_SERVICE_MARKETS: config.market,
    LOG_LEVEL: "error",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

export type ControlledCopy = {
  root: string;
  cleanup(): Promise<void>;
};

/**
 * Copy only the source and config Next needs, then link the already-installed
 * dependencies. The real repository `.env` files are never copied, moved or
 * modified; the copy fails closed if any `.env` entry appears.
 */
export async function copyControlledSource(): Promise<ControlledCopy> {
  const root = await mkdtemp(path.join(os.tmpdir(), "e-pig-after-sales-http-"));
  try {
    for (const file of COPY_FILES) {
      const source = path.join(repositoryRoot, file);
      if (existsSync(source)) await cp(source, path.join(root, file));
    }
    for (const directory of COPY_DIRECTORIES) {
      const source = path.join(repositoryRoot, directory);
      if (existsSync(source)) {
        await cp(source, path.join(root, directory), { recursive: true });
      }
    }

    const happyDogSource = path.join(repositoryRoot, "packages/happy-dog");
    const happyDogTarget = path.join(root, "packages/happy-dog");
    await mkdir(happyDogTarget, { recursive: true });
    for (const entry of ["package.json", "tsconfig.json", "src"]) {
      const source = path.join(happyDogSource, entry);
      if (existsSync(source)) {
        await cp(source, path.join(happyDogTarget, entry), { recursive: true });
      }
    }
    const happyDogModules = path.join(happyDogSource, "node_modules");
    if (existsSync(happyDogModules)) {
      await symlink(happyDogModules, path.join(happyDogTarget, "node_modules"), "dir");
    }

    const sourceModules = path.join(repositoryRoot, "node_modules");
    const targetModules = path.join(root, "node_modules");
    await mkdir(targetModules, { recursive: true });
    for (const entry of await readdir(sourceModules)) {
      if (entry === "@e-pig" || entry === "@swc") continue;
      await symlink(path.join(sourceModules, entry), path.join(targetModules, entry));
    }
    await mkdir(path.join(targetModules, "@e-pig"), { recursive: true });
    await symlink(happyDogTarget, path.join(targetModules, "@e-pig", "happy-dog"), "dir");

    // pnpm keeps webpack's externalized @swc/helpers under .pnpm instead of the
    // root. The webpack middleware bundle is loaded from .next/dev/server, so it
    // needs a resolvable node_modules path in the controlled copy.
    const swcHelpers = await locatePnpmPackage(sourceModules, "@swc+helpers@", "@swc/helpers");
    if (swcHelpers) {
      await mkdir(path.join(targetModules, "@swc"), { recursive: true });
      await symlink(swcHelpers, path.join(targetModules, "@swc", "helpers"), "dir");
    }

    const envFiles = (await readdir(root)).filter((name) => name.startsWith(".env"));
    if (envFiles.length > 0) {
      throw new Error(`The controlled source copy must not contain env files: ${envFiles.join(",")}`);
    }
    return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function locatePnpmPackage(
  nodeModules: string,
  prefix: string,
  packagePath: string,
): Promise<string | null> {
  const pnpmDirectory = path.join(nodeModules, ".pnpm");
  if (!existsSync(pnpmDirectory)) return null;
  const entry = (await readdir(pnpmDirectory))
    .sort()
    .find((name) => name.startsWith(prefix));
  if (!entry) return null;
  const candidate = path.join(pnpmDirectory, entry, "node_modules", packagePath);
  return existsSync(candidate) ? candidate : null;
}

export async function findFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a loopback port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

export type LoopbackSocket = {
  localAddress: string | undefined;
  localPort: number | undefined;
  remoteAddress: string | undefined;
  remotePort: number | undefined;
};

/** Record the actual TCP socket used to reach the Next dev server. */
export async function recordLoopbackSocket(port: number, timeoutMs = 10_000): Promise<LoopbackSocket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Loopback socket probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      const result = {
        localAddress: socket.localAddress,
        localPort: socket.localPort,
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
      };
      socket.end();
      resolve(result);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export type NextDevServer = {
  child: ChildProcess;
  port: number;
  origin: string;
  output(): string;
  waitUntilReady(timeoutMs?: number): Promise<void>;
  stop(): Promise<void>;
};

export type StartNextDevOptions = {
  root: string;
  port: number;
  market: string;
  env: NodeJS.ProcessEnv;
  secrets: readonly string[];
};

export function startNextDev({
  root,
  port,
  market,
  env,
  secrets,
}: StartNextDevOptions): NextDevServer {
  const nextBin = path.join(repositoryRoot, "node_modules/next/dist/bin/next");
  const origin = `http://localhost:${port}`;
  let output = "";
  const redact = (value: string) => secrets.reduce(
    (current, secret) => secret ? current.split(secret).join("[redacted]") : current,
    value,
  );
  const capture = (chunk: Buffer) => {
    output += chunk.toString();
    if (output.length > 200_000) output = output.slice(-100_000);
  };

  const child = spawn(
    process.execPath,
    [
      nextBin,
      "dev",
      // The isolated copy links dependencies; Turbopack rejects the workspace
      // root across that symlink, so this test pins the webpack dev server.
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  let exited = false;
  let spawnError: Error | null = null;
  child.once("exit", () => {
    exited = true;
  });
  child.once("error", (error) => {
    spawnError = error;
    exited = true;
  });

  const pgid = child.pid;
  let stopPromise: Promise<boolean> | undefined;

  function stopGroup(termGraceMs: number, killWaitMs: number) {
    stopPromise ??= terminateProcessGroup({ pgid, termGraceMs, killWaitMs })
      .then((stopped) => {
        if (stopped) {
          process.removeListener("exit", onExit);
          process.removeListener("SIGTERM", onSigterm);
          process.removeListener("SIGINT", onSigint);
        }
        // An unconfirmed stop leaves onExit armed, so the final process exit
        // still SIGKILLs any group member that survived the bounded wait.
        return stopped;
      });
    return stopPromise;
  }

  async function stopAfterFailure(error: Error): Promise<never> {
    const stopped = await stopGroup(STOP_TERM_GRACE_MS, STOP_KILL_WAIT_MS);
    try {
      assertProcessGroupStopped(pgid, stopped);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Next dev failed and its process group could not be cleaned up: ${error.message}`,
      );
    }
    throw error;
  }

  // The worker may exit without unwinding afterAll; a synchronous SIGKILL is
  // the last resort that keeps a detached Next group from outliving its test.
  function onExit() {
    signalProcessGroup(pgid, "SIGKILL");
  }

  function onSignal(exitCode: number) {
    // The PostgreSQL runner escalates its own group after five seconds, so a
    // forced signal gets a shorter bound than the graceful stop() path.
    if (stopPromise) signalProcessGroup(pgid, "SIGKILL");
    void stopGroup(SIGNAL_TERM_GRACE_MS, SIGNAL_KILL_WAIT_MS).then(
      (stopped) => process.exit(stopped ? exitCode : 1),
      () => process.exit(1),
    );
  }

  function onSigterm() {
    onSignal(143);
  }

  function onSigint() {
    onSignal(130);
  }

  process.once("exit", onExit);
  process.once("SIGTERM", onSigterm);
  process.once("SIGINT", onSigint);

  const server: NextDevServer = {
    child,
    port,
    origin,
    output: () => redact(output),
    async waitUntilReady(timeoutMs = 120_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (exited) {
          const error = new Error(
            `Next dev exited before becoming ready${spawnError ? `: ${spawnError.message}` : ""}:\n`
              + server.output().slice(-8_000),
          );
          // The leader may have exited while workers in its group survive.
          await stopAfterFailure(error);
        }
        try {
          const response = await fetch(`${origin}/api/${market}/after-sales/requests/health`, {
            headers: { "X-After-Sales-Contract-Version": "1" },
            signal: AbortSignal.timeout(5_000),
            cache: "no-store",
          });
          void response.body?.cancel().catch(() => undefined);
          // The probe expects an auth/route response, not a compile-time 500.
          if (response.status < 500) return;
        } catch {
          // Not accepting connections yet.
        }
        await delay(250);
      }
      const error = new Error(
        `Next dev was not ready within ${timeoutMs}ms:\n${server.output().slice(-8_000)}`,
      );
      await stopAfterFailure(error);
    },
    async stop() {
      // Always address the whole group, even when the leader has already
      // exited: a detached worker can still own the loopback port.
      const stopped = await stopGroup(STOP_TERM_GRACE_MS, STOP_KILL_WAIT_MS);
      assertProcessGroupStopped(pgid, stopped);
    },
  };

  return server;
}

/** Test-only guard: refusal to start is better than pointing at a real database. */
export function assertNoEnvFiles(root: string) {
  if (readdirSync(root).some((name) => name.startsWith(".env"))) {
    throw new Error("The controlled HTTP test copy contains an env file");
  }
}
