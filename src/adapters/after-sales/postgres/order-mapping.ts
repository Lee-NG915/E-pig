import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  createAfterSalesError,
  type AfterSalesOrder,
  type AfterSalesOrderItem,
  type AfterSalesRecipient,
} from "@/core/contracts/after-sales";
import type { Market } from "@/platform/config/markets";

/** Read-only `commerce_orders` row. Relational columns are authoritative for ownership. */
export type StoredOrderRow = {
  id: string;
  checkout_id: string;
  cart_id: string;
  market: string;
  data: unknown;
};

export type MappedStoredOrder = {
  order: AfterSalesOrder;
  version: string;
};

const countryCodes = new Set(["AU", "SG", "US"]);
const CENT_TOLERANCE = 1e-6;

function invalidSnapshot(): never {
  throw createAfterSalesError({
    code: "UPSTREAM_UNAVAILABLE",
    requestId: `req_order_${randomUUID()}`,
    retryable: false,
    recoveryAction: "LOOKUP_FIRST",
  });
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidSnapshot();
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return invalidSnapshot();
  return value;
}

function quantity(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) return invalidSnapshot();
  return value as number;
}

function minor(value: unknown, currency: string): number {
  const money = record(value);
  if (
    typeof money.amount !== "number"
    || !Number.isFinite(money.amount)
    || money.amount < 0
    || money.currency !== currency
  ) {
    return invalidSnapshot();
  }
  const scaled = money.amount * 100;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > CENT_TOLERANCE) {
    return invalidSnapshot();
  }
  return rounded;
}

function utc(value: unknown): string {
  if (typeof value !== "string") return invalidSnapshot();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return invalidSnapshot();
  return new Date(parsed).toISOString();
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source).sort().map((key) => [key, canonical(source[key])]),
    );
  }
  return value;
}

/**
 * Server-derived version over the complete stored order snapshot, including the
 * relational columns. Client-supplied version values are never used.
 */
export function storedOrderVersion(row: StoredOrderRow): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical({
      id: row.id,
      checkout_id: row.checkout_id,
      cart_id: row.cart_id,
      market: row.market,
      data: row.data,
    })))
    .digest("hex");
}

/**
 * Map the paid order snapshot without consulting the current catalog. Any
 * missing or inconsistent snapshot field fails closed as UPSTREAM_UNAVAILABLE so
 * historical orders are never rewritten with present-day catalog data.
 */
export function mapStoredOrder(row: StoredOrderRow, market: Market): MappedStoredOrder {
  if (row.market !== market.id) return invalidSnapshot();
  const data = record(row.data);
  if (data.status !== "paid") return invalidSnapshot();

  const currency = market.currency;
  if (!Array.isArray(data.lines) || data.lines.length === 0) return invalidSnapshot();
  const items: AfterSalesOrderItem[] = data.lines.map((rawLine) => {
    const line = record(rawLine);
    const itemQuantity = quantity(line.quantity);
    const unitPriceMinor = minor(line.unitPrice, currency);
    const lineTotalMinor = minor(line.lineTotal, currency);
    if (!Number.isSafeInteger(unitPriceMinor * itemQuantity)) return invalidSnapshot();
    if (lineTotalMinor !== unitPriceMinor * itemQuantity) return invalidSnapshot();
    return {
      id: text(line.id),
      productId: text(line.productId),
      variantId: text(line.variantId),
      sku: text(line.sku),
      name: text(line.name),
      quantity: itemQuantity,
      unitPriceMinor,
      lineTotalMinor,
    };
  });

  const linesSubtotalMinor = items.reduce(
    (sum, item) => sum + item.lineTotalMinor,
    0,
  );
  if (!Number.isSafeInteger(linesSubtotalMinor)) return invalidSnapshot();
  if (data.subtotal !== undefined && minor(data.subtotal, currency) !== linesSubtotalMinor) {
    return invalidSnapshot();
  }
  const subtotalMinor = linesSubtotalMinor;
  const discountMinor = data.discount === undefined ? 0 : minor(data.discount, currency);
  const totalMinor = minor(data.total, currency);
  // Current sandbox orders carry no shipping or tax: total = subtotal - discount.
  if (subtotalMinor - discountMinor !== totalMinor) return invalidSnapshot();

  const contact = record(data.contact);
  const address = record(data.address);
  const recipientName = text(contact.name);
  const countryCode = text(address.country);
  if (!countryCodes.has(countryCode)) return invalidSnapshot();
  const region = typeof address.state === "string" && address.state.trim().length > 0
    ? address.state
    : text(address.city);
  const postalCode = text(address.postalCode);
  const version = storedOrderVersion(row);

  return {
    version,
    order: {
      id: row.id,
      ownerCartId: row.cart_id,
      market: market.id,
      currency,
      items,
      subtotalMinor,
      shippingMinor: 0,
      taxMinor: 0,
      discountMinor,
      totalMinor,
      status: "paid",
      createdAt: utc(data.createdAt),
      orderVersion: version,
      recipient: {
        name: recipientName,
        countryCode: countryCode as AfterSalesRecipient["countryCode"],
        region,
        postalCode,
      },
    },
  };
}
