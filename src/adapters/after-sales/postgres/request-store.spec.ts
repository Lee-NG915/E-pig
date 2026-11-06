import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  decodeFeedCursor,
  type AfterSalesRequest,
} from "@/core/contracts/after-sales";

import type { CommercePool } from "@/adapters/commerce/postgres/pool";

import {
  createAfterSalesRequestStore,
  type AfterSalesRequestStore,
  type PublishAfterSalesRequestInput,
} from "./request-store";

const migration = () =>
  readFile("scripts/database/002-after-sales-requests.sql", "utf8");

function leasePool(db: PGlite): CommercePool {
  // PGlite has one physical connection: lease it for the complete transaction.
  let tail = Promise.resolve();
  return {
    query: async (sql, values) => db.query(sql, values),
    connect: async () => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      return { query: async (sql, values) => db.query(sql, values), release };
    },
  };
}

function makeRequest(
  overrides: Partial<AfterSalesRequest> = {},
): AfterSalesRequest {
  const id = overrides.id ?? `asr_${crypto.randomUUID()}`;
  const createdAt = "2026-11-05T00:00:00.000Z";
  return {
    id,
    sequence: "0",
    orderId: "ord_test_au",
    market: "au",
    type: "damaged",
    description: "Synthetic damaged item.",
    attachments: [],
    status: "pending",
    progress: [
      {
        status: "pending",
        message: "Your after-sales request has been received.",
        occurredAt: createdAt,
      },
    ],
    ticketId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function publication(
  overrides: Partial<PublishAfterSalesRequestInput> = {},
): PublishAfterSalesRequestInput {
  const request = overrides.request ?? makeRequest();
  return {
    request,
    cartId: "cart_au",
    creationKey: `key_${crypto.randomUUID()}`,
    fingerprint: `fp_${crypto.randomUUID()}`,
    ...overrides,
  };
}

describe("durable after-sales request store (actual PostgreSQL SQL)", () => {
  let db: PGlite;
  let store: AfterSalesRequestStore;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(await migration());
    store = createAfterSalesRequestStore(leasePool(db));
  });

  afterEach(async () => {
    await db.close();
  });

  it("applies the migration idempotently and persists a published request", async () => {
    await db.exec(await migration());

    const input = publication({ cartId: "cart_au", creationKey: "creation-1" });
    const result = await store.publish(input);

    expect(result.replayed).toBe(false);
    expect(result.request).toEqual({ ...input.request, sequence: "1" });
    await expect(
      store.findByCreationKey({
        market: "au",
        cartId: "cart_au",
        creationKey: "creation-1",
      }),
    ).resolves.toEqual(result.request);
    await expect(
      store.findByCreationKey({
        market: "au",
        cartId: "cart_au",
        creationKey: "creation-missing",
      }),
    ).resolves.toBeNull();

    const feed = await store.readFeed({ market: "au", position: "0", limit: 50 });
    expect(feed.items).toEqual([result.request]);
    expect(feed.highWatermark).toBe("1");
    expect(feed.hasMore).toBe(false);
    expect(
      decodeFeedCursor(feed.nextCursor, {
        market: "au",
        highWatermark: feed.highWatermark,
      }),
    ).toBe(BigInt(1));
  });

  it("replays one key/fingerprint without consuming a sequence and returns the current representation", async () => {
    const input = publication({ cartId: "cart_au", creationKey: "creation-1" });
    const first = await store.publish(input);

    const current: AfterSalesRequest = {
      ...first.request,
      status: "ticket_created",
      ticketId: "tic_current",
      updatedAt: "2026-11-05T01:00:00.000Z",
    };
    await db.query(
      "UPDATE after_sales_requests SET data = $1::jsonb WHERE id = $2",
      [JSON.stringify(current), input.request.id],
    );

    const replay = await store.publish(input);
    expect(replay).toEqual({ request: current, replayed: true });

    const next = await store.publish(publication({ cartId: "cart_au" }));
    expect(next.request.sequence).toBe("2");
    expect((await store.readFeed({ market: "au", position: "0", limit: 50 })).highWatermark).toBe("2");
  });

  it("serializes concurrent publication of one creation key", async () => {
    const input = publication({ cartId: "cart_au", creationKey: "creation-1" });
    const results = await Promise.all([
      store.publish(input),
      store.publish(input),
    ]);

    expect(new Set(results.map((result) => result.request.id)).size).toBe(1);
    expect(results.map((result) => result.replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(
      (await store.readFeed({ market: "au", position: "0", limit: 50 }))
        .highWatermark,
    ).toBe("1");
  });

  it("rejects the same key with a different fingerprint without writing", async () => {
    const input = publication({ cartId: "cart_au", creationKey: "creation-1" });
    await store.publish(input);

    await expect(
      store.publish({ ...input, fingerprint: "different-fingerprint" }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      kind: "conflict",
      details: { operation: "createAfterSalesRequest" },
    });

    const feed = await store.readFeed({ market: "au", position: "0", limit: 50 });
    expect(feed.items).toHaveLength(1);
    expect(feed.highWatermark).toBe("1");
  });

  it("isolates creation keys by stable subject and market", async () => {
    const sharedKey = "shared-creation-key";
    const auCartA = await store.publish(
      publication({ cartId: "cart-a", creationKey: sharedKey }),
    );
    const auCartB = await store.publish(
      publication({ cartId: "cart-b", creationKey: sharedKey }),
    );
    const usCartA = await store.publish(
      publication({
        request: makeRequest({ market: "us", orderId: "ord_test_us" }),
        cartId: "cart-a",
        creationKey: sharedKey,
      }),
    );

    expect([
      auCartA.request.sequence,
      auCartB.request.sequence,
      usCartA.request.sequence,
    ]).toEqual(["1", "2", "1"]);

    await expect(
      store.findByCreationKey({
        market: "au",
        cartId: "cart-a",
        creationKey: sharedKey,
      }),
    ).resolves.toEqual(auCartA.request);
    await expect(
      store.findByCreationKey({
        market: "au",
        cartId: "cart-b",
        creationKey: sharedKey,
      }),
    ).resolves.toEqual(auCartB.request);
    await expect(
      store.findByCreationKey({
        market: "us",
        cartId: "cart-a",
        creationKey: sharedKey,
      }),
    ).resolves.toEqual(usCartA.request);
    await expect(
      store.findByCreationKey({
        market: "sg",
        cartId: "cart-a",
        creationKey: sharedKey,
      }),
    ).resolves.toBeNull();

    expect(
      (await store.readFeed({ market: "au", position: "0", limit: 50 })).items.map(
        (request) => request.id,
      ),
    ).toEqual([auCartA.request.id, auCartB.request.id]);
    expect(
      (await store.readFeed({ market: "us", position: "0", limit: 50 })).items.map(
        (request) => request.id,
      ),
    ).toEqual([usCartA.request.id]);
  });

  it("does not consume a sequence when the request insert fails and rolls back", async () => {
    const first = await store.publish(publication({ cartId: "cart_au" }));
    expect(first.request.sequence).toBe("1");

    const duplicateId = makeRequest({ id: first.request.id });
    await expect(
      store.publish(
        publication({
          request: duplicateId,
          cartId: "cart_au",
          creationKey: "failed-creation",
        }),
      ),
    ).rejects.toThrow();

    await expect(
      store.findByCreationKey({
        market: "au",
        cartId: "cart_au",
        creationKey: "failed-creation",
      }),
    ).resolves.toBeNull();
    const afterFailure = await store.readFeed({
      market: "au",
      position: "0",
      limit: 50,
    });
    expect(afterFailure.highWatermark).toBe("1");
    expect(afterFailure.items.map((request) => request.sequence)).toEqual(["1"]);

    const next = await store.publish(publication({ cartId: "cart_au" }));
    expect(next.request.sequence).toBe("2");
    expect(
      (await store.readFeed({ market: "au", position: "0", limit: 50 }))
        .highWatermark,
    ).toBe("2");
  });

  it("pages by stable positions including a non-empty final page and an empty page", async () => {
    const published = [];
    for (let index = 0; index < 5; index += 1) {
      published.push(await store.publish(publication({ cartId: "cart_au" })));
    }

    const first = await store.readFeed({ market: "au", position: "0", limit: 2 });
    expect(first.items.map((request) => request.sequence)).toEqual(["1", "2"]);
    expect(first.highWatermark).toBe("5");
    expect(first.hasMore).toBe(true);
    expect(
      decodeFeedCursor(first.nextCursor, {
        market: "au",
        highWatermark: first.highWatermark,
      }),
    ).toBe(BigInt(2));

    const repeated = await store.readFeed({ market: "au", position: "0", limit: 2 });
    expect(repeated).toEqual(first);

    const second = await store.readFeed({ market: "au", position: "2", limit: 2 });
    expect(second.items.map((request) => request.sequence)).toEqual(["3", "4"]);
    expect(second.hasMore).toBe(true);
    expect(
      decodeFeedCursor(second.nextCursor, {
        market: "au",
        highWatermark: second.highWatermark,
      }),
    ).toBe(BigInt(4));

    const final = await store.readFeed({ market: "au", position: "4", limit: 2 });
    expect(final.items.map((request) => request.sequence)).toEqual(["5"]);
    expect(final.hasMore).toBe(false);
    expect(
      decodeFeedCursor(final.nextCursor, {
        market: "au",
        highWatermark: final.highWatermark,
      }),
    ).toBe(BigInt(5));

    const empty = await store.readFeed({ market: "au", position: "5", limit: 2 });
    expect(empty.items).toEqual([]);
    expect(empty.hasMore).toBe(false);
    expect(empty.highWatermark).toBe("5");
    expect(
      decodeFeedCursor(empty.nextCursor, {
        market: "au",
        highWatermark: empty.highWatermark,
      }),
    ).toBe(BigInt(5));

    expect(published.map((result) => result.request.sequence)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("rejects malformed, future, and out-of-range feed inputs without writing", async () => {
    await store.publish(publication({ cartId: "cart_au" }));

    for (const position of ["", "-1", "01", "1.5", "abc", "2"]) {
      await expect(
        store.readFeed({ market: "au", position, limit: 10 }),
      ).rejects.toMatchObject({
        code: "INVALID_CURSOR",
        details: { field: "cursor" },
      });
    }
    for (const limit of [0, -1, 201, 1.5]) {
      await expect(
        store.readFeed({ market: "au", position: "0", limit }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        details: { field: "limit" },
      });
    }

    await expect(
      store.readFeed({ market: "au", position: "0", limit: 200 }),
    ).resolves.toMatchObject({ highWatermark: "1" });
    expect(
      (await store.readFeed({ market: "au", position: "0", limit: 50 })).items,
    ).toHaveLength(1);
  });

  it("rejects positions beyond the PostgreSQL bigint range as INVALID_CURSOR without changing the feed", async () => {
    await store.publish(publication({ cartId: "cart_au" }));
    const before = await store.readFeed({ market: "au", position: "0", limit: 50 });

    for (const position of ["9223372036854775808", "9".repeat(100)]) {
      await expect(
        store.readFeed({ market: "au", position, limit: 10 }),
      ).rejects.toMatchObject({
        code: "INVALID_CURSOR",
        kind: "validation",
        details: { field: "cursor" },
      });
    }

    await expect(
      store.readFeed({ market: "au", position: "0", limit: 50 }),
    ).resolves.toEqual(before);
  });

  it("keeps the counter and page consistent while publications race", async () => {
    const writes = Array.from({ length: 6 }, (_, index) =>
      store.publish(publication({ cartId: `cart-${index}` })),
    );
    const reads = Array.from({ length: 6 }, async () => {
      const feed = await store.readFeed({ market: "au", position: "0", limit: 3 });
      const highWatermark = BigInt(feed.highWatermark);
      const cursor = decodeFeedCursor(feed.nextCursor, {
        market: "au",
        highWatermark: feed.highWatermark,
      });
      expect(cursor <= highWatermark).toBe(true);
      for (const item of feed.items) {
        expect(BigInt(item.sequence) <= highWatermark).toBe(true);
      }
      if (feed.hasMore) {
        expect(feed.items).toHaveLength(3);
        expect(BigInt(feed.items.at(-1)!.sequence) < highWatermark).toBe(true);
      }
      return feed;
    });

    await Promise.all([...writes, ...reads]);

    const final = await store.readFeed({ market: "au", position: "0", limit: 200 });
    expect(final.items.map((request) => request.sequence)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(final.highWatermark).toBe("6");
    expect(final.hasMore).toBe(false);
  });

  it("survives closing and reopening the file-backed database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "e-pig-after-sales-"));
    try {
      await db.close();
      db = new PGlite(directory);
      await db.exec(await migration());
      store = createAfterSalesRequestStore(leasePool(db));

      const published = await store.publish(
        publication({ cartId: "cart_au", creationKey: "persisted-creation" }),
      );

      await db.close();
      db = new PGlite(directory);
      await db.exec(await migration());
      store = createAfterSalesRequestStore(leasePool(db));

      await expect(
        store.findByCreationKey({
          market: "au",
          cartId: "cart_au",
          creationKey: "persisted-creation",
        }),
      ).resolves.toEqual(published.request);
      expect(
        (await store.readFeed({ market: "au", position: "0", limit: 50 }))
          .items,
      ).toEqual([published.request]);

      const second = await store.publish(publication({ cartId: "cart_au" }));
      expect(second.request.sequence).toBe("2");
    } finally {
      await db.close();
      db = new PGlite();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
