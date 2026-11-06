import { z } from "zod";

import type {
  AfterSalesRequestView,
  RequestBody,
} from "./after-sales-client";

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const utcPattern =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;
const STORAGE_VERSION = 1;
const PROBE_KEY = "e-pig:after-sales:v1:storage-probe";

const opaqueId = z.string().regex(opaqueIdPattern);
const utcString = z
  .string()
  .regex(utcPattern)
  .refine((value) => !Number.isNaN(Date.parse(value)));

const requestBodySchema = z.object({
  order_id: opaqueId,
  type: z.enum(["damaged", "wrong_item", "return", "other"]),
  description: z
    .string()
    .min(1)
    .refine((value) => /\S/.test(value))
    .refine((value) => Array.from(value).length <= 5000),
  attachment_ids: z
    .array(opaqueId)
    .max(3)
    .refine((values) => new Set(values).size === values.length),
});

const pendingSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  idempotencyKey: z.string().regex(idempotencyKeyPattern),
  requestHash: z.string().regex(hashPattern),
  body: requestBodySchema,
  createdAt: z.number().finite(),
});

const markerSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  idempotencyKey: z.string().regex(idempotencyKeyPattern),
  requestHash: z.string().regex(hashPattern),
  createdAt: z.number().finite(),
});

const indexEntrySchema = z.object({
  request_id: opaqueId,
  created_at: utcString,
  updated_at: utcString,
});

const indexSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  requests: z.array(indexEntrySchema),
  last_selected_id: opaqueId.optional(),
});

export type AfterSalesScope = {
  market: string;
  cartId: string;
  orderId: string;
};

export type PendingContext = z.infer<typeof pendingSchema>;
export type PendingMarker = z.infer<typeof markerSchema>;
export type IndexedRequest = z.infer<typeof indexEntrySchema>;
export type RequestIndex = z.infer<typeof indexSchema>;

export type StorageFailureReason =
  | "unavailable"
  | "corrupt"
  | "already_pending"
  | "invalid_input"
  | "stale";

export type StorageOperationGuard = () => boolean;

export class AfterSalesStorageError extends Error {
  readonly reason: StorageFailureReason;

  constructor(reason: StorageFailureReason, message: string) {
    super(message);
    this.name = "AfterSalesStorageError";
    this.reason = reason;
  }
}

function unavailable(): never {
  throw new AfterSalesStorageError(
    "unavailable",
    "This browser could not save your application safely. Sending is disabled here to avoid sending the same application twice.",
  );
}

function corrupt(): never {
  throw new AfterSalesStorageError(
    "corrupt",
    "A saved application in this browser cannot be read safely. To avoid sending the same application twice, sending is disabled in this tab.",
  );
}

/**
 * Hashing is the only await between a storage decision and its write. Re-check
 * the caller's authorization after it so an access loss during the wait cannot
 * commit a decision made before that loss.
 */
function assertOperationCurrent(
  isCurrent: StorageOperationGuard | undefined,
): void {
  if (isCurrent && !isCurrent()) {
    throw new AfterSalesStorageError(
      "stale",
      "This after-sales session changed before the browser could save the application.",
    );
  }
}

export function afterSalesStorageKeys(scope: AfterSalesScope) {
  const prefix = [
    "e-pig",
    "after-sales",
    `v${STORAGE_VERSION}`,
    encodeURIComponent(scope.market),
    encodeURIComponent(scope.cartId),
    encodeURIComponent(scope.orderId),
  ].join(":");
  return {
    pending: `${prefix}:pending`,
    marker: `${prefix}:marker`,
    index: `${prefix}:index`,
  } as const;
}

function sessionStorageOrThrow(): Storage {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) unavailable();
    return window.sessionStorage;
  } catch {
    unavailable();
  }
}

function localStorageOrThrow(): Storage {
  try {
    if (typeof window === "undefined" || !window.localStorage) unavailable();
    return window.localStorage;
  } catch {
    unavailable();
  }
}

function readRaw(target: Storage, key: string): string | null {
  try {
    return target.getItem(key);
  } catch {
    unavailable();
  }
}

function writeVerified(target: Storage, key: string, value: string): void {
  try {
    target.setItem(key, value);
    if (target.getItem(key) !== value) unavailable();
  } catch {
    unavailable();
  }
}

