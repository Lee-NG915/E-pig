import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import {
  assertNoEnvFiles,
  buildServerEnvironment,
  copyControlledSource,
  findFreeLoopbackPort,
  startNextDev,
} from "./after-sales-http-harness.ts";
import {
  LOOPBACK_HOST,
  TEST_CONTAINER_MARKER,
  TEST_DATABASE,
  TEST_MARKER,
  TEST_USER,
} from "./after-sales-pg-safety.mjs";
import { runMigrations } from "./migrate-lib.mjs";

const MARKET = "au";
const CURRENCY = "AUD";
const CART_COOKIE = `epig_cart_${MARKET}`;
const CATALOG_PRODUCT_ID = "tamarama-modular-sofa";
const CATALOG_VARIANT_ID = "tamarama-modular-sofa-default";
const SYNTHETIC_SKU = "SYNTH-MUG-001";
const SYNTHETIC_ORDER_PREFIX = "ord_sandbox";
const SYNTHETIC_CHECKOUT_PREFIX = "chk_sandbox";
const SANDBOX_MARKER_ENV = "E_PIG_AFTER_SALES_SANDBOX";
const LOST_RESPONSE_MARKER = "e-pig-sandbox-committed-response-loss";
const BOOTSTRAP_ROUTE_RELATIVE = "src/app/api/sandbox/bootstrap/route.ts";
const REQUEST_ROUTE_RELATIVE = "src/app/api/[market]/after-sales/requests/route.ts";
const EXPECTED_REQUEST_ROUTE = `import { createAppConsumerAfterSalesApi } from "../../../after-sales";

export async function POST(
  request: Request,
  context: { params: Promise<{ market: string }> },
) {
  const { market } = await context.params;
  return createAppConsumerAfterSalesApi().createAfterSalesRequest(request, market);
}
`;
const ORIGIN_SOURCE_PATHS = {
  env: "src/platform/config/env.ts",
  consumer: "src/platform/http/consumer-after-sales-api.ts",
  commerce: "src/adapters/commerce/postgres/commerce.ts",
  nextConfig: "next.config.ts",
};
const ORIGIN_SOURCE_SNIPPETS = {
  env: `      && (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost"));`,
  consumer: `      url.protocol !== "https:"
        && !(url.protocol === "http:" && url.hostname === "localhost")`,
  commerce: `  if (site.username || site.password || (site.protocol !== "https:" && !(site.protocol === "http:" && site.hostname === "localhost"))) throw new AppError("validation", "Invalid checkout origin");`,
  nextConfig: "const nextConfig: NextConfig = {",
};
const MAX_BOOTSTRAP_WAIT_MS = 60_000;
const BROWSER_HOST_PATTERN = /^epig-qa-[0-9a-f]{16}\.localhost$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COOKIE_VALUE_PATTERN = /^[A-Za-z0-9._-]+$/;

export function redactSandboxText(value, secrets) {
  let redacted = String(value);
  for (const secret of secrets) {
    if (typeof secret !== "string" || !secret) continue;
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted-database-url]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]");
}

/** Keep a bounded, single-line failure status so the runner can forward it. */
function compactFailure(value, maxLength = 6_000) {
  const compact = String(value).replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
}

