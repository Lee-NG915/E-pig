import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresAfterSalesAdapter } from "@/adapters/after-sales/postgres/after-sales";
import type {
  AfterSalesPort,
  ConsumerPrincipal,
  CreateServiceTicketInput,
  ServicePrincipal,
} from "@/core/contracts/after-sales";
import type { CommercePool } from "@/adapters/commerce/postgres/pool";
import { getMarket } from "@/platform/config/markets";

/**
 * Stage 5c runs only through `pnpm test:after-sales:pg`. The runner creates a
 * fresh PostgreSQL 16 container bound to 127.0.0.1 on a random port and passes
 * only PG* variables to this process. There is deliberately no DATABASE_URL
 * entry point: a direct run without the dedicated runner fails instead of
 * silently pointing at an existing database.
 */
const APP_NAME = "e-pig-as5c";
const EXPECTED_DATABASE = "e_pig_5c";
const EXPECTED_USER = "e_pig_test";
const LOOPBACK_HOST = "127.0.0.1";
const WAIT_TIMEOUT_MS = 5_000;
const GATE_TIMEOUT_MS = 15_000;
const MARKET = "au" as const;

if (process.env.E_PIG_AFTER_SALES_PG_TEST !== "1") {
  throw new Error(
    "Run this spec only through pnpm test:after-sales:pg; arbitrary database URLs are not accepted",
  );
}
const pgPort = Number(process.env.PGPORT);
if (
  process.env.PGHOST !== LOOPBACK_HOST
  || !Number.isInteger(pgPort)
  || pgPort < 1
  || pgPort > 65535
) {
  throw new Error("The dedicated runner must provide a loopback PGHOST and numeric PGPORT");
}
if (
  process.env.PGDATABASE !== EXPECTED_DATABASE
  || process.env.PGUSER !== EXPECTED_USER
) {
  throw new Error("The dedicated after-sales database and user are not configured");
}
if (!/^e-pig-as5c-[0-9a-f]{16}$/.test(process.env.E_PIG_AFTER_SALES_PG_CONTAINER ?? "")) {
  throw new Error("The dedicated runner container marker is missing");
}

type Row = Record<string, unknown>;
type WaitBackend = { pid: number; query: string };

type QueryHookContext = {
  sql: string;
  values?: unknown[];
  connectionId: number;
  client: PoolClient;
};
type QueryHook = (context: QueryHookContext) => Promise<void> | void;

type GateOptions = {
  failMessage?: string;
  inspect?: (client: PoolClient) => Promise<void>;
};

const observedPids = new Set<number>();
let rawPool: Pool;
let observerPool: Pool;
let adapter: AfterSalesPort;
let observerAdapter: AfterSalesPort;

const consumer = (cartId: string): ConsumerPrincipal => ({
  kind: "consumer",
  market: MARKET,
  cartId,
});

const service: ServicePrincipal = {
  kind: "service",
  market: MARKET,
  actorId: "dtc-service-5c",
  allowedMarkets: [MARKET],
};

const key = () => `key_${crypto.randomUUID()}`;

