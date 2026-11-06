import { describe, expect, it } from "vitest";

import { decodeFeedCursor, encodeFeedCursor } from "./cursor";

describe("after-sales feed cursor", () => {
  it("round-trips a stable market-bound position", () => {
    const cursor = encodeFeedCursor({ market: "au", position: "42" });

    expect(encodeFeedCursor({ market: "au", position: "42" })).toBe(cursor);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFeedCursor(cursor, { market: "au", highWatermark: "42" })).toBe(BigInt(42));
  });

  it("rejects corrupted, cross-market, and future cursors", () => {
    const cursor = encodeFeedCursor({ market: "au", position: "42" });
    expect(() => decodeFeedCursor(`${cursor}x`, { market: "au", highWatermark: "42" })).toThrowError(
      expect.objectContaining({ code: "INVALID_CURSOR" }),
    );
    expect(() => decodeFeedCursor(cursor, { market: "us", highWatermark: "42" })).toThrowError(
      expect.objectContaining({ code: "INVALID_CURSOR" }),
    );
    expect(() => decodeFeedCursor(cursor, { market: "au", highWatermark: "41" })).toThrowError(
      expect.objectContaining({ code: "INVALID_CURSOR" }),
    );
  });
});
