import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { Pool as TcpPool } from "pg";
import { AppError } from "@/core/errors/errors";
import { logger } from "@/platform/logging/logger";

export interface CommerceQuery {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export interface CommerceConnection extends CommerceQuery { release(): void }
export interface CommercePool extends CommerceQuery { connect(): Promise<CommerceConnection> }

/**
 * Two explicit transports. This is deliberately not a driver plugin registry:
 * `neon` preserves the existing WebSocket deployment path, while `tcp` is only
 * for Node-hosted local/isolated environments (including the dedicated PG
 * runner). A TCP driver is never selected implicitly.
 */
export type CommerceDatabaseDriver = "neon" | "tcp";

const POOL_LIMITS = {
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
} as const;

/** Injected credentials, one concrete PostgreSQL implementation; no request-time DDL. */
export function createCommercePool(
  connectionString: string,
  driver: CommerceDatabaseDriver = "neon",
): CommercePool {
  if (!connectionString) throw new AppError("upstream", "Commerce database is not configured");
  if (driver === "neon") return createNeonPool(connectionString);
  if (driver === "tcp") return createTcpPool(connectionString);
  throw new AppError("validation", `Unsupported DATABASE_DRIVER: ${String(driver)}`);
}

function createNeonPool(connectionString: string): CommercePool {
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString, ...POOL_LIMITS });
  attachIdleErrorHandler(pool);
  return pool;
}

function createTcpPool(connectionString: string): CommercePool {
  // No TLS override is set here: credentials and sslmode come from the URL.
  // Never force rejectUnauthorized:false.
  const pool = new TcpPool({ connectionString, ...POOL_LIMITS });
  attachIdleErrorHandler(pool);
  return {
    async query(sql, values) {
      const result = values === undefined
        ? await pool.query(sql)
        : await pool.query(sql, values);
      return { rows: result.rows as Record<string, unknown>[] };
    },
    async connect() {
      const client = await pool.connect();
      let released = false;
      return {
        async query(sql, values) {
          const result = values === undefined
            ? await client.query(sql)
            : await client.query(sql, values);
          return { rows: result.rows as Record<string, unknown>[] };
        },
        release() {
          if (released) return;
          released = true;
          client.release();
        },
      };
    },
  };
}

function attachIdleErrorHandler(
  pool: { on(event: "error", listener: (error: Error) => void): unknown },
) {
  // Idle clients can disconnect between requests. The driver removes the failed
  // client; handle its event without exposing connection details in the error.
  pool.on("error", () => logger.error("commerce.pool_idle_error"));
}

export async function transaction<T>(pool: CommercePool, work: (db: CommerceQuery) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
