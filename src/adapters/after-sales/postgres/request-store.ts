import "server-only";

import { randomUUID } from "node:crypto";

import {
  createAfterSalesError,
  encodeFeedCursor,
  type AfterSalesRequest,
  type CreateRequestResult,
  type ServiceRequestFeed,
} from "@/core/contracts/after-sales";
import type { MarketId } from "@/platform/config/markets";

import {
  transaction,
  type CommercePool,
  type CommerceQuery,
} from "@/adapters/commerce/postgres/pool";

const positionPattern = /^(0|[1-9][0-9]*)$/;
const MAX_FEED_LIMIT = 200;
/** PostgreSQL `bigint` upper bound; larger values fail the `$2::bigint` cast. */
const MAX_FEED_POSITION = BigInt("9223372036854775807");

export type PublishAfterSalesRequestInput = {
  /** Already-validated internal request; sequence is assigned by the database. */
  request: AfterSalesRequest;
  cartId: string;
  creationKey: string;
  fingerprint: string;
};

export type RequestCreationLookup = {
  market: MarketId;
  cartId: string;
  creationKey: string;
};

export type RequestFeedQuery = {
  market: MarketId;
  /** Trusted internal decimal position, not a wire cursor. */
  position: string;
  limit: number;
};

export type AfterSalesRequestStore = {
  publish(input: PublishAfterSalesRequestInput): Promise<CreateRequestResult>;
  findByCreationKey(input: RequestCreationLookup): Promise<AfterSalesRequest | null>;
  readFeed(input: RequestFeedQuery): Promise<ServiceRequestFeed>;
};

const errorRequestId = () => `req_store_${randomUUID()}`;

function internalFailure(): never {
  throw createAfterSalesError({
    code: "INTERNAL_ERROR",
    requestId: errorRequestId(),
    retryable: false,
    recoveryAction: "NONE",
  });
}

function invalidCursor(): never {
  throw createAfterSalesError({
    code: "INVALID_CURSOR",
    requestId: errorRequestId(),
    details: { field: "cursor" },
  });
}

function invalidLimit(): never {
  throw createAfterSalesError({
    code: "VALIDATION_ERROR",
    requestId: errorRequestId(),
    details: { field: "limit" },
  });
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && positionPattern.test(value)) return BigInt(value);
  return internalFailure();
}

function storedRequest(data: unknown, sequence: unknown): AfterSalesRequest {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return internalFailure();
  return {
    ...(data as AfterSalesRequest),
    // The column is authoritative; JSONB can only carry a stale copy.
    sequence: toBigInt(sequence).toString(),
  };
}

/**
 * Publish inside a caller-owned transaction. The caller must not hold locks
 * that conflict with the counter-first lock order; this function never opens a
 * nested transaction.
 */
export async function publishAfterSalesRequestInTransaction(
  db: CommerceQuery,
  { request, cartId, creationKey, fingerprint }: PublishAfterSalesRequestInput,
): Promise<CreateRequestResult> {
  const market = request.market;
  // Initialize the per-market counter without racing another first publisher.
  await db.query(
    `INSERT INTO after_sales_request_counters (market, sequence)
     VALUES ($1, 0)
     ON CONFLICT (market) DO NOTHING`,
    [market],
  );
  // Lock before looking up the creation key so one market publishes serially.
  const counter = await db.query(
    `SELECT sequence::text AS sequence
     FROM after_sales_request_counters
     WHERE market = $1
     FOR UPDATE`,
    [market],
  );
  const counterRow = counter.rows[0];
  if (!counterRow) return internalFailure();
  const allocated = toBigInt(counterRow.sequence);

  const existing = await db.query(
    `SELECT fingerprint, sequence::text AS sequence, data
     FROM after_sales_requests
     WHERE market = $1 AND cart_id = $2 AND creation_key = $3`,
    [market, cartId, creationKey],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].fingerprint !== fingerprint) {
      throw createAfterSalesError({
        code: "IDEMPOTENCY_CONFLICT",
        requestId: errorRequestId(),
        details: { operation: "createAfterSalesRequest" },
      });
    }
    return {
      request: storedRequest(existing.rows[0].data, existing.rows[0].sequence),
      replayed: true,
    };
  }

  const sequence = allocated + BigInt(1);
  await db.query(
    `UPDATE after_sales_request_counters
     SET sequence = $2::bigint
     WHERE market = $1`,
    [market, sequence.toString()],
  );
  const stored: AfterSalesRequest = { ...request, sequence: sequence.toString() };
  await db.query(
    `INSERT INTO after_sales_requests
       (id, market, cart_id, order_id, creation_key, fingerprint, sequence, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7::bigint, $8::jsonb)`,
    [
      stored.id,
      market,
      cartId,
      stored.orderId,
      creationKey,
      fingerprint,
      sequence.toString(),
      JSON.stringify(stored),
    ],
  );
  return { request: stored, replayed: false };
}

/**
 * Minimal durable request publication store. Ownership, business validation and
 * attachment checks stay in the adapter/HTTP layers; this module only serializes
 * per-market publication, idempotency lookup and feed reads in PostgreSQL.
 */
export function createAfterSalesRequestStore(pool: CommercePool): AfterSalesRequestStore {
  return {
    publish(input) {
      return transaction(pool, (db) => publishAfterSalesRequestInTransaction(db, input));
    },

    async findByCreationKey({ market, cartId, creationKey }) {
      const { rows } = await pool.query(
        `SELECT sequence::text AS sequence, data
         FROM after_sales_requests
         WHERE market = $1 AND cart_id = $2 AND creation_key = $3`,
        [market, cartId, creationKey],
      );
      const row = rows[0];
      return row ? storedRequest(row.data, row.sequence) : null;
    },

    async readFeed({ market, position, limit }) {
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FEED_LIMIT) invalidLimit();
      if (!positionPattern.test(position)) invalidCursor();
      const start = toBigInt(position);
      // Reject before SQL so the bigint cast cannot surface SQLSTATE 22003.
      if (start > MAX_FEED_POSITION) invalidCursor();

      // One statement reads the counter and the page from the same snapshot.
      const { rows } = await pool.query(
        `WITH counter AS (
           SELECT COALESCE(
             (SELECT sequence FROM after_sales_request_counters WHERE market = $1::text),
             0
           )::text AS high_watermark
         ),
         page AS (
           SELECT sequence, data
           FROM after_sales_requests
           WHERE market = $1::text AND sequence > $2::bigint
           ORDER BY sequence
           LIMIT $3::int
         )
         SELECT
           (SELECT high_watermark FROM counter) AS high_watermark,
           COALESCE(
             (SELECT jsonb_agg(
                jsonb_build_object('sequence', page.sequence::text, 'request', page.data)
                ORDER BY page.sequence
              )
              FROM page),
             '[]'::jsonb
           ) AS items`,
        [market, start.toString(), limit + 1],
      );

      const row = rows[0];
      if (!row) return internalFailure();
      const highWatermark = toBigInt(row.high_watermark);
      if (start > highWatermark) invalidCursor();

      const pageRows = Array.isArray(row.items)
        ? (row.items as Record<string, unknown>[])
        : internalFailure();
      const selected = pageRows.slice(0, limit);
      const last = selected.at(-1);
      const nextPosition = last ? toBigInt(last.sequence) : start;
      return {
        items: selected.map((entry) => storedRequest(entry.request, entry.sequence)),
        highWatermark: highWatermark.toString(),
        nextCursor: encodeFeedCursor({ market, position: nextPosition }),
        hasMore: pageRows.length > limit,
      };
    },
  };
}
