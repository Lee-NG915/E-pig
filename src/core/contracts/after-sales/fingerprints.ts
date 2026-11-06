import { createHash } from "node:crypto";

import type { MarketId } from "@/platform/config/markets";

import type {
  CreateAfterSalesRequestInput,
  CreateServiceTicketInput,
} from "./after-sales";

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createAfterSalesRequestFingerprint(
  input: CreateAfterSalesRequestInput,
): string {
  return sha256({
    orderId: input.orderId,
    type: input.type,
    description: input.description,
    attachmentIds: [...(input.attachmentIds ?? [])].sort(),
  });
}

export function createServiceTicketFingerprint(input: CreateServiceTicketInput): string {
  return sha256({
    requestId: input.requestId,
    action: input.action,
    reply: input.reply,
    draftVersion: input.draftVersion,
    approvalId: input.approvalId,
    policyVersion: input.policyVersion,
    orderVersion: input.orderVersion,
  });
}

export function createIdempotencyScope({
  market,
  actorId,
  operation,
  key,
}: {
  market: MarketId;
  actorId: string;
  operation: "createAfterSalesRequest" | "createServiceTicket";
  key: string;
}): string {
  return sha256({ version: 1, market, actorId, operation, key });
}