function replaceExactlyOnce(source, expected, replacement, label) {
  const first = source.indexOf(expected);
  if (first < 0) {
    throw new Error(`The sandbox origin patch target is missing: ${label}`);
  }
  if (source.indexOf(expected, first + expected.length) >= 0) {
    throw new Error(`The sandbox origin patch target is ambiguous: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + expected.length);
}

function assertBrowserHost(browserHost) {
  if (!BROWSER_HOST_PATTERN.test(browserHost ?? "")) {
    throw new Error("The sandbox browser host is not a unique loopback host");
  }
  return browserHost;
}

/**
 * Pure source transform used only against the controlled copy. It lets the
 * exact per-run `epig-qa-<nonce>.localhost` origin pass the existing localhost
 * checks without widening production behavior or editing the real repository.
 */
export function patchSandboxOriginSources({
  envSource,
  consumerSource,
  commerceSource,
  nextConfigSource,
  browserHost,
}) {
  const host = assertBrowserHost(browserHost);
  const quotedHost = JSON.stringify(host);
  return {
    envSource: replaceExactlyOnce(
      envSource,
      ORIGIN_SOURCE_SNIPPETS.env,
      `      && (url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === ${quotedHost})));`,
      "env APP_ORIGIN",
    ),
    consumerSource: replaceExactlyOnce(
      consumerSource,
      ORIGIN_SOURCE_SNIPPETS.consumer,
      `      url.protocol !== "https:"
        && !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === ${quotedHost}))`,
      "consumer after-sales origin",
    ),
    commerceSource: replaceExactlyOnce(
      commerceSource,
      ORIGIN_SOURCE_SNIPPETS.commerce,
      `  if (site.username || site.password || (site.protocol !== "https:" && !(site.protocol === "http:" && (site.hostname === "localhost" || site.hostname === ${quotedHost})))) throw new AppError("validation", "Invalid checkout origin");`,
      "commerce origin",
    ),
    nextConfigSource: replaceExactlyOnce(
      nextConfigSource,
      ORIGIN_SOURCE_SNIPPETS.nextConfig,
      `const nextConfig: NextConfig = {
  allowedDevOrigins: [${quotedHost}],`,
      "next allowedDevOrigins",
    ),
  };
}

async function applySandboxOriginSupport(root, browserHost) {
  const files = {};
  for (const [key, relative] of Object.entries(ORIGIN_SOURCE_PATHS)) {
    files[`${key}Source`] = await readFile(path.join(root, relative), "utf8");
  }
  const patched = patchSandboxOriginSources({ ...files, browserHost });
  for (const [key, relative] of Object.entries(ORIGIN_SOURCE_PATHS)) {
    await writeFile(path.join(root, relative), patched[`${key}Source`], "utf8");
  }
}

export function buildBrowserIdentity({ nonce, port }) {
  if (!/^[0-9a-f]{16}$/.test(nonce ?? "")) {
    throw new Error("The sandbox nonce must be 16 lowercase hex characters");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("The sandbox Next port must be an integer between 1 and 65535");
  }
  const browserHost = assertBrowserHost(`epig-qa-${nonce}.localhost`);
  return {
    browserHost,
    browserOrigin: `http://${browserHost}:${port}`,
    internalOrigin: `http://${LOOPBACK_HOST}:${port}`,
  };
}

/** Only the runner-owned synthetic PG* environment is accepted. */
export function parseSandboxEnvironment(env = process.env) {
  if (env[TEST_MARKER] !== "1") {
    throw new Error("Run the browser sandbox only through the dedicated PostgreSQL runner");
  }
  if (env.DATABASE_URL || env.NEON_DATABASE_URL) {
    throw new Error("The browser sandbox never accepts an inherited database URL");
  }
  const containerName = env[TEST_CONTAINER_MARKER];
  if (!/^e-pig-as5c-[0-9a-f]{16}$/.test(containerName ?? "")) {
    throw new Error("The browser sandbox container is not runner-owned");
  }
  if (env.PGHOST !== LOOPBACK_HOST) {
    throw new Error("The browser sandbox PostgreSQL target must be loopback-only");
  }
  const port = Number(env.PGPORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("The browser sandbox PostgreSQL port is invalid");
  }
  if (env.PGDATABASE !== TEST_DATABASE || env.PGUSER !== TEST_USER) {
    throw new Error("The browser sandbox PostgreSQL identity is not the dedicated one");
  }
  if (env.PGSSLMODE !== "disable") {
    throw new Error("The browser sandbox PostgreSQL connection must disable TLS");
  }
  if (typeof env.PGPASSWORD !== "string" || env.PGPASSWORD.length < 16) {
    throw new Error("The browser sandbox PostgreSQL password is not runner-owned");
  }
  const password = env.PGPASSWORD;
  return {
    containerName,
    host: LOOPBACK_HOST,
    port,
    database: TEST_DATABASE,
    user: TEST_USER,
    password,
    databaseUrl: `postgres://${encodeURIComponent(TEST_USER)}:${encodeURIComponent(password)}`
      + `@${LOOPBACK_HOST}:${port}/${encodeURIComponent(TEST_DATABASE)}`,
  };
}

