import "server-only";

import {
  createAfterSalesError,
  type AfterSalesPort,
} from "@/core/contracts/after-sales";

function unavailable(): never {
  throw createAfterSalesError({
    code: "UPSTREAM_UNAVAILABLE",
    requestId: `req_unavailable_${crypto.randomUUID()}`,
  });
}

/**
 * Explicit fail-closed after-sales capability. It is used when postgres is
 * selected but its prerequisites are missing; it must never silently fall back
 * to the in-memory mock.
 */
export function createUnavailableAfterSalesAdapter(): AfterSalesPort {
  return {
    async createRequest() {
      return unavailable();
    },
    async getRequest() {
      return unavailable();
    },
    async getConsumerTicket() {
      return unavailable();
    },
    async uploadAttachment() {
      return unavailable();
    },
    async getAttachmentContent() {
      return unavailable();
    },
    async getServiceOrder() {
      return unavailable();
    },
    async getServiceOrderShipment() {
      return unavailable();
    },
    async listServiceRequests() {
      return unavailable();
    },
    async getServiceRequest() {
      return unavailable();
    },
    async createTicket() {
      return unavailable();
    },
    async getServiceTicket() {
      return unavailable();
    },
    async findTicketByIdempotencyKey() {
      return unavailable();
    },
  };
}
