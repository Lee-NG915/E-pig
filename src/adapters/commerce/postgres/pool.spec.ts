import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  neonOptions: [] as Record<string, unknown>[],
  pgOptions: [] as Record<string, unknown>[],
  neonErrorHandlers: [] as Array<(error: Error) => void>,
}));

vi.mock("@neondatabase/serverless", () => ({
  neonConfig: {} as { webSocketConstructor?: unknown },
  Pool: class FakeNeonPool {
    constructor(options: Record<string, unknown>) {
      state.neonOptions.push(options);
    }
    on(event: string, handler: (error: Error) => void) {
      if (event === "error") state.neonErrorHandlers.push(handler);
      return this;
    }
    emit(event: string, error: Error) {
      if (event === "error") for (const handler of state.neonErrorHandlers) handler(error);
    }
    async query() {
      return { rows: [] };
    }
    async connect() {
      throw new Error("not used in this test");
    }
  },
}));

vi.mock("pg", () => ({
  Pool: class FakeTcpPool {
    constructor(options: Record<string, unknown>) {
      state.pgOptions.push(options);
    }
    on() {
      return this;
    }
    async query() {
      return { rows: [] };
    }
    async connect() {
      throw new Error("not used in this test");
    }
  },
}));

import { neonConfig } from "@neondatabase/serverless";
import { createCommercePool, transaction, type CommercePool } from "./pool";

beforeEach(() => {
  state.neonOptions.length = 0;
  state.pgOptions.length = 0;
  state.neonErrorHandlers.length = 0;
  neonConfig.webSocketConstructor = undefined;
});

afterEach(() => vi.restoreAllMocks());

describe("createCommercePool", () => {
  it("uses the neon driver by default with bounded connections and timeouts", () => {
    createCommercePool("postgres://buyer:secret@db.example/shop");

    expect(state.neonOptions).toEqual([{
      connectionString: "postgres://buyer:secret@db.example/shop",
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    }]);
    expect(state.pgOptions).toHaveLength(0);
    expect(neonConfig.webSocketConstructor).toBe(WebSocket);
  });

  it("uses pg only when tcp is explicitly selected", () => {
    createCommercePool("postgres://buyer:secret@db.example/shop", "tcp");

    expect(state.pgOptions).toEqual([{
      connectionString: "postgres://buyer:secret@db.example/shop",
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    }]);
    expect(state.neonOptions).toHaveLength(0);
    expect(neonConfig.webSocketConstructor).toBeUndefined();
  });

  it("handles repeated idle connection errors without leaking credentials", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    createCommercePool("postgres://buyer:secret@db.example/shop");
    const error = Object.assign(new Error("Disconnected postgres://buyer:secret@db.example/shop"), {
      code: "08006",
      detail: "secret connection configuration",
    });

    for (const handler of state.neonErrorHandlers) {
      expect(() => handler(error)).not.toThrow();
      expect(() => handler(error)).not.toThrow();
    }
    expect(log).toHaveBeenCalledTimes(2);
    const record = JSON.parse(log.mock.calls[0][0]);
    expect(record).toMatchObject({ level: "error", event: "commerce.pool_idle_error" });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|buyer|db\.example|postgres:/);
  });

  it("requires configured database credentials", () => {
    expect(() => createCommercePool("")).toThrow("Commerce database is not configured");
  });

  it("rejects an unregistered driver instead of guessing", () => {
    expect(() => createCommercePool(
      "postgres://buyer:secret@db.example/shop",
      "sqlite" as never,
    )).toThrow("Unsupported DATABASE_DRIVER: sqlite");
  });
});

describe("transaction", () => {
  function fakePool(
    options: { failWork?: boolean; failRollback?: boolean } = {},
  ) {
    const events: string[] = [];
    let released = false;
    const client = {
      async query(sql: string) {
        events.push(sql);
        if (options.failRollback && sql === "ROLLBACK") throw new Error("rollback failed");
        return { rows: [] };
      },
      release() {
        released = true;
        events.push("release");
      },
    };
    const pool: CommercePool = {
      async query() {
        return { rows: [] };
      },
      async connect() {
        return client;
      },
    };
    return { pool, events, released: () => released };
  }

  it("commits on success and releases the client", async () => {
    const fake = fakePool();

    await expect(transaction(fake.pool, async (db) => {
      await db.query("SELECT 1");
      return "ok";
    })).resolves.toBe("ok");

    expect(fake.events).toEqual(["BEGIN", "SELECT 1", "COMMIT", "release"]);
    expect(fake.released()).toBe(true);
  });

  it("rolls back and releases when the work fails", async () => {
    const fake = fakePool();

    await expect(transaction(fake.pool, async (db) => {
      await db.query("SELECT 1");
      throw new Error("synthetic failure");
    })).rejects.toThrow("synthetic failure");

    expect(fake.events).toEqual(["BEGIN", "SELECT 1", "ROLLBACK", "release"]);
    expect(fake.released()).toBe(true);
  });
});
