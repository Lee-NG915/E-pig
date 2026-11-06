// @vitest-environment jsdom
import { webcrypto } from "node:crypto";

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { AfterSalesRequestView } from "./after-sales-client";
import {
  AfterSalesStorageError,
  afterSalesStorageKeys,
  canonicalRequestBody,
  confirmSubmission,
  createSubmission,
  hashRequestBody,
  readRecoveryState,
  readRequestIndex,
  recordRecoveredRequest,
  type AfterSalesScope,
} from "./after-sales-storage";

const scope: AfterSalesScope = {
  market: "au",
  cartId: "cart-1",
  orderId: "order-1",
};
const otherScope: AfterSalesScope = { ...scope, cartId: "cart-2" };
const body = {
  order_id: "order-1",
  type: "damaged" as const,
  description: "A cracked arm.",
  attachment_ids: ["att_b", "att_a"],
};
const key = "11111111-1111-4111-8111-111111111111";
const entry = {
  request_id: "req_1",
  created_at: "2026-11-06T10:00:00Z",
  updated_at: "2026-11-06T10:05:00Z",
};

function requestView(
  overrides: Partial<AfterSalesRequestView> = {},
): AfterSalesRequestView {
  return {
    request_id: entry.request_id,
    order_id: body.order_id,
    market: "au",
    type: body.type,
    description: body.description,
    attachments: body.attachment_ids.map((attachmentId) => ({
      attachment_id: attachmentId,
      file_name: "photo.png",
      media_type: "image/png",
      size_bytes: 1200,
      status: "active",
      created_at: entry.created_at,
      expires_at: entry.updated_at,
    })),
    status: "pending",
    ticket_id: null,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function deferNextDigest() {
  const realDigest = globalThis.crypto.subtle.digest.bind(
    globalThis.crypto.subtle,
  );
  let release: () => void = () => undefined;
  let markStarted: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementationOnce(
    async (algorithm, data) => {
      markStarted();
      await gate;
      return realDigest(algorithm, data);
    },
  );
  return { started, release };
}

it("partitions recovery keys by market, cart, and order", () => {
  const first = afterSalesStorageKeys(scope);
  const second = afterSalesStorageKeys(otherScope);
  expect(first.pending).not.toBe(second.pending);
  expect(first.marker).not.toBe(second.marker);
  expect(first.index).not.toBe(second.index);
  expect(first.pending).toContain("au");
  expect(first.pending).toContain("cart-1");
  expect(first.pending).toContain("order-1");
});

it("sorts attachment IDs so the canonical body and hash are stable", async () => {
  const canonical = canonicalRequestBody(body);
  expect(canonical.attachment_ids).toEqual(["att_a", "att_b"]);
  const firstHash = await hashRequestBody(canonical);
  const secondHash = await hashRequestBody({
    ...body,
    attachment_ids: ["att_a", "att_b"],
  });
  expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
  expect(firstHash).toBe(secondHash);
});

it("does not expose pending recovery state to another cart", async () => {
  await createSubmission(scope, body, key);
  const own = await readRecoveryState(scope);
  const other = await readRecoveryState(otherScope);
  expect(own.pending?.idempotencyKey).toBe(key);
  expect(own.marker?.idempotencyKey).toBe(key);
  expect(other.pending).toBeNull();
  expect(other.marker).toBeNull();
  expect(other.index).toBeNull();
});

it("writes only request IDs and times into the durable index", async () => {
  await createSubmission(scope, body, key);
  await confirmSubmission(scope, entry);
  const index = readRequestIndex(scope);
  expect(index).toEqual({
    version: 1,
    requests: [entry],
  });
  const stored = window.localStorage.getItem(
    afterSalesStorageKeys(scope).index,
  );
  expect(stored).not.toBeNull();
  expect(stored).not.toContain(body.description);
  expect(stored).not.toContain("reply");
  expect(stored).not.toContain("address");
  expect(stored).not.toContain("token");
  expect(window.sessionStorage.getItem(afterSalesStorageKeys(scope).pending)).toBeNull();
  expect(window.localStorage.getItem(afterSalesStorageKeys(scope).marker)).toBeNull();
});

it("fails closed on a corrupt durable index", () => {
  window.localStorage.setItem(afterSalesStorageKeys(scope).index, "{");
  expect(() => readRequestIndex(scope)).toThrow(AfterSalesStorageError);
  try {
    readRequestIndex(scope);
  } catch (error) {
    expect((error as AfterSalesStorageError).reason).toBe("corrupt");
  }
});

it("never replaces an unsent saved body through manual recovery", async () => {
  await createSubmission(scope, body, key);
  await expect(recordRecoveredRequest(scope, requestView())).rejects.toMatchObject({
    reason: "already_pending",
  });
});

it("clears a body-less marker only when the looked-up application matches its canonical hash", async () => {
  await createSubmission(scope, body, key);
  window.sessionStorage.removeItem(afterSalesStorageKeys(scope).pending);

  const result = await recordRecoveredRequest(scope, requestView());

  expect(result.markerRemaining).toBe(false);
  expect(window.localStorage.getItem(afterSalesStorageKeys(scope).marker)).toBeNull();
  expect(readRequestIndex(scope)?.requests[0]?.request_id).toBe(entry.request_id);
});

it("keeps the unknown lock when a different old application is recovered", async () => {
  await createSubmission(scope, body, key);
  window.sessionStorage.removeItem(afterSalesStorageKeys(scope).pending);

  const result = await recordRecoveredRequest(
    scope,
    requestView({ description: "A different earlier issue." }),
  );

  expect(result.markerRemaining).toBe(true);
  expect(result.markerWarning).toBe(false);
  expect(window.localStorage.getItem(afterSalesStorageKeys(scope).marker)).not.toBeNull();
  expect(readRequestIndex(scope)?.requests[0]?.request_id).toBe(entry.request_id);
});

it("leaves normal recovery unaffected when no marker exists", async () => {
  const result = await recordRecoveredRequest(scope, requestView());

  expect(result).toMatchObject({
    markerRemaining: false,
    markerWarning: false,
  });
  expect(readRequestIndex(scope)?.requests[0]?.request_id).toBe(entry.request_id);
});

it("keeps the marker and skips the index when access is lost while hashing a recovery", async () => {
  await createSubmission(scope, body, key);
  window.sessionStorage.removeItem(afterSalesStorageKeys(scope).pending);
  const markerBefore = window.localStorage.getItem(
    afterSalesStorageKeys(scope).marker,
  );
  expect(markerBefore).not.toBeNull();
  expect(readRequestIndex(scope)).toBeNull();

  const digest = deferNextDigest();
  let current = true;
  const outcome = recordRecoveredRequest(scope, requestView(), () => current).catch(
    (error: unknown) => error,
  );
  await digest.started;
  current = false;
  digest.release();
  const error = await outcome;

  expect(error).toMatchObject({ reason: "stale" });
  expect(
    window.localStorage.getItem(afterSalesStorageKeys(scope).marker),
  ).toBe(markerBefore);
  expect(readRequestIndex(scope)).toBeNull();
  expect(
    window.sessionStorage.getItem(afterSalesStorageKeys(scope).pending),
  ).toBeNull();
});

it("writes no pending context when access is lost while hashing a new submission", async () => {
  const digest = deferNextDigest();
  let current = true;
  const outcome = createSubmission(scope, body, key, () => current).catch(
    (error: unknown) => error,
  );
  await digest.started;
  current = false;
  digest.release();
  const error = await outcome;

  expect(error).toMatchObject({ reason: "stale" });
  expect(
    window.sessionStorage.getItem(afterSalesStorageKeys(scope).pending),
  ).toBeNull();
  expect(
    window.localStorage.getItem(afterSalesStorageKeys(scope).marker),
  ).toBeNull();
  expect(readRequestIndex(scope)).toBeNull();
});
