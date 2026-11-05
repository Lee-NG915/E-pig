import { randomBytes } from "node:crypto";
import net from "node:net";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getMarket } from "@/platform/config/markets";
import { signCartCookie } from "@/platform/security/cart-cookie";

import {
  assertNoEnvFiles,
  buildServerEnvironment,
  copyControlledSource,
  findFreeLoopbackPort,
  recordLoopbackSocket,
  startNextDev,
  type ControlledCopy,
  type NextDevServer,
} from "./after-sales-http-harness";
import { runMigrations } from "./migrate-lib.mjs";

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
const databaseUrl = `postgres://${encodeURIComponent(process.env.PGUSER ?? "")}:`
  + `${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${pgPort}/`
  + `${encodeURIComponent(process.env.PGDATABASE ?? "")}`;
const MARKET = "au" as const;

let copy: ControlledCopy;
let server: NextDevServer;
let rawPool: Pool;
let port: number;
let origin: string;
let cookieSecret: string;
let serviceToken: string;
let serverEnv: NodeJS.ProcessEnv;
let seed: { orderId: string; cartId: string };
const secrets: string[] = [];

async function jsonRequest(
  path: string,
  init: RequestInit,
): Promise<{ response: Response; body: Record<string, unknown>; text: string }> {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const text = await response.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text };
  }
  return { response, body, text };
}

function expectStatus(
  result: { response: Response; body: Record<string, unknown>; text: string },
  status: number,
) {
  expect(
    result.response.status,
    `unexpected HTTP ${result.response.status}: ${result.text}\n${server.output().slice(-4_000)}`,
  ).toBe(status);
}

