import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertSandboxCleanup,
  buildBrowserIdentity,
  buildSyntheticOrderIdentity,
  buildSyntheticOrderSeed,
  formatReadyLine,
  parseSandboxEnvironment,
  patchSandboxOriginSources,
  redactSandboxText,
  renderBootstrapRoute,
  renderLostResponseRoute,
  syntheticPng,
  writePrivateManifest,
} from "./after-sales-browser-sandbox.mjs";
import {
  TEST_CONTAINER_MARKER,
  TEST_DATABASE,
  TEST_MARKER,
  TEST_USER,
} from "./after-sales-pg-safety.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const NONCE = "0123456789abcdef";
const PASSWORD = "runner-generated-password-123";
const CONTAINER = "e-pig-as5c-0123456789abcdef";

function validEnvironment(overrides = {}) {
  return {
    [TEST_MARKER]: "1",
    [TEST_CONTAINER_MARKER]: CONTAINER,
    PGHOST: "127.0.0.1",
    PGPORT: "49153",
    PGDATABASE: TEST_DATABASE,
    PGUSER: TEST_USER,
    PGPASSWORD: PASSWORD,
    PGSSLMODE: "disable",
    PATH: "/usr/bin",
    HOME: "/tmp/home",
    ...overrides,
  };
}

function subjects() {
  const one = buildSyntheticOrderIdentity({ nonce: NONCE, subject: "one" });
  const two = buildSyntheticOrderIdentity({ nonce: NONCE, subject: "two" });
  return {
    one: {
      cookieName: "epig_cart_au",
      cookieValue: "payload-one.mac-one",
      market: "au",
      orderId: one.orderId,
      serviceToken: "must-not-be-rendered",
    },
    two: {
      cookieName: "epig_cart_au",
      cookieValue: "payload-two.mac-two",
      market: "au",
      orderId: two.orderId,
    },
  };
}

describe("after-sales browser sandbox environment", () => {
  it("accepts only the dedicated runner-owned PG* environment", () => {
    const config = parseSandboxEnvironment(validEnvironment());
    expect(config).toMatchObject({
      containerName: CONTAINER,
      host: "127.0.0.1",
      port: 49153,
      database: TEST_DATABASE,
      user: TEST_USER,
      password: PASSWORD,
    });
    expect(config.databaseUrl).toBe(
      `postgres://${encodeURIComponent(TEST_USER)}:${encodeURIComponent(PASSWORD)}`
        + `@127.0.0.1:49153/${encodeURIComponent(TEST_DATABASE)}`,
    );

    expect(() => parseSandboxEnvironment(validEnvironment({ [TEST_MARKER]: "0" })))
      .toThrow(/dedicated PostgreSQL runner/);
    expect(() => parseSandboxEnvironment(validEnvironment({ DATABASE_URL: "postgres://real.example/app" })))
      .toThrow(/inherited database URL/);
    expect(() => parseSandboxEnvironment(validEnvironment({ PGHOST: "real.example" })))
      .toThrow(/loopback/);
    expect(() => parseSandboxEnvironment(validEnvironment({ PGDATABASE: "production" })))
      .toThrow(/dedicated/);
    expect(() => parseSandboxEnvironment(validEnvironment({ PGUSER: "postgres" })))
      .toThrow(/dedicated/);
    expect(() => parseSandboxEnvironment(validEnvironment({ PGPASSWORD: "short" })))
      .toThrow(/runner-owned/);
    expect(() => parseSandboxEnvironment(validEnvironment({ PGSSLMODE: "require" })))
      .toThrow(/disable TLS/);
    expect(() => parseSandboxEnvironment(validEnvironment({ [TEST_CONTAINER_MARKER]: "postgres" })))
      .toThrow(/runner-owned/);
  });

  it("builds a unique browser origin while keeping the internal target on 127.0.0.1", () => {
    const identity = buildBrowserIdentity({ nonce: NONCE, port: 4123 });
    expect(identity).toEqual({
      browserHost: `epig-qa-${NONCE}.localhost`,
      browserOrigin: `http://epig-qa-${NONCE}.localhost:4123`,
      internalOrigin: "http://127.0.0.1:4123",
    });
    expect(buildBrowserIdentity({ nonce: "fedcba9876543210", port: 4124 }).browserOrigin)
      .not.toBe(identity.browserOrigin);

    expect(() => buildBrowserIdentity({ nonce: "not-a-nonce", port: 4123 }))
      .toThrow(/nonce/);
    expect(() => buildBrowserIdentity({ nonce: NONCE, port: 0 }))
      .toThrow(/port/);
  });
});