function makeAdapter(pool: CommercePool, now = "2026-11-06T00:00:00.000Z"): AfterSalesPort {
  return createPostgresAfterSalesAdapter({
    pool,
    market: getMarket(MARKET),
    now: () => new Date(now),
    retryAfterMs: 250,
  });
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(25);
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

/**
 * Test-only bridge from `pg.Pool` to the production `CommercePool` interface.
 * The production driver and adapter stay untouched; transactions still execute
 * BEGIN/COMMIT/ROLLBACK on the same checked-out client.
 */
function createPgCommercePool(raw: Pool, hook?: QueryHook): CommercePool {
  let nextConnectionId = 1;
  return {
    async query(sql, values) {
      const result = values === undefined
        ? await raw.query(sql)
        : await raw.query(sql, values);
      return { rows: result.rows as Row[] };
    },
    async connect() {
      const client = await raw.connect();
      const connectionId = nextConnectionId++;
      let released = false;
      return {
        async query(sql, values) {
          // The hook may pause after a lock is acquired or inject a failure at a
          // precise statement; it never replaces the real PostgreSQL transaction.
          if (hook) await hook({ sql, values, connectionId, client });
          const result = values === undefined
            ? await client.query(sql)
            : await client.query(sql, values);
          return { rows: result.rows as Row[] };
        },
        release() {
          if (!released) {
            released = true;
            client.release();
          }
        },
      };
    },
  };
}

/**
 * Pause the first transaction that reaches `fragment`. The test then starts a
 * second independent connection, waits until PostgreSQL reports that backend
 * waiting on a lock, and only then releases or fails the first transaction.
 * Every wait is bounded; no unbounded sleep decides the race.
 */
function createGate(fragment: string, options: GateOptions = {}) {
  const reached = deferred<void>();
  const release = deferred<void>();
  let fired = false;
  const hook: QueryHook = async ({ sql, client }) => {
    if (fired || !sql.includes(fragment)) return;
    fired = true;
    reached.resolve();
    await withTimeout(release.promise, GATE_TIMEOUT_MS, `gate ${fragment}`);
    if (options.inspect) await options.inspect(client);
    if (options.failMessage) throw new Error(options.failMessage);
  };
  return {
    reached: reached.promise,
    release: () => release.resolve(),
    pool: (raw: Pool) => createPgCommercePool(raw, hook),
    fired: () => fired,
  };
}

type ScenarioContext = {
  gate(fragment: string, options?: GateOptions): ReturnType<typeof createGate>;
  track<T>(promise: Promise<T>): Promise<T>;
};

/** Release every gate and settle every tracked operation even when an assertion fails. */
async function scenario(run: (context: ScenarioContext) => Promise<void>): Promise<void> {
  const releases: Array<() => void> = [];
  const pending: Array<Promise<unknown>> = [];
  const context: ScenarioContext = {
    gate(fragment, options) {
      const gate = createGate(fragment, options);
      releases.push(gate.release);
      return gate;
    },
    track(promise) {
      // Attach a handler immediately so an early rejection is not unhandled.
      promise.catch(() => undefined);
      pending.push(promise);
      return promise;
    },
  };
  try {
    await run(context);
  } finally {
    for (const release of releases) release();
    await Promise.allSettled(pending);
  }
}

async function waitingBackends(pool: Pool, fragment: string): Promise<WaitBackend[]> {
  const { rows } = await pool.query<WaitBackend>(
    `SELECT pid, query
     FROM pg_stat_activity
     WHERE application_name = $1
       AND wait_event_type = 'Lock'
       AND strpos(lower(query), lower($2)) > 0`,
    [APP_NAME, fragment],
  );
  for (const row of rows) observedPids.add(row.pid);
  return rows;
}

async function waitForLockWait(
  pool: Pool,
  fragment: string,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<WaitBackend[]> {
  let waiting: WaitBackend[] = [];
  await waitUntil(
    async () => {
      waiting = await waitingBackends(pool, fragment);
      return waiting.length > 0;
    },
    timeoutMs,
    `lock wait on ${fragment}`,
  );
  return waiting;
}

async function backendPid(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const pid = Number(rows[0]?.pid);
  observedPids.add(pid);
  return pid;
}

type Seed = {
  orderId: string;
  cartId: string;
  orderVersion: string;
};

async function seedOrder(options: { contactName?: string } = {}): Promise<Seed> {
  const currency = getMarket(MARKET).currency;
  const orderId = `ord_${crypto.randomUUID()}`;
  const cartId = `cart_${crypto.randomUUID()}`;
  const checkoutId = `chk_${crypto.randomUUID()}`;
  const lineId = `line_${crypto.randomUUID()}`;
  const createdAt = "2026-11-01T00:00:00.000Z";
  const amount = 100;
  const lines = [{
    id: lineId,
    productId: "prod_5c",
    variantId: "var_5c",
    sku: "SKU-5C",
    name: "Synthetic 5C Sofa",
    quantity: 1,
    unitPrice: { amount, currency },
    lineTotal: { amount, currency },
  }];
  const data = {
    id: orderId,
    checkoutId,
    cartId,
    market: MARKET,
    status: "paid",
    lines,
    subtotal: { amount, currency },
    total: { amount, currency },
    contact: {
      name: options.contactName ?? "Synthetic Buyer",
      email: "buyer@example.invalid",
      phone: "0400000000",
    },
    address: {
      line1: "1 Synthetic Street",
      city: "Sydney",
      state: "NSW",
      postalCode: "2000",
      country: "AU",
    },
    createdAt,
  };

  await rawPool.query(
    `INSERT INTO commerce_carts (id, market, creation_key, data)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      cartId,
      MARKET,
      `creation_${crypto.randomUUID()}`,
      JSON.stringify({
        id: cartId,
        market: MARKET,
        revision: 0,
        lines: [],
        subtotal: { amount: 0, currency },
        total: { amount: 0, currency },
      }),
    ],
  );
  await rawPool.query(
    `INSERT INTO commerce_checkouts
       (id, cart_id, market, revision, input_signature, data, payment_request, first_attempt_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      checkoutId,
      cartId,
      MARKET,
      0,
      `sig_${crypto.randomUUID()}`,
      JSON.stringify({
        id: checkoutId,
        cartId,
        market: MARKET,
        revision: 0,
        status: "paid",
        lines,
        total: { amount, currency },
        createdAt,
      }),
      JSON.stringify({ checkoutId, cartId, market: MARKET }),
      createdAt,
    ],
  );
  await rawPool.query(
    `INSERT INTO commerce_orders (id, checkout_id, cart_id, market, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [orderId, checkoutId, cartId, MARKET, JSON.stringify(data)],
  );

  const mapped = await adapter.getServiceOrder(service, orderId);
  return { orderId, cartId, orderVersion: mapped.orderVersion };
}

function requestInput(orderId: string, description: string) {
  return { orderId, type: "damaged" as const, description };
}

async function publish(
  target: AfterSalesPort,
  seed: Seed,
  description: string,
  idempotencyKey = key(),
) {
  return target.createRequest(
    consumer(seed.cartId),
    requestInput(seed.orderId, description),
    { idempotencyKey },
  );
}

function ticketInput(
  requestId: string,
  orderVersion: string,
  overrides: Partial<CreateServiceTicketInput> = {},
): CreateServiceTicketInput {
  return {
    requestId,
    action: "refund",
    reply: "Synthetic immutable final reply.",
    draftVersion: "draft-5c",
    approvalId: "apr-5c",
    policyVersion: "policy-5c",
    orderVersion,
    ...overrides,
  };
}

async function requestCount(cartId: string): Promise<number> {
  const { rows } = await rawPool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM after_sales_requests WHERE cart_id = $1",
    [cartId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function counterValue(): Promise<string> {
  const { rows } = await rawPool.query<{ sequence: string }>(
    "SELECT sequence::text AS sequence FROM after_sales_request_counters WHERE market = $1",
    [MARKET],
  );
  return String(rows[0]?.sequence ?? "0");
}

async function ticketCount(requestId: string): Promise<number> {
  const { rows } = await rawPool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM after_sales_tickets WHERE request_id = $1",
    [requestId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function keyCount(idempotencyKey: string): Promise<number> {
  const { rows } = await rawPool.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM after_sales_ticket_keys
     WHERE market = $1 AND actor_id = $2 AND idempotency_key = $3`,
    [MARKET, service.actorId, idempotencyKey],
  );
  return Number(rows[0]?.count ?? 0);
}

async function keyCountForTicket(ticketId: string): Promise<number> {
  const { rows } = await rawPool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM after_sales_ticket_keys WHERE ticket_id = $1",
    [ticketId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function requestStatus(requestId: string): Promise<string | null> {
  const { rows } = await rawPool.query<{ status: string | null }>(
    "SELECT data->>'status' AS status FROM after_sales_requests WHERE id = $1",
    [requestId],
  );
  return rows[0]?.status ?? null;
}

describe("after-sales real PostgreSQL 16 multi-connection", () => {
  beforeAll(async () => {
    const poolConfig = {
      host: process.env.PGHOST,
      port: pgPort,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      max: 12,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 60_000,
      application_name: APP_NAME,
      statement_timeout: 45_000,
      lock_timeout: 20_000,
    };
    rawPool = new Pool(poolConfig);
    observerPool = new Pool({ ...poolConfig, max: 4 });

    const identityClient = await rawPool.connect();
    try {
      observedPids.add(await backendPid(identityClient));
      const identity = await identityClient.query<{
        database: string;
        user: string;
        server_port: number;
        version: string;
        isolation: string;
        statement_timeout: string;
        lock_timeout: string;
      }>(
        `SELECT current_database() AS database,
                current_user AS "user",
                inet_server_port() AS server_port,
                current_setting('server_version') AS version,
                current_setting('default_transaction_isolation') AS isolation,
                current_setting('statement_timeout') AS statement_timeout,
                current_setting('lock_timeout') AS lock_timeout`,
      );
      const row = identity.rows[0];
      if (!row) throw new Error("PostgreSQL identity query returned no row");
      expect(row.database).toBe(EXPECTED_DATABASE);
      expect(row.user).toBe(EXPECTED_USER);
      expect(row.server_port).toBe(5432);
      expect(row.version).toMatch(/^16\./);
      expect(row.isolation).toBe("read committed");
      console.info(
        `[after-sales-pg-spec] pg_version=${row.version} database=${row.database} `
          + `user=${row.user} server_port=${row.server_port} isolation=${row.isolation} `
          + `statement_timeout=${row.statement_timeout} lock_timeout=${row.lock_timeout} `
          + `connection_timeout=5000ms migrations=001,002,003`,
      );

      for (const file of [
        "001-commerce.sql",
        "002-after-sales-requests.sql",
        "003-after-sales-tickets.sql",
      ]) {
        await identityClient.query(
          await readFile(new URL(`./${file}`, import.meta.url), "utf8"),
        );
      }

      const tables = await identityClient.query<{ requests: string | null; tickets: string | null }>(
        `SELECT to_regclass('public.after_sales_requests')::text AS requests,
                to_regclass('public.after_sales_tickets')::text AS tickets`,
      );
      expect(tables.rows[0]?.requests).toBe("after_sales_requests");
      expect(tables.rows[0]?.tickets).toBe("after_sales_tickets");
    } finally {
      identityClient.release();
    }

    adapter = makeAdapter(createPgCommercePool(rawPool));
    observerAdapter = makeAdapter(createPgCommercePool(observerPool));
  });

  beforeEach(async () => {
    // This is the dedicated random container database, created for this run.
    // No external or existing storefront database is touched.
    await rawPool.query(
      `TRUNCATE after_sales_ticket_keys, after_sales_tickets, after_sales_attachments,
                after_sales_requests, after_sales_request_counters,
                commerce_orders, commerce_checkouts, commerce_carts CASCADE`,
    );
  });

  afterAll(async () => {
    if (rawPool) {
      const { rows } = await rawPool.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM pg_stat_activity
         WHERE application_name = $1 AND backend_type = 'client backend'`,
        [APP_NAME],
      );
      console.info(
        `[after-sales-pg-spec] observed_backend_pids=${[...observedPids].sort((a, b) => a - b).join(",")} `
          + `pool_backends_at_end=${rows[0]?.count ?? 0}`,
      );
      await rawPool.end();
    }
    await observerPool?.end();
  });

  it("scenario 1: concurrent publication serializes keys, keeps sequences contiguous and does not consume a rolled-back number", () =>
    scenario(async (ctx) => {
      const seed = await seedOrder();

      // Round 1: same key and fingerprint. The first transaction pauses after
      // taking the market counter row lock; the second connection waits on that
      // lock, then replays the committed request.
      const sharedKey = key();
      const sharedInput = requestInput(seed.orderId, "Concurrent duplicate.");
      const gate1 = ctx.gate("INSERT INTO after_sales_requests");
      const firstPromise = ctx.track(
        makeAdapter(gate1.pool(rawPool)).createRequest(
          consumer(seed.cartId),
          sharedInput,
          { idempotencyKey: sharedKey },
        ),
      );
      await withTimeout(gate1.reached, WAIT_TIMEOUT_MS, "scenario 1 round 1 gate");
      const secondPromise = ctx.track(
        adapter.createRequest(consumer(seed.cartId), sharedInput, {
          idempotencyKey: sharedKey,
        }),
      );
      await waitForLockWait(observerPool, "after_sales_request_counters");
      gate1.release();
      const [first, second] = await Promise.all([firstPromise, secondPromise]);
      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.request.id).toBe(first.request.id);
      expect(first.request.sequence).toBe("1");
      expect(await requestCount(seed.cartId)).toBe(1);

      // Round 2: same key, different fingerprint. The waiter re-checks the key
      // after acquiring the lock and refuses to overwrite the first request.
      const conflictingKey = key();
      const gate2 = ctx.gate("INSERT INTO after_sales_requests");
      const firstConflictPromise = ctx.track(
        makeAdapter(gate2.pool(rawPool)).createRequest(
          consumer(seed.cartId),
          requestInput(seed.orderId, "Original fingerprint."),
          { idempotencyKey: conflictingKey },
        ),
      );
      await withTimeout(gate2.reached, WAIT_TIMEOUT_MS, "scenario 1 round 2 gate");
      const conflictPromise = ctx.track(
        adapter.createRequest(
          consumer(seed.cartId),
          requestInput(seed.orderId, "Different fingerprint."),
          { idempotencyKey: conflictingKey },
        ),
      );
      await waitForLockWait(observerPool, "after_sales_request_counters");
      gate2.release();
      const firstConflict = await firstConflictPromise;
      await expect(conflictPromise).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
        details: { operation: "createAfterSalesRequest" },
      });
      expect(firstConflict.request.sequence).toBe("2");
      expect(await requestCount(seed.cartId)).toBe(2);

      // Round 3: different keys. Both succeed and receive contiguous sequence
      // numbers because the counter row is the single allocation point.
      const gate3 = ctx.gate("INSERT INTO after_sales_requests");
      const firstDifferentPromise = ctx.track(
        makeAdapter(gate3.pool(rawPool)).createRequest(
          consumer(seed.cartId),
          requestInput(seed.orderId, "Different key A."),
          { idempotencyKey: key() },
        ),
      );
      await withTimeout(gate3.reached, WAIT_TIMEOUT_MS, "scenario 1 round 3 gate");
      const secondDifferentPromise = ctx.track(
        adapter.createRequest(
          consumer(seed.cartId),
          requestInput(seed.orderId, "Different key B."),
          { idempotencyKey: key() },
        ),
      );
      await waitForLockWait(observerPool, "after_sales_request_counters");
      gate3.release();
      const [firstDifferent, secondDifferent] = await Promise.all([
        firstDifferentPromise,
        secondDifferentPromise,
      ]);
      expect(firstDifferent.replayed).toBe(false);
      expect(secondDifferent.replayed).toBe(false);
      expect(
        [firstDifferent.request.sequence, secondDifferent.request.sequence].sort(),
      ).toEqual(["3", "4"]);
      expect(await requestCount(seed.cartId)).toBe(4);

      // Round 4: the first transaction fails after allocating a number. Its
      // counter UPDATE rolls back; the waiting publisher takes the same number,
      // and a retry of the failed key receives the next one. A rollback neither
      // creates a hole nor blocks the market forever.
      const rollbackKey = key();
      const gate4 = ctx.gate("INSERT INTO after_sales_requests", {
        failMessage: "injected publish rollback",
      });
      const failingPromise = ctx.track(
        makeAdapter(gate4.pool(rawPool)).createRequest(
          consumer(seed.cartId),
          requestInput(seed.orderId, "Will roll back."),
          { idempotencyKey: rollbackKey },
        ),
      );
      await withTimeout(gate4.reached, WAIT_TIMEOUT_MS, "scenario 1 round 4 gate");
      const afterRollbackPromise = ctx.track(
        adapter.createRequest(
          consumer(seed.cartId),
          requestInput(seed.orderId, "After rollback."),
          { idempotencyKey: key() },
        ),
      );
      await waitForLockWait(observerPool, "after_sales_request_counters");
      gate4.release();
      await expect(failingPromise).rejects.toThrow("injected publish rollback");
      const afterRollback = await afterRollbackPromise;
      expect(afterRollback.request.sequence).toBe("5");
      expect(await requestCount(seed.cartId)).toBe(5);

      const retried = await publish(adapter, seed, "Will roll back.", rollbackKey);
      expect(retried.replayed).toBe(false);
      expect(retried.request.sequence).toBe("6");
      expect(await requestCount(seed.cartId)).toBe(6);
      expect(await counterValue()).toBe("6");
    }));

  it("scenario 2: feed snapshots exclude uncommitted or rolled-back publication and cursor continuation works", () =>
    scenario(async (ctx) => {
      const seed = await seedOrder();
      const first = await publish(adapter, seed, "Committed first.");
      expect(first.request.sequence).toBe("1");

      // The writer pauses immediately before COMMIT: its counter update and
      // request row exist but are invisible to other connections.
      const gate = ctx.gate("COMMIT", {
        failMessage: "injected publication rollback",
      });
      const pending = ctx.track(
        makeAdapter(gate.pool(rawPool)).createRequest(
          consumer(seed.cartId),
          requestInput(seed.orderId, "Uncommitted publication."),
          { idempotencyKey: key() },
        ),
      );
      await withTimeout(gate.reached, WAIT_TIMEOUT_MS, "scenario 2 pre-commit gate");

      const during = await observerAdapter.listServiceRequests(service, { limit: 10 });
      expect(during.highWatermark).toBe("1");
      expect(during.items.map((item) => item.sequence)).toEqual(["1"]);

      gate.release();
      await expect(pending).rejects.toThrow("injected publication rollback");
      const afterRollback = await observerAdapter.listServiceRequests(service, { limit: 10 });
      expect(afterRollback.highWatermark).toBe("1");
      expect(afterRollback.items.map((item) => item.sequence)).toEqual(["1"]);

      const second = await publish(adapter, seed, "Committed second.");
      const third = await publish(adapter, seed, "Committed third.");
      expect([second.request.sequence, third.request.sequence]).toEqual(["2", "3"]);

      // A fresh connection reads the complete committed record after the commit.
      const page1 = await observerAdapter.listServiceRequests(service, { limit: 2 });
      expect(page1.items.map((item) => item.sequence)).toEqual(["1", "2"]);
      expect(page1.highWatermark).toBe("3");
      expect(page1.hasMore).toBe(true);

      const page2 = await observerAdapter.listServiceRequests(service, {
        cursor: page1.nextCursor,
        limit: 2,
      });
      expect(page2.items.map((item) => item.sequence)).toEqual(["3"]);
      expect(page2.highWatermark).toBe("3");
      expect(page2.hasMore).toBe(false);

      const empty = await observerAdapter.listServiceRequests(service, {
        cursor: page2.nextCursor,
        limit: 2,
      });
      expect(empty.items).toEqual([]);
      expect(empty.hasMore).toBe(false);
      expect(empty.highWatermark).toBe("3");
    }));

  it("scenario 3: concurrent ticket creation keeps one ticket, one reply and shared receipts", () =>
    scenario(async (ctx) => {
      const seed = await seedOrder();
      const request = async (description: string) =>
        (await publish(adapter, seed, description)).request.id;

      // Round 1: same key and fingerprint. The first transaction pauses after
      // inserting ticket/key; the second waits on the market counter and then
      // returns the committed ticket as a replay.
      const request1 = await request("Ticket request one.");
      const ticket1 = ticketInput(request1, seed.orderVersion);
      const ticketKey1 = key();
      const gate1 = ctx.gate("UPDATE after_sales_requests SET data");
      const firstTicketPromise = ctx.track(
        makeAdapter(gate1.pool(rawPool)).createTicket(service, ticket1, {
          idempotencyKey: ticketKey1,
        }),
      );
      await withTimeout(gate1.reached, WAIT_TIMEOUT_MS, "scenario 3 round 1 gate");
      const replayPromise = ctx.track(
        adapter.createTicket(service, ticket1, { idempotencyKey: ticketKey1 }),
      );
      await waitForLockWait(observerPool, "after_sales_request_counters");
      gate1.release();
      const [firstTicket, replay] = await Promise.all([firstTicketPromise, replayPromise]);
      expect(firstTicket.replayed).toBe(false);
      expect(replay.replayed).toBe(true);
      expect(replay.ticket.id).toBe(firstTicket.ticket.id);
      expect(await ticketCount(request1)).toBe(1);
      expect(await keyCountForTicket(firstTicket.ticket.id)).toBe(1);

      // Round 2: different keys, same request. The second key is bound to the
      // original ticket in the same transaction and resolves to the same receipt.
      const request2 = await request("Ticket request two.");
      const ticket2 = ticketInput(request2, seed.orderVersion);
      const ticketKey2 = key();
      const gate2 = ctx.gate("UPDATE after_sales_requests SET data");
      const firstTicketKeyPromise = ctx.track(
        makeAdapter(gate2.pool(rawPool)).createTicket(service, ticket2, {
          idempotencyKey: ticketKey2,
        }),
      );
      await withTimeout(gate2.reached, WAIT_TIMEOUT_MS, "scenario 3 round 2 gate");
      const secondTicketKey = key();
      const secondTicketKeyPromise = ctx.track(
        adapter.createTicket(service, ticket2, { idempotencyKey: secondTicketKey }),
      );
      await waitForLockWait(observerPool, "after_sales_request_counters");
      gate2.release();
      const [createdTicket, boundTicket] = await Promise.all([
        firstTicketKeyPromise,
        secondTicketKeyPromise,
      ]);
      expect(createdTicket.replayed).toBe(false);
      expect(boundTicket.replayed).toBe(true);
      expect(boundTicket.ticket.id).toBe(createdTicket.ticket.id);
      expect(await ticketCount(request2)).toBe(1);
      expect(await keyCountForTicket(createdTicket.ticket.id)).toBe(2);
      await expect(observerAdapter.findTicketByIdempotencyKey(service, ticketKey2))
        .resolves.toMatchObject({ kind: "ticket", ticket: { id: createdTicket.ticket.id } });
      await expect(observerAdapter.findTicketByIdempotencyKey(service, secondTicketKey))
        .resolves.toMatchObject({ kind: "ticket", ticket: { id: createdTicket.ticket.id } });

      // Round 3: same key, different fingerprint. The winner's reply is
      // immutable; the loser cannot overwrite it.
      const request3 = await request("Ticket request three.");
      const winningInput = ticketInput(request3, seed.orderVersion, {
        reply: "First immutable final reply.",
      });
      const losingInput = ticketInput(request3, seed.orderVersion, {
        reply: "Conflicting final reply.",
      });
      const sharedTicketKey = key();
      const gate3 = ctx.gate("UPDATE after_sales_requests SET data");
      const winningPromise = ctx.track(
        makeAdapter(gate3.pool(rawPool)).createTicket(service, winningInput, {
          idempotencyKey: sharedTicketKey,
        }),
      );
      await withTimeout(gate3.reached, WAIT_TIMEOUT_MS, "scenario 3 round 3 gate");
      const losingPromise = ctx.track(
        adapter.createTicket(service, losingInput, {
          idempotencyKey: sharedTicketKey,
        }),
      );
      await waitForLockWait(observerPool, "after_sales_request_counters");
      gate3.release();
      const winningTicket = await winningPromise;
      await expect(losingPromise).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
        details: { operation: "createServiceTicket" },
      });
      expect(winningTicket.ticket.reply).toBe("First immutable final reply.");
      expect(await ticketCount(request3)).toBe(1);
      expect(await keyCountForTicket(winningTicket.ticket.id)).toBe(1);
      const stored = await rawPool.query<{ reply: string }>(
        "SELECT data->>'reply' AS reply FROM after_sales_tickets WHERE request_id = $1",
        [request3],
      );
      expect(stored.rows[0]?.reply).toBe("First immutable final reply.");
    }));

  it("scenario 4: ticket creation waits for the order lock and rejects a stale order version", () =>
    scenario(async (ctx) => {
      const seed = await seedOrder();
      const created = await publish(adapter, seed, "Order race request.");
      const staleInput = ticketInput(created.request.id, seed.orderVersion);

      const holder = await observerPool.connect();
      const holderPid = await backendPid(holder);
      let adapterWaiting: WaitBackend[] = [];
      try {
        // This connection owns the order row lock first. The adapter's
        // `FOR SHARE` read must wait rather than read around the lock.
        await holder.query("BEGIN");
        await holder.query(
          "SELECT id FROM commerce_orders WHERE id = $1 FOR UPDATE",
          [seed.orderId],
        );

        const pending = ctx.track(
          adapter.createTicket(service, staleInput, { idempotencyKey: key() }),
        );
        adapterWaiting = await waitForLockWait(observerPool, "commerce_orders");
        expect(adapterWaiting.some((backend) => backend.pid !== holderPid)).toBe(true);
        console.info(
          `[after-sales-pg-spec] order_lock_holder_pid=${holderPid} `
            + `waiting_pids=${adapterWaiting.map((backend) => backend.pid).join(",")}`,
        );

        // The order changes and commits while the ticket transaction waits.
        await holder.query(
          `UPDATE commerce_orders
           SET data = jsonb_set(data, '{contact,name}', to_jsonb($2::text))
           WHERE id = $1`,
          [seed.orderId, "Changed Buyer"],
        );
        await holder.query("COMMIT");

        await expect(
          withTimeout(pending, 10_000, "stale ticket resolution"),
        ).rejects.toMatchObject({
          code: "ORDER_VERSION_CONFLICT",
          details: { field: "order_version" },
        });
      } finally {
        await holder.query("ROLLBACK").catch(() => undefined);
        holder.release();
      }

      // The stale attempt wrote nothing; a retry with the current version is the
      // only way to create the ticket.
      expect(await ticketCount(created.request.id)).toBe(0);
      expect(await requestStatus(created.request.id)).toBe("pending");
      const changed = await adapter.getServiceOrder(service, seed.orderId);
      expect(changed.orderVersion).not.toBe(seed.orderVersion);
      const retried = await adapter.createTicket(
        service,
        ticketInput(created.request.id, changed.orderVersion),
        { idempotencyKey: key() },
      );
      expect(retried.replayed).toBe(false);
      expect(await ticketCount(created.request.id)).toBe(1);
    }));

  it("scenario 5: failure after ticket insert rolls back ticket, key, reply and request state", () =>
    scenario(async (ctx) => {
      const seed = await seedOrder();
      const created = await publish(adapter, seed, "Rollback ticket request.");
      const input = ticketInput(created.request.id, seed.orderVersion);
      const ticketKey = key();
      const observed: {
        tickets: number;
        keys: number;
        status: string | null;
        ticketId: string | null;
        ticketIdInTransaction: string | null;
      } = {
        tickets: 0,
        keys: 0,
        status: null,
        ticketId: null,
        ticketIdInTransaction: null,
      };

      const gate = ctx.gate("UPDATE after_sales_requests SET data", {
        failMessage: "injected after-sales ticket failure",
        inspect: async (client) => {
          const tickets = await client.query<{ count: number; id: string | null }>(
            "SELECT count(*)::int AS count, min(id) AS id FROM after_sales_tickets",
          );
          const keys = await client.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM after_sales_ticket_keys",
          );
          const request = await client.query<{
            status: string | null;
            ticket_id: string | null;
          }>(
            `SELECT data->>'status' AS status, data->>'ticketId' AS ticket_id
             FROM after_sales_requests WHERE id = $1`,
            [created.request.id],
          );
          observed.tickets = Number(tickets.rows[0]?.count ?? 0);
          observed.keys = Number(keys.rows[0]?.count ?? 0);
          observed.status = request.rows[0]?.status ?? null;
          observed.ticketId = request.rows[0]?.ticket_id ?? null;
          observed.ticketIdInTransaction = tickets.rows[0]?.id ?? null;
        },
      });

      const pending = ctx.track(
        makeAdapter(gate.pool(rawPool)).createTicket(service, input, {
          idempotencyKey: ticketKey,
        }),
      );
      await withTimeout(gate.reached, WAIT_TIMEOUT_MS, "scenario 5 pre-update gate");
      gate.release();
      await expect(pending).rejects.toThrow("injected after-sales ticket failure");

      // Inside the failed transaction the ticket and key were already present,
      // and the request update had not run yet.
      expect(observed.tickets).toBe(1);
      expect(observed.keys).toBe(1);
      expect(observed.status).toBe("pending");
      expect(observed.ticketId).toBeNull();
      expect(observed.ticketIdInTransaction).toMatch(/^tic_/);

      // A different connection sees none of the rolled-back writes.
      expect(await ticketCount(created.request.id)).toBe(0);
      expect(await keyCount(ticketKey)).toBe(0);
      expect(await requestStatus(created.request.id)).toBe("pending");
      const failedTicket = await rawPool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM after_sales_tickets WHERE id = $1",
        [observed.ticketIdInTransaction],
      );
      expect(Number(failedTicket.rows[0]?.count ?? 0)).toBe(0);
      await expect(observerAdapter.findTicketByIdempotencyKey(service, ticketKey))
        .resolves.toMatchObject({ kind: "currently_unavailable" });

      // Recovery through a new connection with the original key yields exactly
      // one ticket and one key row.
      const recovered = await observerAdapter.createTicket(service, input, {
        idempotencyKey: ticketKey,
      });
      expect(recovered.replayed).toBe(false);
      expect(await ticketCount(created.request.id)).toBe(1);
      expect(await keyCount(ticketKey)).toBe(1);
      await expect(observerAdapter.findTicketByIdempotencyKey(service, ticketKey))
        .resolves.toEqual({ kind: "ticket", ticket: recovered.ticket });
    }));

  it("scenario 6: a committed ticket is recovered by the original key after caller-side response loss", () =>
    scenario(async (ctx) => {
      const seed = await seedOrder();
      const created = await publish(adapter, seed, "Lost response request.");
      const input = ticketInput(created.request.id, seed.orderVersion);
      const ticketKey = key();

      // The ticket transaction pauses before COMMIT. A lookup on an independent
      // connection correctly reports currently_unavailable; that is not proof
      // the key will never exist.
      const gate = ctx.gate("COMMIT");
      const pending = ctx.track(
        makeAdapter(gate.pool(rawPool)).createTicket(service, input, {
          idempotencyKey: ticketKey,
        }),
      );
      await withTimeout(gate.reached, WAIT_TIMEOUT_MS, "scenario 6 pre-commit gate");
      await expect(observerAdapter.findTicketByIdempotencyKey(service, ticketKey))
        .resolves.toMatchObject({ kind: "currently_unavailable" });

      gate.release();
      // Deliberately discard the returned value: the caller lost the response.
      // This is a test-boundary simulation, not a real network-disconnect drill.
      await pending;

      const recovered = await observerAdapter.findTicketByIdempotencyKey(service, ticketKey);
      expect(recovered).toMatchObject({
        kind: "ticket",
        ticket: {
          requestId: created.request.id,
          orderId: seed.orderId,
          reply: input.reply,
          status: "open",
        },
      });
      expect(await ticketCount(created.request.id)).toBe(1);
      expect(await keyCount(ticketKey)).toBe(1);

      const replay = await observerAdapter.createTicket(service, input, {
        idempotencyKey: ticketKey,
      });
      expect(replay.replayed).toBe(true);
      if (recovered.kind === "ticket") {
        expect(replay.ticket.id).toBe(recovered.ticket.id);
      }
    }));
});
