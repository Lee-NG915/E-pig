import { readFile } from "node:fs/promises";

import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";

/**
 * Fixed allowlist. Neither the CLI nor request-time code may pass arbitrary
 * file paths or SQL; the only choice is one of these two named scopes.
 */
export const MIGRATION_SCOPES = Object.freeze({
  default: Object.freeze([
    "001-commerce.sql",
  ]),
  all: Object.freeze([
    "001-commerce.sql",
    "002-after-sales-requests.sql",
    "003-after-sales-tickets.sql",
  ]),
});

export const MIGRATION_DRIVERS = Object.freeze(["neon", "tcp"]);

const GENERIC_FAILURE =
  "Migration failed; check database connectivity and migration permissions";

export function normalizeScope(value) {
  const scope = value ?? "default";
  if (!Object.hasOwn(MIGRATION_SCOPES, scope)) {
    throw new Error("Unsupported migration scope; use default or all");
  }
  return scope;
}

export function normalizeDriver(value) {
  const driver = value ?? "neon";
  if (!MIGRATION_DRIVERS.includes(driver)) {
    throw new Error("Unsupported DATABASE_DRIVER; use neon or tcp");
  }
  return driver;
}

export function parseMigrateArgs(argv) {
  let scope;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--scope") {
      if (scope !== undefined) throw new Error("--scope may only be supplied once");
      const value = argv[index + 1];
      if (!value) throw new Error("--scope requires a value");
      scope = value;
      index += 1;
    } else if (argument.startsWith("--scope=")) {
      if (scope !== undefined) throw new Error("--scope may only be supplied once");
      scope = argument.slice("--scope=".length);
    } else {
      throw new Error(`Unsupported argument: ${argument}`);
    }
  }
  return { scope: normalizeScope(scope) };
}

/** Resolve only allowlisted migration files, relative to this module. */
export function resolveMigrationFiles(scope) {
  return MIGRATION_SCOPES[normalizeScope(scope)].map(
    (name) => new URL(`./${name}`, import.meta.url),
  );
}

export function createMigrationPool({
  connectionString,
  driver = "neon",
  poolConfig = {},
} = {}) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required; no fallback database exists");
  }
  const options = {
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ...poolConfig,
  };
  const selected = normalizeDriver(driver);
  if (selected === "neon") {
    neonConfig.webSocketConstructor = WebSocket;
    return new NeonPool(options);
  }
  return new PgPool(options);
}

/**
 * Each migration file already carries its own BEGIN/COMMIT, so one file is one
 * transaction. There is intentionally no cross-file atomicity claim: if file
 * 003 fails, 001 and 002 stay committed, and the next run resumes from the
 * allowlist because every statement is idempotent.
 */
export async function runMigrations({
  connectionString,
  driver = "neon",
  scope = "default",
  poolConfig,
  pool,
  readFileFn = readFile,
} = {}) {
  const files = resolveMigrationFiles(scope);
  const db = pool ?? createMigrationPool({
    connectionString,
    driver: normalizeDriver(driver),
    poolConfig,
  });
  const ownsPool = pool === undefined;
  const applied = [];

  try {
    for (const file of files) {
      const sql = await readFileFn(file, "utf8");
      let client;
      try {
        client = await db.connect();
      } catch (error) {
        // Connectivity failures can include driver-formatted connection data.
        throw new Error(GENERIC_FAILURE, { cause: error });
      }
      let destroyClient = false;
      try {
        await client.query(sql);
        applied.push(file.pathname.split("/").at(-1));
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // An aborted connection must not return to the pool.
          destroyClient = true;
        }
        throw new Error(GENERIC_FAILURE, { cause: error });
      } finally {
        if (typeof client.release === "function") {
          client.release(destroyClient ? true : undefined);
        }
      }
    }
  } finally {
    if (ownsPool) await db.end?.();
  }

  return applied;
}

export { GENERIC_FAILURE };