export function buildSyntheticOrderIdentity({ nonce, subject }) {
  if (!/^[0-9a-f]{16}$/.test(nonce ?? "")) {
    throw new Error("The sandbox nonce must be 16 lowercase hex characters");
  }
  if (subject !== "one" && subject !== "two") {
    throw new Error("The sandbox subject must be one or two");
  }
  return {
    orderId: `${SYNTHETIC_ORDER_PREFIX}_${nonce}_${subject}`,
    checkoutId: `${SYNTHETIC_CHECKOUT_PREFIX}_${nonce}_${subject}`,
  };
}

/**
 * Builds a complete paid order snapshot, not a stub. The line carries the
 * synthetic SKU required by the after-sales order mapping; totals are exact so
 * the historical order path never falls back to the current catalog.
 */
export function buildSyntheticOrderSeed({
  orderId,
  checkoutId,
  cartId,
  createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
}) {
  if (!OPAQUE_ID_PATTERN.test(orderId ?? "")) {
    throw new Error("The synthetic order id is invalid");
  }
  if (!OPAQUE_ID_PATTERN.test(checkoutId ?? "")) {
    throw new Error("The synthetic checkout id is invalid");
  }
  if (typeof cartId !== "string" || !/^[0-9a-f-]{36}$/i.test(cartId)) {
    throw new Error("The synthetic order cart id is invalid");
  }
  const parsedCreatedAt = Date.parse(createdAt);
  if (!Number.isFinite(parsedCreatedAt)) {
    throw new Error("The synthetic order date is invalid");
  }
  const normalizedCreatedAt = new Date(parsedCreatedAt).toISOString();
  const unitPrice = { amount: 12.5, currency: CURRENCY };
  const line = {
    id: `line_${randomUUID()}`,
    productId: "prod_synth_mug",
    variantId: "var_synth_mug",
    sku: SYNTHETIC_SKU,
    name: "Synthetic Mug",
    variantLabel: "Sandbox sample",
    colour: "White",
    image: "",
    quantity: 2,
    unitPrice,
    lineTotal: { amount: 25, currency: CURRENCY },
    availability: "in-stock",
  };
  const order = {
    id: orderId,
    checkoutId,
    cartId,
    market: MARKET,
    status: "paid",
    lines: [line],
    subtotal: { amount: 25, currency: CURRENCY },
    total: { amount: 25, currency: CURRENCY },
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
    createdAt: normalizedCreatedAt,
  };
  const checkout = {
    id: checkoutId,
    cartId,
    market: MARKET,
    revision: 0,
    status: "paid",
    lines: [line],
    subtotal: order.subtotal,
    total: order.total,
    contact: order.contact,
    address: order.address,
    orderId,
    createdAt: normalizedCreatedAt,
  };
  return {
    order,
    checkout,
    paymentRequest: {
      checkoutId,
      cartId,
      market: MARKET,
      total: order.total,
    },
  };
}

