import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveMigrationFiles, runMigrations } from "./migrate-lib.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

if (process.env.E_PIG_AFTER_SALES_PG_TEST !== "1") {
  throw new Error("Run this spec only through pnpm test:after-sales:pg");
}
const pgPort = Number(process.env.PGPORT);
if (
  process.env.PGHOST !== "127.0.0.1"
  || !Number.isInteger(pgPort)
  || pgPort < 1
  || pgPort > 65535
  || !process.env.PGPASSWORD
) {
  throw new Error("The dedicated runner must provide loopback PG* credentials");
}

const EMPTY_SCHEMA = "as5d_empty";
const UPGRADE_SCHEMA = "as5d_upgrade";
const RERUN_SCHEMA = "as5d_rerun";
const INTERRUPTED_SCHEMA = "as5d_interrupted";
const SCHEMAS = [EMPTY_SCHEMA, UPGRADE_SCHEMA, RERUN_SCHEMA, INTERRUPTED_SCHEMA];

const databaseUrl = `postgres://${encodeURIComponent(process.env.PGUSER ?? "")}:`
  + `${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${pgPort}/`
  + `${encodeURIComponent(process.env.PGDATABASE ?? "")}`;

let adminPool: Pool;

function migrate(schema: string, scope: "default" | "all") {
  return runMigrations({
    connectionString: databaseUrl,
    driver: "tcp",
    scope,
    poolConfig: { options: `-c search_path=${schema}` },
  });
}

async function resetSchema(schema: string) {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
}

async function tableExists(schema: string, table: string): Promise<boolean> {
  const { rows } = await adminPool.query<{ name: string | null }>(
    "SELECT to_regclass($1)::text AS name",
    [`${schema}.${table}`],
  );
  const name = rows[0]?.name;
  // to_regclass omits the schema when it is already on the search_path.
  return name === `${schema}.${table}` || (schema === "public" && name === table);
}

