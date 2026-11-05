import { describe, expect, it } from "vitest";

import {
  MIGRATION_SCOPES,
  createMigrationPool,
  normalizeDriver,
  normalizeScope,
  parseMigrateArgs,
  resolveMigrationFiles,
  runMigrations,
} from "./migrate-lib.mjs";

function fakePool({ failOn } = {}) {
  const connections = [];
  const events = [];
  return {
    connections,
    events,
    async connect() {
      const connection = { index: connections.length };
      connections.push(connection);
      return {
        async query(sql) {
          events.push({ connection: connection.index, sql });
          if (failOn && sql.includes(failOn)) {
            throw new Error("synthetic failure with postgres://user:secret@db.example/app");
          }
          return { rows: [] };
        },
        release(destroy) {
          events.push({ connection: connection.index, release: destroy ?? false });
        },
      };
    },
    async end() {
      events.push({ end: true });
    },
  };
}

describe("migration scope allowlist", () => {
  it("keeps the old default scope at 001 only", () => {
    expect(normalizeScope(undefined)).toBe("default");
    expect(MIGRATION_SCOPES.default).toEqual(["001-commerce.sql"]);
    expect(resolveMigrationFiles("default").map((file) => file.pathname.split("/").at(-1)))
      .toEqual(["001-commerce.sql"]);
  });

  it("accepts only the explicit all scope for after-sales tables", () => {
    expect(resolveMigrationFiles("all").map((file) => file.pathname.split("/").at(-1)))
      .toEqual([
        "001-commerce.sql",
        "002-after-sales-requests.sql",
        "003-after-sales-tickets.sql",
      ]);
    expect(() => normalizeScope("../../etc/passwd")).toThrow(/scope/);
    expect(() => resolveMigrationFiles("002-only")).toThrow(/scope/);
  });

  it("parses explicit scope arguments and rejects arbitrary input", () => {
    expect(parseMigrateArgs([])).toEqual({ scope: "default" });
    expect(parseMigrateArgs(["--scope", "all"])).toEqual({ scope: "all" });
    expect(parseMigrateArgs(["--scope=all"])).toEqual({ scope: "all" });
    expect(() => parseMigrateArgs(["--scope"])).toThrow(/value/);
    expect(() => parseMigrateArgs(["--scope", "all", "--scope", "default"])).toThrow(/once/);
    expect(() => parseMigrateArgs(["--sql", "DROP TABLE"])).toThrow(/Unsupported/);
  });

  it("allows only the two explicit database drivers", () => {
    expect(normalizeDriver(undefined)).toBe("neon");
    expect(normalizeDriver("neon")).toBe("neon");
    expect(normalizeDriver("tcp")).toBe("tcp");
    expect(() => normalizeDriver("sqlite")).toThrow(/DATABASE_DRIVER/);
  });

  it("fails without a connection URL before touching a database", () => {
    expect(() => createMigrationPool({ connectionString: "" })).toThrow(/DATABASE_URL/);
  });
});

describe("runMigrations", () => {
  it("executes each allowlisted file through its own connection", async () => {
    const pool = fakePool();

    const applied = await runMigrations({ pool, scope: "all" });

    expect(applied).toEqual([
      "001-commerce.sql",
      "002-after-sales-requests.sql",
      "003-after-sales-tickets.sql",
    ]);
    expect(pool.connections).toHaveLength(3);
    expect(pool.connections.map((connection) => connection.index)).toEqual([0, 1, 2]);
  });

  it("stops after a failed file and does not leak the connection string", async () => {
    const pool = fakePool({ failOn: "after_sales_attachments" });
    const failure = await runMigrations({ pool, scope: "all" }).catch((error) => error);

    expect(failure.message).toBe(
      "Migration failed; check database connectivity and migration permissions",
    );
    expect(failure.message).not.toMatch(/secret|db\.example|postgres:/);
    expect(pool.connections).toHaveLength(3);
    const rollback = pool.events.filter((event) => event.sql === "ROLLBACK");
    expect(rollback.length).toBe(1);
    expect(pool.events.some((event) => event.release === true)).toBe(false);
  });

  it("does not end a caller-owned pool", async () => {
    const owned = fakePool();

    await runMigrations({ pool: owned, scope: "default" });

    expect(owned.events.some((event) => event.end)).toBe(false);
  });
});