export async function seedSyntheticOrder(pool, seed) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO commerce_checkouts
         (id, cart_id, market, revision, input_signature, data, payment_request, first_attempt_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
      [
        seed.checkout.id,
        seed.checkout.cartId,
        MARKET,
        seed.checkout.revision,
        `sandbox_${seed.checkout.id}`,
        JSON.stringify(seed.checkout),
        JSON.stringify(seed.paymentRequest),
        seed.checkout.createdAt,
      ],
    );
    await client.query(
      `INSERT INTO commerce_orders (id, checkout_id, cart_id, market, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [seed.order.id, seed.order.checkoutId, seed.order.cartId, MARKET, JSON.stringify(seed.order)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function renderBootstrapRoute({ browserHost, browserOrigin, subjects }) {
  const host = assertBrowserHost(browserHost);
  if (
    typeof browserOrigin !== "string"
    || !new RegExp(`^http://${host.replaceAll(".", "\\.")}:\\d{1,5}$`).test(browserOrigin)
  ) {
    throw new Error("The sandbox bootstrap origin is invalid");
  }
  if (!subjects || typeof subjects !== "object") {
    throw new Error("The sandbox bootstrap subjects are missing");
  }
  const keys = Object.keys(subjects).sort();
  if (keys.length !== 2 || keys[0] !== "one" || keys[1] !== "two") {
    throw new Error("The sandbox bootstrap subjects must be exactly one and two");
  }
  const fixed = {};
  for (const subject of ["one", "two"]) {
    const entry = subjects[subject];
    if (!entry || entry.market !== MARKET) {
      throw new Error(`The sandbox bootstrap subject ${subject} has an invalid market`);
    }
    if (!OPAQUE_ID_PATTERN.test(entry.orderId ?? "")) {
      throw new Error(`The sandbox bootstrap subject ${subject} has an invalid order id`);
    }
    if (entry.cookieName !== CART_COOKIE) {
      throw new Error(`The sandbox bootstrap subject ${subject} has an invalid cookie name`);
    }
    if (!COOKIE_VALUE_PATTERN.test(entry.cookieValue ?? "")) {
      throw new Error(`The sandbox bootstrap subject ${subject} has an invalid cookie value`);
    }
    fixed[subject] = {
      cookieName: entry.cookieName,
      cookieValue: entry.cookieValue,
      market: entry.market,
      orderId: entry.orderId,
    };
  }
  return `import { NextResponse } from "next/server";

// Sandbox-only fixture route. It is injected into the controlled copy only and
// is never part of the application source or a production build. It accepts
// no cookie, redirect or database parameters.
const SANDBOX_HOST = ${JSON.stringify(host)};
const SANDBOX_ORIGIN = ${JSON.stringify(browserOrigin)};
const SUBJECTS = ${JSON.stringify(fixed, null, 2)} as const;

export async function GET(request: Request) {
  if (process.env.${SANDBOX_MARKER_ENV} !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }
  if ((request.headers.get("host") ?? "").split(":")[0] !== SANDBOX_HOST) {
    return new NextResponse("Not found", { status: 404 });
  }
  const subject = new URL(request.url).searchParams.get("subject");
  if (subject !== "one" && subject !== "two") {
    return NextResponse.json({ error: "subject must be one or two" }, { status: 400 });
  }
  const target = SUBJECTS[subject];
  const response = NextResponse.redirect(
    new URL(
      \`/\${target.market}/orders/\${encodeURIComponent(target.orderId)}\`,
      SANDBOX_ORIGIN,
    ),
    303,
  );
  response.cookies.set(target.cookieName, target.cookieValue, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  return response;
}
`;
}

export function renderLostResponseRoute({ orderId }) {
  if (!OPAQUE_ID_PATTERN.test(orderId ?? "")) {
    throw new Error("The sandbox lost-response order id is invalid");
  }
  return `import { createAppConsumerAfterSalesApi } from "../../../after-sales";

// Sandbox-only wrapper injected into the controlled copy. It models a server
// boundary that committed the request but lost the response once. It is not a
// network disconnect simulation and never enters the application source.
const SANDBOX_ORDER_ID = ${JSON.stringify(orderId)};
const SANDBOX_DESCRIPTION_MARKER = ${JSON.stringify(LOST_RESPONSE_MARKER)};
let droppedOnce = false;

export async function POST(
  request: Request,
  context: { params: Promise<{ market: string }> },
) {
  const { market } = await context.params;
  const api = createAppConsumerAfterSalesApi();
  if (process.env.${SANDBOX_MARKER_ENV} !== "1") {
    return api.createAfterSalesRequest(request, market);
  }
  const clone = request.clone();
  let shouldDrop = false;
  try {
    const body = (await clone.json()) as {
      order_id?: unknown;
      description?: unknown;
    };
    shouldDrop =
      !droppedOnce
      && body.order_id === SANDBOX_ORDER_ID
      && typeof body.description === "string"
      && body.description.includes(SANDBOX_DESCRIPTION_MARKER);
  } catch {
    // The real handler owns malformed-body responses.
  }
  const response = await api.createAfterSalesRequest(request, market);
  if (!shouldDrop || (response.status !== 200 && response.status !== 201)) {
    return response;
  }
  droppedOnce = true;
  const created = (await response.clone().json().catch(() => null)) as {
    request_id?: unknown;
  } | null;
  return new Response(
    JSON.stringify({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message:
          "Sandbox boundary simulated a lost response after the request was committed.",
        retryable: true,
        ...(typeof created?.request_id === "string"
          ? { request_id: created.request_id }
          : {}),
      },
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store, max-age=0",
        "X-After-Sales-Contract-Version": "1",
        "X-E-Pig-Sandbox-Boundary": "committed-response-dropped-once",
      },
    },
  );
}
`;
}