async function rowCount(schema: string, table: string): Promise<number> {
  const { rows } = await adminPool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${schema}.${table}`,
  );
  return Number(rows[0]?.count ?? 0);
}

beforeAll(async () => {
  adminPool = new Pool({
    host: process.env.PGHOST,
    port: pgPort,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 4,
    connectionTimeoutMillis: 5_000,
    application_name: "e-pig-as5d-migration",
  });
  for (const schema of SCHEMAS) await resetSchema(schema);
});

afterAll(async () => {
  for (const schema of SCHEMAS) {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
  }
  await adminPool?.end();
});

describe("explicit after-sales migrations on isolated PostgreSQL", () => {
  it("applies 001/002/003 to an empty schema and creates key constraints", async () => {
    expect(await tableExists(EMPTY_SCHEMA, "after_sales_requests")).toBe(false);

    const applied = await migrate(EMPTY_SCHEMA, "all");

    expect(applied).toEqual([
      "001-commerce.sql",
      "002-after-sales-requests.sql",
      "003-after-sales-tickets.sql",
    ]);
    for (const table of ["after_sales_requests", "after_sales_attachments", "after_sales_tickets"]) {
      expect(await tableExists(EMPTY_SCHEMA, table)).toBe(true);
      expect(await rowCount(EMPTY_SCHEMA, table)).toBe(0);
    }

    const { rows } = await adminPool.query<{ table_name: string; constraint_type: string }>(
      `SELECT table_name, constraint_type
       FROM information_schema.table_constraints
       WHERE table_schema = $1
         AND table_name IN ('after_sales_requests', 'after_sales_attachments', 'after_sales_tickets')`,
      [EMPTY_SCHEMA],
    );
    const types = new Set(rows.map((row) => row.constraint_type));
    expect(types).toContain("PRIMARY KEY");
    expect(types).toContain("UNIQUE");
    expect(types).toContain("CHECK");
    expect(types).toContain("FOREIGN KEY");
  });

  it("upgrades a 001-only schema without deleting existing orders", async () => {
    await migrate(UPGRADE_SCHEMA, "default");
    expect(await tableExists(UPGRADE_SCHEMA, "commerce_orders")).toBe(true);
    expect(await tableExists(UPGRADE_SCHEMA, "after_sales_requests")).toBe(false);

    const timestamp = "2026-11-01T00:00:00.000Z";
    await adminPool.query(
      `INSERT INTO ${UPGRADE_SCHEMA}.commerce_carts (id, market, creation_key, data)
       VALUES ($1, $2, $3, $4::jsonb)`,
      ["cart_5d_upgrade", "au", "creation_5d_upgrade", JSON.stringify({ id: "cart_5d_upgrade" })],
    );
    await adminPool.query(
      `INSERT INTO ${UPGRADE_SCHEMA}.commerce_checkouts
         (id, cart_id, market, revision, input_signature, data, payment_request, first_attempt_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
      [
        "chk_5d_upgrade",
        "cart_5d_upgrade",
        "au",
        0,
        "sig_5d_upgrade",
        JSON.stringify({ id: "chk_5d_upgrade" }),
        JSON.stringify({ checkoutId: "chk_5d_upgrade" }),
        timestamp,
      ],
    );
    await adminPool.query(
      `INSERT INTO ${UPGRADE_SCHEMA}.commerce_orders (id, checkout_id, cart_id, market, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      ["ord_5d_upgrade", "chk_5d_upgrade", "cart_5d_upgrade", "au", JSON.stringify({ id: "ord_5d_upgrade" })],
    );

    await migrate(UPGRADE_SCHEMA, "all");

    expect(await tableExists(UPGRADE_SCHEMA, "after_sales_requests")).toBe(true);
    expect(await rowCount(UPGRADE_SCHEMA, "commerce_orders")).toBe(1);
    expect(await rowCount(UPGRADE_SCHEMA, "after_sales_requests")).toBe(0);
    const { rows } = await adminPool.query<{ id: string }>(
      `SELECT id FROM ${UPGRADE_SCHEMA}.commerce_orders`,
    );
    expect(rows).toEqual([{ id: "ord_5d_upgrade" }]);
  });

  it("is rerunnable without creating after-sales rows", async () => {
    const first = await migrate(RERUN_SCHEMA, "all");
    const second = await migrate(RERUN_SCHEMA, "all");

    expect(first).toEqual(second);
    for (const table of ["after_sales_requests", "after_sales_attachments", "after_sales_tickets"]) {
      expect(await rowCount(RERUN_SCHEMA, table)).toBe(0);
    }
  });

  it("resumes after a partially applied 003 file", async () => {
    await migrate(INTERRUPTED_SCHEMA, "default");

    const source = await readFile(resolveMigrationFiles("all")[2], "utf8");
    const statements = source
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0 && /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+after_sales_attachments/i.test(statement));
    expect(statements).toHaveLength(1);
    const partialClient = await adminPool.connect();
    try {
      await partialClient.query(`SET search_path TO ${INTERRUPTED_SCHEMA}`);
      await partialClient.query(statements[0]);
    } finally {
      await partialClient.query("SET search_path TO public").catch(() => undefined);
      partialClient.release();
    }
    expect(await tableExists(INTERRUPTED_SCHEMA, "after_sales_attachments")).toBe(true);
    expect(await tableExists(INTERRUPTED_SCHEMA, "after_sales_tickets")).toBe(false);

    const applied = await migrate(INTERRUPTED_SCHEMA, "all");

    expect(applied).toEqual([
      "001-commerce.sql",
      "002-after-sales-requests.sql",
      "003-after-sales-tickets.sql",
    ]);
    expect(await tableExists(INTERRUPTED_SCHEMA, "after_sales_tickets")).toBe(true);
    expect(await tableExists(INTERRUPTED_SCHEMA, "after_sales_ticket_keys")).toBe(true);
  });

  it("does not leak the connection string when connecting fails", async () => {
    const failure = await runMigrations({
      connectionString: "postgres://synthetic:super-secret-password@127.0.0.1:1/missing",
      driver: "tcp",
      scope: "all",
      poolConfig: { connectionTimeoutMillis: 500 },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Migration failed; check database connectivity and migration permissions",
    );
    expect((failure as Error).message).not.toMatch(/super-secret|postgres:/);
  });

  it("exposes the rerunnable package command through the CLI", async () => {
    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_DRIVER: "tcp",
    };
    for (let run = 0; run < 2; run += 1) {
      const { stdout } = await execFileAsync(
        process.execPath,
        [path.join(repositoryRoot, "scripts/database/migrate.mjs"), "--scope", "all"],
        { env, timeout: 30_000 },
      );
      expect(stdout).toContain("Commerce schema migration complete scope=all");
      expect(stdout).not.toContain(process.env.PGPASSWORD ?? "never-matches");
    }
    expect(await tableExists("public", "after_sales_requests")).toBe(true);
  });
});
