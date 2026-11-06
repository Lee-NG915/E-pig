import { createHash } from "node:crypto";

import type { MarketId } from "@/platform/config/markets";

import { createAfterSalesError } from "./errors";

const checksum = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);

function parsePosition(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("invalid position");
  return BigInt(value);
}

function invalidCursor(requestId = "cursor_invalid"): never {
  throw createAfterSalesError({
    code: "INVALID_CURSOR",
    requestId,
    details: { field: "cursor" },
  });
}

export function encodeFeedCursor({
  market,
  position,
}: {
  market: MarketId;
  position: string | bigint;
}): string {
  const normalized = typeof position === "bigint" ? position.toString() : position;
  parsePosition(normalized);
  const payload = `${market}:${normalized}`;
  return Buffer.from(`${payload}:${checksum(payload)}`, "utf8").toString("base64url");
}

export function decodeFeedCursor(
  cursor: string,
  { market, highWatermark }: { market: MarketId; highWatermark: string | bigint },
): bigint {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return invalidCursor();
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return invalidCursor();
    const [cursorMarket, position, suppliedChecksum] = parts;
    const payload = `${cursorMarket}:${position}`;
    if (cursorMarket !== market || checksum(payload) !== suppliedChecksum) {
      return invalidCursor();
    }
    const parsed = parsePosition(position);
    const high = parsePosition(
      typeof highWatermark === "bigint" ? highWatermark.toString() : highWatermark,
    );
    if (parsed > high) return invalidCursor();
    return parsed;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    return invalidCursor();
  }
}
