import { describe, expect, it } from "vitest";

import {
  createAfterSalesRequestFingerprint,
  createServiceTicketFingerprint,
  createIdempotencyScope,
} from "./fingerprints";
import type {
  CreateAfterSalesRequestInput,
  CreateServiceTicketInput,
} from "./after-sales";

const requestInput: CreateAfterSalesRequestInput = {
  orderId: "ord_mock_au",
  type: "damaged",
  description: "Synthetic issue.",
  attachmentIds: ["att_b", "att_a"],
};

const ticketInput: CreateServiceTicketInput = {
  requestId: "asr_mock",
  action: "reship",
  reply: "Synthetic final reply.",
  draftVersion: "draft_1",
  approvalId: "approval_1",
  policyVersion: "policy_1",
  orderVersion: "order_v1",
};

describe("after-sales fingerprints", () => {
  it("treats missing and empty attachment arrays alike and sorts attachment IDs", () => {
    const omitted = createAfterSalesRequestFingerprint({
      orderId: requestInput.orderId,
      type: requestInput.type,
      description: requestInput.description,
    });
    const empty = createAfterSalesRequestFingerprint({
      ...requestInput,
      attachmentIds: [],
    });
    const reordered = createAfterSalesRequestFingerprint({
      ...requestInput,
      attachmentIds: ["att_a", "att_b"],
    });

    expect(empty).toBe(omitted);
    expect(reordered).toBe(createAfterSalesRequestFingerprint(requestInput));
  });

  it("changes when an OpenAPI request field changes", () => {
    const baseline = createAfterSalesRequestFingerprint(requestInput);
    expect(createAfterSalesRequestFingerprint({ ...requestInput, orderId: "ord_other" })).not.toBe(baseline);
    expect(createAfterSalesRequestFingerprint({ ...requestInput, type: "return" })).not.toBe(baseline);
    expect(createAfterSalesRequestFingerprint({ ...requestInput, description: "Synthetic issue changed." })).not.toBe(baseline);
    expect(createAfterSalesRequestFingerprint({ ...requestInput, attachmentIds: ["att_a"] })).not.toBe(baseline);
  });

  it.each<keyof CreateServiceTicketInput>([
    "requestId",
    "action",
    "reply",
    "draftVersion",
    "approvalId",
    "policyVersion",
    "orderVersion",
  ])("includes ticket field %s", (field) => {
    const baseline = createServiceTicketFingerprint(ticketInput);
    const changed = { ...ticketInput, [field]: `${ticketInput[field]}_changed` };
    expect(createServiceTicketFingerprint(changed)).not.toBe(baseline);
  });

  it("scopes idempotency by market, authenticated actor, and operation", () => {
    const baseline = createIdempotencyScope({
      market: "au",
      actorId: "cart_1",
      operation: "createAfterSalesRequest",
      key: "same-key",
    });
    expect(createIdempotencyScope({
      market: "us",
      actorId: "cart_1",
      operation: "createAfterSalesRequest",
      key: "same-key",
    })).not.toBe(baseline);
    expect(createIdempotencyScope({
      market: "au",
      actorId: "cart_2",
      operation: "createAfterSalesRequest",
      key: "same-key",
    })).not.toBe(baseline);
    expect(createIdempotencyScope({
      market: "au",
      actorId: "cart_1",
      operation: "createServiceTicket",
      key: "same-key",
    })).not.toBe(baseline);
  });
});