describe("after-sales browser sandbox controlled-copy origin patch", () => {
  it("widens only the exact per-run loopback host and leaves localhost intact", async () => {
    const browserHost = `epig-qa-${NONCE}.localhost`;
    const sources = {
      envSource: await readFile(path.join(repositoryRoot, "src/platform/config/env.ts"), "utf8"),
      consumerSource: await readFile(
        path.join(repositoryRoot, "src/platform/http/consumer-after-sales-api.ts"),
        "utf8",
      ),
      commerceSource: await readFile(
        path.join(repositoryRoot, "src/adapters/commerce/postgres/commerce.ts"),
        "utf8",
      ),
      nextConfigSource: await readFile(path.join(repositoryRoot, "next.config.ts"), "utf8"),
      browserHost,
    };
    const patched = patchSandboxOriginSources(sources);

    for (const key of ["envSource", "consumerSource", "commerceSource"]) {
      expect(patched[key]).toContain(browserHost);
      expect(patched[key]).toContain('hostname === "localhost"');
      expect(patched[key]).not.toContain('.endsWith(".localhost")');
    }
    expect(patched.nextConfigSource).toContain(
      `allowedDevOrigins: [${JSON.stringify(browserHost)}]`,
    );

    expect(() => patchSandboxOriginSources({ ...sources, envSource: "no target here" }))
      .toThrow(/patch target is missing/);
    expect(() => patchSandboxOriginSources({
      ...sources,
      envSource: `${sources.envSource}\n${sources.envSource}`,
    })).toThrow(/patch target is ambiguous/);
  });
});

