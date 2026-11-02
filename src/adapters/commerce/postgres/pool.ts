import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { AppError } from "@/core/errors/errors";
import { logger } from "@/platform/logging/logger";

export interface CommerceQuery {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export interface CommerceConnection extends CommerceQuery { release(): void }
export interface CommercePool extends CommerceQuery { connect(): Promise<CommerceConnection> }

/** Injected credentials, one concrete PostgreSQL implementation; no request-time DDL. */
export function createCommercePool(connectionString: string): CommercePool {
  if (!connectionString) throw new AppError("upstream", "Commerce database is not configured");
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 });
  // Idle clients can disconnect between requests. The driver removes the failed
  // client; handle its event without exposing connection details in the error.
  pool.on("error", () => logger.error("commerce.pool_idle_error"));
  return pool;
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