function removeVerified(target: Storage, key: string): void {
  try {
    target.removeItem(key);
    if (target.getItem(key) !== null) unavailable();
  } catch {
    unavailable();
  }
}

function parseStored<T>(
  schema: z.ZodType<T>,
  raw: string | null,
): T | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    corrupt();
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) corrupt();
  return parsed.data;
}

export function emptyRequestIndex(): RequestIndex {
  return { version: STORAGE_VERSION, requests: [] };
}

export function canonicalRequestBody(body: RequestBody): RequestBody {
  return {
    order_id: body.order_id,
    type: body.type,
    description: body.description,
    attachment_ids: [...body.attachment_ids].sort(),
  };
}

export async function hashRequestBody(body: RequestBody): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) unavailable();
  let digest: ArrayBuffer;
  try {
    digest = await subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify({
          order_id: body.order_id,
          type: body.type,
          description: body.description,
          attachment_ids: [...body.attachment_ids],
        }),
      ),
    );
  } catch {
    unavailable();
  }
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function assertRecoveryStorage(): void {
  const session = sessionStorageOrThrow();
  const local = localStorageOrThrow();
  writeVerified(session, PROBE_KEY, "1");
  removeVerified(session, PROBE_KEY);
  writeVerified(local, PROBE_KEY, "1");
  removeVerified(local, PROBE_KEY);
}

export async function readPendingContext(
  scope: AfterSalesScope,
): Promise<PendingContext | null> {
  const keys = afterSalesStorageKeys(scope);
  const pending = parseStored(
    pendingSchema,
    readRaw(sessionStorageOrThrow(), keys.pending),
  );
  if (!pending) return null;
  if (pending.body.order_id !== scope.orderId) corrupt();
  const expected = await hashRequestBody(pending.body);
  if (expected !== pending.requestHash) corrupt();
  return pending;
}

export function readPendingMarker(
  scope: AfterSalesScope,
): PendingMarker | null {
  const keys = afterSalesStorageKeys(scope);
  return parseStored(markerSchema, readRaw(localStorageOrThrow(), keys.marker));
}

export function readRequestIndex(scope: AfterSalesScope): RequestIndex | null {
  const keys = afterSalesStorageKeys(scope);
  return parseStored(indexSchema, readRaw(localStorageOrThrow(), keys.index));
}

export async function readRecoveryState(scope: AfterSalesScope) {
  const pending = await readPendingContext(scope);
  const marker = readPendingMarker(scope);
  const index = readRequestIndex(scope);
  return { pending, marker, index };
}

export async function createSubmission(
  scope: AfterSalesScope,
  body: RequestBody,
  idempotencyKey: string,
  isCurrent?: StorageOperationGuard,
): Promise<PendingContext> {
  if (!idempotencyKeyPattern.test(idempotencyKey)) {
    throw new AfterSalesStorageError(
      "invalid_input",
      "This browser could not prepare the application. Reload the page and try again.",
    );
  }
  const session = sessionStorageOrThrow();
  const local = localStorageOrThrow();
  const keys = afterSalesStorageKeys(scope);
  if (readRaw(session, keys.pending) !== null || readRaw(local, keys.marker) !== null) {
    throw new AfterSalesStorageError(
      "already_pending",
      "This tab already has an application that has not been confirmed. Retry that application before starting another one.",
    );
  }
  const canonical = canonicalRequestBody(body);
  const requestHash = await hashRequestBody(canonical);
  assertOperationCurrent(isCurrent);
  const createdAt = Date.now();
  const pending: PendingContext = {
    version: STORAGE_VERSION,
    idempotencyKey,
    requestHash,
    body: canonical,
    createdAt,
  };
  const marker: PendingMarker = {
    version: STORAGE_VERSION,
    idempotencyKey,
    requestHash,
    createdAt,
  };
  writeVerified(session, keys.pending, JSON.stringify(pending));
  try {
    writeVerified(local, keys.marker, JSON.stringify(marker));
  } catch (error) {
    try {
      session.removeItem(keys.pending);
    } catch {
      /* The original failure is the actionable one. */
    }
    throw error;
  }
  return pending;
}

function sortIndex(index: RequestIndex): RequestIndex {
  return {
    ...index,
    requests: [...index.requests].sort((left, right) => {
      const byCreated = right.created_at.localeCompare(left.created_at);
      return byCreated === 0
        ? right.request_id.localeCompare(left.request_id)
        : byCreated;
    }),
  };
}