export function syntheticPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

export function formatReadyLine({ nextPgid }) {
  if (!Number.isInteger(nextPgid) || nextPgid <= 0) {
    throw new Error("The sandbox Next process id is invalid");
  }
  return `[after-sales-sandbox] ready next_pgid=${nextPgid}`;
}

export async function writePrivateManifest(directory, manifest) {
  await chmod(directory, 0o700);
  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  const info = await stat(manifestPath);
  if ((info.mode & 0o777) !== 0o600) {
    throw new Error("The sandbox manifest permissions are not 0600");
  }
  return manifestPath;
}

export function assertSandboxCleanup({
  serverStopped,
  poolClosed,
  copyRemoved,
  manifestRemoved,
}) {
  const missing = Object.entries({
    serverStopped,
    poolClosed,
    copyRemoved,
    manifestRemoved,
  })
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Unconfirmed sandbox cleanup: ${missing.join(", ")}`);
  }
}

function internalRequest({
  port,
  hostHeader,
  browserOrigin,
  requestPath,
  method = "GET",
  headers = {},
  body,
}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(body);
    const request = http.request(
      {
        host: LOOPBACK_HOST,
        port,
        path: requestPath,
        method,
        headers: {
          host: hostHeader,
          origin: browserOrigin,
          ...(payload
            ? {
                "content-type": "application/json",
                "content-length": String(payload.length),
              }
            : {}),
          ...headers,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.setTimeout(30_000, () => {
      request.destroy(new Error("The sandbox fixture request timed out"));
    });
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cookieValueFromResponse(headers) {
  const values = headers["set-cookie"];
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const target = list.find((value) => value.startsWith(`${CART_COOKIE}=`));
  if (!target) {
    throw new Error("The cart API did not issue the expected signed cookie");
  }
  const match = new RegExp(`^${CART_COOKIE}=([^;]+)`).exec(target);
  if (!match?.[1] || !COOKIE_VALUE_PATTERN.test(match[1])) {
    throw new Error("The cart API cookie value is invalid");
  }
  return match[1];
}

async function createSyntheticCart({ port, hostHeader, browserOrigin, subject }) {
  const idempotencyKey = randomUUID();
  const response = await internalRequest({
    port,
    hostHeader,
    browserOrigin,
    requestPath: `/api/${MARKET}/cart`,
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
    body: JSON.stringify({
      action: "add",
      productId: CATALOG_PRODUCT_ID,
      variantId: CATALOG_VARIANT_ID,
      quantity: 1,
      idempotencyKey,
      expectedCartId: null,
    }),
  });
  if (response.status !== 200) {
    throw new Error(`The real cart API returned ${response.status} for subject ${subject}`);
  }
  const payload = parseJson(response.text);
  const cart = payload?.cart;
  if (
    !cart
    || typeof cart.id !== "string"
    || !Array.isArray(cart.lines)
    || cart.lines.length === 0
    || typeof cart.lines[0]?.sku !== "string"
    || typeof cart.lines[0]?.name !== "string"
    || !cart.lines[0]?.unitPrice
  ) {
    throw new Error(`The real cart API returned an incomplete cart for subject ${subject}`);
  }
  return {
    idempotencyKey,
    cart,
    cookieValue: cookieValueFromResponse(response.headers),
  };
}

async function assertOrderReadback({
  port,
  hostHeader,
  browserOrigin,
  cookieValue,
  orderId,
  subject,
}) {
  const response = await internalRequest({
    port,
    hostHeader,
    browserOrigin,
    requestPath: `/api/${MARKET}/orders/${encodeURIComponent(orderId)}`,
    headers: { cookie: `${CART_COOKIE}=${cookieValue}` },
  });
  if (response.status !== 200) {
    throw new Error(`The seeded order readback returned ${response.status} for subject ${subject}`);
  }
  const payload = parseJson(response.text);
  if (
    payload?.order?.id !== orderId
    || payload.order.lines?.[0]?.sku !== SYNTHETIC_SKU
  ) {
    throw new Error(`The seeded order readback did not match subject ${subject}`);
  }
}

async function assertOrderPageCompiles({
  port,
  hostHeader,
  browserOrigin,
  orderId,
  isStopping,
}) {
  const deadline = Date.now() + MAX_BOOTSTRAP_WAIT_MS;
  let lastFailure = "no probe completed";
  while (Date.now() < deadline) {
    if (isStopping()) throw new Error("The sandbox was stopped while waiting for the order page");
    try {
      const response = await internalRequest({
        port,
        hostHeader,
        browserOrigin,
        requestPath: `/${MARKET}/orders/${encodeURIComponent(orderId)}`,
      });
      if (response.status === 200) return;
      if (response.status >= 500) {
        throw new Error(
          `The order page failed to compile: HTTP ${response.status} `
            + compactFailure(response.text, 1_500),
        );
      }
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("The order page failed")) {
        throw error;
      }
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`The order page did not become ready: ${lastFailure}`);
}

async function waitForBootstrapRoute({ port, hostHeader, browserOrigin, isStopping }) {
  const deadline = Date.now() + MAX_BOOTSTRAP_WAIT_MS;
  let lastFailure = "no probe completed";
  while (Date.now() < deadline) {
    if (isStopping()) throw new Error("The sandbox was stopped while waiting for the bootstrap route");
    try {
      const response = await internalRequest({
        port,
        hostHeader,
        browserOrigin,
        requestPath: "/api/sandbox/bootstrap",
      });
      if (response.status === 400 && response.text.includes("subject")) return;
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`The bootstrap route did not become ready: ${lastFailure}`);
}

async function main() {
  if (process.argv.slice(2).length > 0) {
    throw new Error("The browser sandbox accepts no arguments");
  }
  const config = parseSandboxEnvironment(process.env);
  const nonce = randomBytes(8).toString("hex");
  const nextPort = await findFreeLoopbackPort();
  const { browserHost, browserOrigin, internalOrigin } = buildBrowserIdentity({
    nonce,
    port: nextPort,
  });
  const orderIds = {
    one: buildSyntheticOrderIdentity({ nonce, subject: "one" }),
    two: buildSyntheticOrderIdentity({ nonce, subject: "two" }),
  };
  const cookieSecret = randomBytes(32).toString("base64url");
  const serviceToken = randomBytes(32).toString("base64url");
  const secrets = [config.password, config.databaseUrl, cookieSecret, serviceToken];

  let copy;
  let server;
  let rawPool;
  let manifestDirectory;
  let failure = null;
  let stopReason = null;
  let resolveStop;
  const stopPromise = new Promise((resolve) => {
    resolveStop = resolve;
  });
  const controller = new AbortController();
  const requestStop = (reason) => {
    if (stopReason) return;
    stopReason = reason;
    controller.abort();
    resolveStop();
  };
  process.once("SIGTERM", () => requestStop("SIGTERM"));
  process.once("SIGINT", () => requestStop("SIGINT"));
  const isStopping = () => stopReason !== null;
  const assertRunning = () => {
    if (stopReason) throw new Error(`cancelled by ${stopReason}`);
  };

  try {
    copy = await copyControlledSource();
    assertNoEnvFiles(copy.root);
    await applySandboxOriginSupport(copy.root, browserHost);
    assertRunning();

    await runMigrations({
      connectionString: config.databaseUrl,
      driver: "tcp",
      scope: "all",
    });
    assertRunning();

    rawPool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 4,
      connectionTimeoutMillis: 5_000,
      application_name: "e-pig-after-sales-sandbox",
    });

    const requestRoutePath = path.join(copy.root, REQUEST_ROUTE_RELATIVE);
    const originalRequestRoute = (await readFile(requestRoutePath, "utf8"))
      .replace(/\r\n/g, "\n");
    if (originalRequestRoute !== EXPECTED_REQUEST_ROUTE) {
      throw new Error("The controlled copy after-sales request route changed unexpectedly");
    }
    await writeFile(
      requestRoutePath,
      renderLostResponseRoute({ orderId: orderIds.one.orderId }),
      "utf8",
    );
    assertRunning();

    const serverEnv = {
      ...buildServerEnvironment(process.env, {
        market: MARKET,
        databaseUrl: config.databaseUrl,
        cookieSecret,
        serviceToken,
        origin: browserOrigin,
      }),
      [SANDBOX_MARKER_ENV]: "1",
    };
    server = startNextDev({
      root: copy.root,
      port: nextPort,
      market: MARKET,
      env: serverEnv,
      secrets,
      manageSignals: false,
    });
    // Emit the group id before readiness so the runner can still clean the
    // detached Next group if this process is killed during startup.
    console.info(`[after-sales-sandbox] next_pgid=${server.child.pid}`);
    assertRunning();
    await server.waitUntilReady(120_000, controller.signal);
    assertRunning();

    const cartOne = await createSyntheticCart({
      port: nextPort,
      hostHeader: `${browserHost}:${nextPort}`,
      browserOrigin,
      subject: "one",
    });
    const cartTwo = await createSyntheticCart({
      port: nextPort,
      hostHeader: `${browserHost}:${nextPort}`,
      browserOrigin,
      subject: "two",
    });
    secrets.push(cartOne.cookieValue, cartTwo.cookieValue);
    assertRunning();

    const seedOne = buildSyntheticOrderSeed({
      ...orderIds.one,
      cartId: cartOne.cart.id,
    });
    const seedTwo = buildSyntheticOrderSeed({
      ...orderIds.two,
      cartId: cartTwo.cart.id,
    });
    await seedSyntheticOrder(rawPool, seedOne);
    await seedSyntheticOrder(rawPool, seedTwo);
    await assertOrderReadback({
      port: nextPort,
      hostHeader: `${browserHost}:${nextPort}`,
      browserOrigin,
      cookieValue: cartOne.cookieValue,
      orderId: seedOne.order.id,
      subject: "one",
    });
    await assertOrderReadback({
      port: nextPort,
      hostHeader: `${browserHost}:${nextPort}`,
      browserOrigin,
      cookieValue: cartTwo.cookieValue,
      orderId: seedTwo.order.id,
      subject: "two",
    });
    // The browser entry page is part of readiness. A page that cannot compile
    // must fail closed instead of producing a manifest the browser cannot use.
    await assertOrderPageCompiles({
      port: nextPort,
      hostHeader: `${browserHost}:${nextPort}`,
      browserOrigin,
      orderId: seedOne.order.id,
      isStopping,
    });
    assertRunning();

    const bootstrapPath = path.join(copy.root, BOOTSTRAP_ROUTE_RELATIVE);
    await mkdir(path.dirname(bootstrapPath), { recursive: true });
    await writeFile(
      bootstrapPath,
      renderBootstrapRoute({
        browserHost,
        browserOrigin,
        subjects: {
          one: {
            cookieName: CART_COOKIE,
            cookieValue: cartOne.cookieValue,
            market: MARKET,
            orderId: seedOne.order.id,
          },
          two: {
            cookieName: CART_COOKIE,
            cookieValue: cartTwo.cookieValue,
            market: MARKET,
            orderId: seedTwo.order.id,
          },
        },
      }),
      { mode: 0o600 },
    );
    await waitForBootstrapRoute({
      port: nextPort,
      hostHeader: `${browserHost}:${nextPort}`,
      browserOrigin,
      isStopping,
    });
    assertRunning();

    manifestDirectory = await mkdtemp(
      path.join(os.tmpdir(), "e-pig-after-sales-sandbox-"),
    );
    const uploadPngPath = path.join(manifestDirectory, "synthetic-upload.png");
    await writeFile(uploadPngPath, syntheticPng(), { flag: "wx", mode: 0o600 });
    const manifestPath = path.join(manifestDirectory, "manifest.json");
    const manifest = {
      version: 1,
      market: MARKET,
      browserOrigin,
      internalOrigin,
      manifestPath,
      dataDirectory: manifestDirectory,
      runnerPid: process.ppid,
      sandboxPid: process.pid,
      nextPid: server.child.pid,
      subjects: {
        one: {
          cartId: cartOne.cart.id,
          orderId: seedOne.order.id,
          cookieName: CART_COOKIE,
          cookieValue: cartOne.cookieValue,
          bootstrapUrl: `${browserOrigin}/api/sandbox/bootstrap?subject=one`,
          orderUrl: `${browserOrigin}/${MARKET}/orders/${encodeURIComponent(seedOne.order.id)}`,
        },
        two: {
          cartId: cartTwo.cart.id,
          orderId: seedTwo.order.id,
          cookieName: CART_COOKIE,
          cookieValue: cartTwo.cookieValue,
          bootstrapUrl: `${browserOrigin}/api/sandbox/bootstrap?subject=two`,
          orderUrl: `${browserOrigin}/${MARKET}/orders/${encodeURIComponent(seedTwo.order.id)}`,
        },
      },
      service: {
        baseUrl: `${internalOrigin}/api/${MARKET}/after-sales/service`,
        token: serviceToken,
        headers: {
          "X-After-Sales-Contract-Version": "1",
          Authorization: `Bearer ${serviceToken}`,
        },
      },
      database: {
        url: config.databaseUrl,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
      },
      fixtures: {
        uploadPng: uploadPngPath,
      },
      boundaries: {
        lostResponse: {
          subject: "one",
          orderId: seedOne.order.id,
          descriptionMarker: LOST_RESPONSE_MARKER,
          mode: "synthetic-503-after-commit-once",
          note:
            "Server boundary only: the request is committed, then the response is replaced once with a synthetic 503. This is not a real network disconnect.",
        },
      },
    };
    await writePrivateManifest(manifestDirectory, manifest);

    console.info(`[after-sales-sandbox] browser_origin=${browserOrigin}`);
    console.info(`[after-sales-sandbox] manifest=${manifestPath}`);
    console.info(formatReadyLine({ nextPgid: server.child.pid }));

    await stopPromise;
  } catch (error) {
    if (!stopReason) {
      failure = error;
      console.error(
        `[after-sales-sandbox] FAILED: ${redactSandboxText(
          compactFailure(error instanceof Error ? error.message : String(error)),
          secrets,
        )}`,
      );
    }
  } finally {
    // SIGKILL bypasses this block. The runner can still reap the detached Next
    // group and remove the container and volume, but a killed sandbox leaves
    // its manifest directory and controlled copy for manual removal. No
    // supervisor is installed by design.
    const cleanup = {
      serverStopped: false,
      poolClosed: false,
      copyRemoved: false,
      manifestRemoved: false,
    };
    let cleanupError = null;

    if (server) {
      try {
        await server.stop();
        cleanup.serverStopped = true;
      } catch (error) {
        cleanupError ??= error;
      }
    } else {
      cleanup.serverStopped = true;
    }

    if (rawPool) {
      try {
        await rawPool.end();
        cleanup.poolClosed = true;
      } catch (error) {
        cleanupError ??= error;
      }
    } else {
      cleanup.poolClosed = true;
    }

    if (copy) {
      try {
        await copy.cleanup();
        cleanup.copyRemoved = !existsSync(copy.root);
      } catch (error) {
        cleanupError ??= error;
      }
    } else {
      cleanup.copyRemoved = true;
    }

    if (manifestDirectory) {
      try {
        await rm(manifestDirectory, { recursive: true, force: true });
        cleanup.manifestRemoved = !existsSync(manifestDirectory);
      } catch (error) {
        cleanupError ??= error;
      }
    } else {
      cleanup.manifestRemoved = true;
    }

    try {
      assertSandboxCleanup(cleanup);
      console.info(
        `[after-sales-sandbox] stopped server_stopped=${cleanup.serverStopped} `
          + `pool_closed=${cleanup.poolClosed} copy_removed=${cleanup.copyRemoved} `
          + `manifest_removed=${cleanup.manifestRemoved} `
          + `reason=${stopReason ?? "none"} clean=true`,
      );
    } catch (error) {
      failure ??= error;
      console.error(
        `[after-sales-sandbox] FAILED cleanup: ${redactSandboxText(
          compactFailure(error instanceof Error ? error.message : String(error)),
          secrets,
        )}`,
      );
    }

    if (failure) {
      if (cleanupError && failure !== cleanupError) {
        console.error(
          `[after-sales-sandbox] FAILED cleanup detail: ${redactSandboxText(
            compactFailure(
              cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            ),
            secrets,
          )}`,
        );
      }
      process.exitCode = 1;
    }
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main();
}