/** Binding the exact address proves no group member still owns the listener. */
async function expectPortReusable(port: number) {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => {
      probe.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

function consumerHeaders(idempotencyKey?: string) {
  return {
    "X-After-Sales-Contract-Version": "1",
    Origin: origin,
    "Sec-Fetch-Site": "same-origin",
    Cookie: `epig_cart_${MARKET}=${signCartCookie(seed.cartId, MARKET, cookieSecret)}`,
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    "Content-Type": "application/json",
  };
}

function serviceHeaders(idempotencyKey?: string) {
  return {
    "X-After-Sales-Contract-Version": "1",
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceToken}`,
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

async function seedOrder(): Promise<{ orderId: string; cartId: string }> {
  const currency = getMarket(MARKET).currency;
  const orderId = `ord_${crypto.randomUUID()}`;
  const cartId = crypto.randomUUID();
  const checkoutId = `chk_${crypto.randomUUID()}`;
  const createdAt = "2026-11-01T00:00:00.000Z";
  const lines = [{
    id: `line_${crypto.randomUUID()}`,
    productId: "prod_5d_http",
    variantId: "var_5d_http",
    sku: "SKU-5D-HTTP",
    name: "Synthetic 5D HTTP Sofa",
    quantity: 1,
    unitPrice: { amount: 100, currency },
    lineTotal: { amount: 100, currency },
  }];
  const data = {
    id: orderId,
    checkoutId,
    cartId,
    market: MARKET,
    status: "paid",
    lines,
    subtotal: { amount: 100, currency },
    total: { amount: 100, currency },
    contact: {
      name: "Synthetic Buyer",
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
    [cartId, MARKET, `creation_${crypto.randomUUID()}`, JSON.stringify({ id: cartId, market: MARKET })],
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
      JSON.stringify({ id: checkoutId, cartId, market: MARKET }),
      JSON.stringify({ checkoutId, cartId, market: MARKET }),
      createdAt,
    ],
  );
  await rawPool.query(
    `INSERT INTO commerce_orders (id, checkout_id, cart_id, market, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [orderId, checkoutId, cartId, MARKET, JSON.stringify(data)],
  );
  return { orderId, cartId };
}

async function startServer() {
  server = startNextDev({
    root: copy.root,
    port,
    market: MARKET,
    env: serverEnv,
    secrets: [process.env.PGPASSWORD ?? "", databaseUrl, cookieSecret, serviceToken],
  });
  await server.waitUntilReady();
}

beforeAll(async () => {
  copy = await copyControlledSource();
  assertNoEnvFiles(copy.root);
  await runMigrations({ connectionString: databaseUrl, driver: "tcp", scope: "all" });
  rawPool = new Pool({
    host: process.env.PGHOST,
    port: pgPort,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 4,
    connectionTimeoutMillis: 5_000,
    application_name: "e-pig-as5d-http",
  });
  seed = await seedOrder();

  port = await findFreeLoopbackPort();
  origin = `http://localhost:${port}`;
  cookieSecret = randomBytes(32).toString("base64url");
  serviceToken = randomBytes(32).toString("base64url");
  secrets.push(cookieSecret, serviceToken);
  serverEnv = buildServerEnvironment(process.env, {
    market: MARKET,
    databaseUrl,
    cookieSecret,
    serviceToken,
    origin,
  });
  await startServer();
});

afterAll(async () => {
  let serverStopped = false;
  try {
    if (server) {
      await server.stop();
      serverStopped = true;
    }
  } finally {
    await rawPool?.end();
    await copy?.cleanup();
  }
  console.info(
    `[after-sales-http-spec] cleanup server_stopped=${serverStopped} copy_removed=${Boolean(copy)}`,
  );
});

describe("real Next.js HTTP after-sales journey with isolated PostgreSQL", () => {
  it("runs application, service ticket and consumer read-back over a real loopback socket, then survives restart", async () => {
    const socket = await recordLoopbackSocket(port);
    expect(socket.remotePort).toBe(port);
    console.info(
      `[after-sales-http-spec] http_base=${origin} socket_local=${socket.localAddress}:${socket.localPort} `
        + `socket_remote=${socket.remoteAddress}:${socket.remotePort} database_driver=tcp`
        + " env_files=none",
    );

    const requestKey = `key_${crypto.randomUUID()}`;
    const create = await jsonRequest(`/api/${MARKET}/after-sales/requests`, {
      method: "POST",
      headers: consumerHeaders(requestKey),
      body: JSON.stringify({
        order_id: seed.orderId,
        type: "damaged",
        description: "The synthetic parcel arrived damaged via real HTTP.",
      }),
    });
    expectStatus(create, 201);
    expect(create.response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(create.response.headers.get("x-after-sales-contract-version")).toBe("1");
    const requestId = create.body.request_id;
    expect(typeof requestId).toBe("string");

    const read = await jsonRequest(`/api/${MARKET}/after-sales/requests/${requestId}`, {
      headers: consumerHeaders(),
    });
    expectStatus(read, 200);
    expect(read.body).toEqual(create.body);

    const order = await jsonRequest(`/api/${MARKET}/after-sales/service/orders/${seed.orderId}`, {
      headers: serviceHeaders(),
    });
    expectStatus(order, 200);
    expect(order.body.order_version).toMatch(/^[a-f0-9]{64}$/);

    const ticketKey = `ticket_${crypto.randomUUID()}`;
    const ticketBody = {
      request_id: requestId,
      action: "refund",
      reply: "Synthetic real-HTTP final reply.",
      draft_version: "draft_http_5d",
      approval_id: "approval_http_5d",
      policy_version: "policy_http_5d",
      order_version: order.body.order_version,
    };
    const ticket = await jsonRequest(`/api/${MARKET}/after-sales/service/tickets`, {
      method: "POST",
      headers: serviceHeaders(ticketKey),
      body: JSON.stringify(ticketBody),
    });
    expectStatus(ticket, 201);
    expect(ticket.body).toMatchObject({
      request_id: requestId,
      order_id: seed.orderId,
      action: "refund",
      reply: ticketBody.reply,
      draft_version: ticketBody.draft_version,
      approval_id: ticketBody.approval_id,
      policy_version: ticketBody.policy_version,
      order_version: order.body.order_version,
    });
    const ticketId = ticket.body.ticket_id;
    expect(typeof ticketId).toBe("string");

    const consumerTicket = await jsonRequest(`/api/${MARKET}/after-sales/tickets/${ticketId}`, {
      headers: consumerHeaders(),
    });
    expectStatus(consumerTicket, 200);
    expect(consumerTicket.body).toMatchObject({ ticket_id: ticketId, request_id: requestId });
    expect(consumerTicket.body).not.toHaveProperty("approval_id");
    expect(consumerTicket.body).not.toHaveProperty("draft_version");
    expect(consumerTicket.body).not.toHaveProperty("policy_version");
    expect(consumerTicket.body).not.toHaveProperty("order_version");

    const currentRequest = await jsonRequest(`/api/${MARKET}/after-sales/requests/${requestId}`, {
      headers: consumerHeaders(),
    });
    expectStatus(currentRequest, 200);
    expect(currentRequest.body).toMatchObject({
      request_id: requestId,
      status: "ticket_created",
      ticket_id: ticketId,
    });
    const beforeRestartRequest = currentRequest.body;
    const beforeRestartTicket = consumerTicket.body;

    await server.stop();
    // The leader is gone only after the whole group released the socket.
    await expectPortReusable(port);
    console.info("[after-sales-http-spec] stop_released_port=true; restart app on the same loopback port");
    await startServer();
    const restartedSocket = await recordLoopbackSocket(port);
    expect(restartedSocket.remotePort).toBe(port);

    const requestAfterRestart = await jsonRequest(`/api/${MARKET}/after-sales/requests/${requestId}`, {
      headers: consumerHeaders(),
    });
    expectStatus(requestAfterRestart, 200);
    expect(requestAfterRestart.body).toEqual(beforeRestartRequest);

    const ticketAfterRestart = await jsonRequest(`/api/${MARKET}/after-sales/tickets/${ticketId}`, {
      headers: consumerHeaders(),
    });
    expectStatus(ticketAfterRestart, 200);
    expect(ticketAfterRestart.body).toEqual(beforeRestartTicket);

    const recovered = await jsonRequest(
      `/api/${MARKET}/after-sales/service/tickets/by-idempotency-key/${ticketKey}`,
      { headers: serviceHeaders() },
    );
    expectStatus(recovered, 200);
    expect(recovered.body).toEqual(ticket.body);

    const replay = await jsonRequest(`/api/${MARKET}/after-sales/requests`, {
      method: "POST",
      headers: consumerHeaders(requestKey),
      body: JSON.stringify({
        order_id: seed.orderId,
        type: "damaged",
        description: "The synthetic parcel arrived damaged via real HTTP.",
      }),
    });
    expectStatus(replay, 200);
    expect(replay.response.headers.get("idempotency-replayed")).toBe("true");
    expect(replay.body).toMatchObject({
      request_id: requestId,
      status: "ticket_created",
      ticket_id: ticketId,
    });

    const { rows } = await rawPool.query<{ requests: number; tickets: number }>(
      `SELECT (SELECT count(*)::int FROM after_sales_requests) AS requests,
              (SELECT count(*)::int FROM after_sales_tickets) AS tickets`,
    );
    expect(rows[0]).toEqual({ requests: 1, tickets: 1 });
    expect(server.output()).not.toContain(process.env.PGPASSWORD ?? "never-matches");
    expect(server.output()).not.toContain(cookieSecret);
    expect(server.output()).not.toContain(serviceToken);
    console.info(
      `[after-sales-http-spec] restart_readback=ok request_id=${String(requestId)} `
        + `ticket_id=${String(ticketId)} sockets=${socket.remoteAddress}:${socket.remotePort},`
        + `${restartedSocket.remoteAddress}:${restartedSocket.remotePort} durable_rows=1,1`,
    );
  });
});