export function upsertIndexEntry(
  index: RequestIndex | null,
  entry: IndexedRequest,
): RequestIndex {
  const current = index ?? emptyRequestIndex();
  return sortIndex({
    ...current,
    requests: [
      entry,
      ...current.requests.filter(
        (item) => item.request_id !== entry.request_id,
      ),
    ],
  });
}

export function withSelectedIndexEntry(
  index: RequestIndex,
  requestId: string,
): RequestIndex {
  return { ...index, last_selected_id: requestId };
}

/**
 * Confirms a server request ID in localStorage before either pending copy is
 * removed. A failure leaves both the original key and body in place.
 */
export async function confirmSubmission(
  scope: AfterSalesScope,
  entry: IndexedRequest,
): Promise<RequestIndex> {
  const local = localStorageOrThrow();
  const session = sessionStorageOrThrow();
  const keys = afterSalesStorageKeys(scope);
  const next = upsertIndexEntry(readRequestIndex(scope), entry);
  writeVerified(local, keys.index, JSON.stringify(next));
  removeVerified(local, keys.marker);
  removeVerified(session, keys.pending);
  return next;
}

export async function clearSubmission(scope: AfterSalesScope): Promise<void> {
  const local = localStorageOrThrow();
  const session = sessionStorageOrThrow();
  const keys = afterSalesStorageKeys(scope);
  // Marker first: if the body removal fails, a valid pending record survives.
  removeVerified(local, keys.marker);
  removeVerified(session, keys.pending);
}

function recoveredBody(request: AfterSalesRequestView): RequestBody {
  return canonicalRequestBody({
    order_id: request.order_id,
    type: request.type,
    description: request.description,
    attachment_ids: request.attachments.map(
      (attachment) => attachment.attachment_id,
    ),
  });
}

export async function recordRecoveredRequest(
  scope: AfterSalesScope,
  request: AfterSalesRequestView,
  isCurrent?: StorageOperationGuard,
): Promise<{
  index: RequestIndex;
  markerRemaining: boolean;
  markerWarning: boolean;
}> {
  const local = localStorageOrThrow();
  const keys = afterSalesStorageKeys(scope);
  // A manual lookup must never replace an unsent saved body. Only an explicit
  // retry may use that key, and only with its original body.
  if (readRaw(sessionStorageOrThrow(), keys.pending) !== null) {
    throw new AfterSalesStorageError(
      "already_pending",
      "This tab still has an unsent application. Retry that application instead of starting a different one.",
    );
  }

  const marker = readPendingMarker(scope);
  let markerMatches = false;
  if (marker) {
    // A lost body leaves only a marker, so the marker's hash is the sole way to
    // prove this looked-up request is the one that may already have been sent.
    const recoveredHash = await hashRequestBody(recoveredBody(request));
    assertOperationCurrent(isCurrent);
    markerMatches = recoveredHash === marker.requestHash;
  }
  // Do not backfill the index once access has been lost: the marker must stay
  // unknown so the next mount still blocks sending.
  assertOperationCurrent(isCurrent);
  const next = upsertIndexEntry(readRequestIndex(scope), {
    request_id: request.request_id,
    created_at: request.created_at,
    updated_at: request.updated_at,
  });
  writeVerified(local, keys.index, JSON.stringify(next));

  if (!marker) {
    return { index: next, markerRemaining: false, markerWarning: false };
  }
  if (!markerMatches) {
    return { index: next, markerRemaining: true, markerWarning: false };
  }
  try {
    removeVerified(local, keys.marker);
  } catch {
    return { index: next, markerRemaining: true, markerWarning: true };
  }
  return { index: next, markerRemaining: false, markerWarning: false };
}

export function rememberSelectedRequest(
  scope: AfterSalesScope,
  requestId: string,
): void {
  try {
    const local = localStorageOrThrow();
    const keys = afterSalesStorageKeys(scope);
    const index = readRequestIndex(scope);
    if (!index) return;
    const next = withSelectedIndexEntry(index, requestId);
    writeVerified(local, keys.index, JSON.stringify(next));
  } catch {
    // Selection is a convenience only; it never blocks reading or sending.
  }
}

export function isOpaqueAfterSalesId(value: string): boolean {
  return opaqueIdPattern.test(value);
}