describe("after-sales browser sandbox synthetic fixtures", () => {
  it("builds a complete paid order snapshot with the synthetic SKU and consistent totals", () => {
    const identity = buildSyntheticOrderIdentity({ nonce: NONCE, subject: "one" });
    const seed = buildSyntheticOrderSeed({
      ...identity,
      cartId: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-11-05T00:00:00.000Z",
    });

    expect(seed.order).toMatchObject({
      id: identity.orderId,
      checkoutId: identity.checkoutId,
      cartId: "11111111-1111-4111-8111-111111111111",
      market: "au",
      status: "paid",
      createdAt: "2026-11-05T00:00:00.000Z",
      contact: { email: "buyer@example.invalid" },
      address: { country: "AU" },
    });
    expect(seed.order.lines[0]).toMatchObject({
      sku: "SYNTH-MUG-001",
      quantity: 2,
      unitPrice: { amount: 12.5, currency: "AUD" },
      lineTotal: { amount: 25, currency: "AUD" },
    });
    expect(seed.order.subtotal).toEqual(seed.order.total);
    expect(seed.checkout.id).toBe(identity.checkoutId);
    expect(seed.checkout.cartId).toBe(seed.order.cartId);
    expect(seed.paymentRequest.total).toEqual(seed.order.total);
  });

  it("uses a recent UTC date by default and rejects malformed identities", () => {
    const identity = buildSyntheticOrderIdentity({ nonce: NONCE, subject: "two" });
    const seed = buildSyntheticOrderSeed({
      ...identity,
      cartId: "22222222-2222-4222-8222-222222222222",
    });
    const age = Date.now() - Date.parse(seed.order.createdAt);
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(2 * 24 * 60 * 60 * 1000);

    expect(() => buildSyntheticOrderIdentity({ nonce: NONCE, subject: "three" }))
      .toThrow(/one or two/);
    expect(() => buildSyntheticOrderSeed({
      ...identity,
      cartId: "not-a-cart",
    })).toThrow(/cart id/);
    expect(() => buildSyntheticOrderSeed({
      ...identity,
      cartId: "22222222-2222-4222-8222-222222222222",
      createdAt: "not-a-date",
    })).toThrow(/date/);
  });

  it("prepares a real PNG buffer for the browser upload fixture", () => {
    const png = syntheticPng();
    expect(png.length).toBeGreaterThan(60);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});

describe("after-sales browser sandbox generated routes", () => {
  it("renders a bootstrap route with exactly two fixed subjects and no service data", () => {
    const browserHost = `epig-qa-${NONCE}.localhost`;
    const browserOrigin = `http://${browserHost}:4123`;
    const route = renderBootstrapRoute({
      browserHost,
      browserOrigin,
      subjects: subjects(),
    });

    expect(route).toContain(browserHost);
    expect(route).toContain(browserOrigin);
    expect(route).toContain("process.env.E_PIG_AFTER_SALES_SANDBOX");
    expect(route).toContain("subject must be one or two");
    expect(route).toContain("payload-one.mac-one");
    expect(route).toContain("payload-two.mac-two");
    expect(route).not.toContain("must-not-be-rendered");
    expect(route).not.toContain("password");
    expect(route).not.toContain("Bearer");

    expect(() => renderBootstrapRoute({
      browserHost,
      browserOrigin,
      subjects: { ...subjects(), three: { ...subjects().one, orderId: "ord_three" } },
    })).toThrow(/exactly one and two/);
    expect(() => renderBootstrapRoute({
      browserHost,
      browserOrigin,
      subjects: { ...subjects(), one: { ...subjects().one, cookieName: "other" } },
    })).toThrow(/cookie name/);
    expect(() => renderBootstrapRoute({
      browserHost,
      browserOrigin,
      subjects: { ...subjects(), one: { ...subjects().one, cookieValue: "bad value;" } },
    })).toThrow(/cookie value/);
    expect(() => renderBootstrapRoute({
      browserHost,
      browserOrigin: "https://elsewhere.example",
      subjects: subjects(),
    })).toThrow(/origin/);
  });

  it("renders a one-shot committed-response-loss wrapper without touching production logic", () => {
    const orderId = buildSyntheticOrderIdentity({ nonce: NONCE, subject: "one" }).orderId;
    const route = renderLostResponseRoute({ orderId });

    expect(route).toContain(orderId);
    expect(route).toContain("e-pig-sandbox-committed-response-loss");
    expect(route).toContain("droppedOnce");
    expect(route).toContain("status: 503");
    expect(route).toContain("committed-response-dropped-once");
    expect(route).toContain("process.env.E_PIG_AFTER_SALES_SANDBOX");
    expect(route).toContain("createAppConsumerAfterSalesApi");
    expect(route).not.toContain("password");
    expect(route).not.toContain("Bearer");

    expect(() => renderLostResponseRoute({ orderId: "bad id" })).toThrow(/order id/);
  });
});

describe("after-sales browser sandbox private manifest", () => {
  it("writes exclusively with 0600 and only then formats a secret-free ready line", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "e-pig-sandbox-spec-"));
    try {
      const manifest = {
        browserOrigin: `http://epig-qa-${NONCE}.localhost:4123`,
        internalOrigin: "http://127.0.0.1:4123",
        manifestPath: path.join(directory, "manifest.json"),
        service: { token: "service-token-must-not-leak" },
        database: { password: PASSWORD, url: "postgres://user:secret@127.0.0.1/db" },
        subjects: { one: { cookieValue: "cookie-must-not-leak" } },
      };
      const manifestPath = await writePrivateManifest(directory, manifest);
      expect((await stat(manifestPath)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(manifestPath, "utf8"))).toMatchObject({
        browserOrigin: manifest.browserOrigin,
      });
      await expect(writePrivateManifest(directory, manifest)).rejects.toMatchObject({
        code: "EEXIST",
      });

      const ready = formatReadyLine({ nextPgid: 4321 });
      expect(ready).toContain("ready");
      expect(ready).toContain("next_pgid=4321");
      expect(ready).not.toContain("service-token-must-not-leak");
      expect(ready).not.toContain(PASSWORD);
      expect(ready).not.toContain("cookie-must-not-leak");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("redacts database URLs, bearer tokens and known secrets", () => {
    const redacted = redactSandboxText(
      `password=${PASSWORD} url=postgres://user:secret@127.0.0.1/e_pig_5c `
        + "authorization=Bearer abc.def.ghi service=service-token-123",
      [PASSWORD, "service-token-123"],
    );
    expect(redacted).not.toContain(PASSWORD);
    expect(redacted).not.toContain("service-token-123");
    expect(redacted).not.toContain("postgres://user:secret");
    expect(redacted).not.toContain("Bearer abc.def.ghi");
  });

  it("never accepts unconfirmed cleanup as success", () => {
    expect(() => assertSandboxCleanup({
      serverStopped: true,
      poolClosed: true,
      copyRemoved: true,
      manifestRemoved: true,
    })).not.toThrow();
    expect(() => assertSandboxCleanup({
      serverStopped: true,
      poolClosed: false,
      copyRemoved: true,
      manifestRemoved: false,
    })).toThrow(/poolClosed, manifestRemoved/);
  });
});
