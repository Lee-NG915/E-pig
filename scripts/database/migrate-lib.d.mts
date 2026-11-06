import type { Pool } from "pg";

export const MIGRATION_SCOPES: Readonly<
  Record<"default" | "all", readonly string[]>
>;
export const MIGRATION_DRIVERS: readonly string[];
export const GENERIC_FAILURE: string;

export function normalizeScope(value?: string): "default" | "all";
export function normalizeDriver(value?: string): "neon" | "tcp";
export function parseMigrateArgs(argv: string[]): { scope: "default" | "all" };
export function resolveMigrationFiles(scope?: string): URL[];

export type MigrationPoolLike = {
  connect(): Promise<{
    query(
      sql: string,
      values?: unknown[],
    ): Promise<{ rows: Record<string, unknown>[] }>;
    release?(destroy?: boolean): void;
  }>;
  end?(): Promise<void>;
};

export function createMigrationPool(options?: {
  connectionString?: string;
  driver?: string;
  poolConfig?: Record<string, unknown>;
}): MigrationPoolLike | Pool;

export function runMigrations(options?: {
  connectionString?: string;
  driver?: string;
  scope?: string;
  poolConfig?: Record<string, unknown>;
  pool?: MigrationPoolLike | Pool;
  readFileFn?: (file: URL, encoding: "utf8") => Promise<string>;
}): Promise<string[]>;
