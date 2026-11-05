import type { MarketId } from "@/platform/config/markets";

export type AfterSalesRequestType = "damaged" | "wrong_item" | "return" | "other";
export type AfterSalesRequestStatus = "pending" | "ticket_created";
export type AfterSalesTicketAction = "reship" | "return" | "refund" | "reject" | "other";
export type AfterSalesTicketStatus = "open" | "processing" | "closed";
export type AfterSalesAttachmentStatus = "active" | "expired";
export type AfterSalesMediaType = "image/jpeg" | "image/png" | "image/webp";
export type AfterSalesOrderStatus = "paid" | "fulfilling" | "fulfilled" | "cancelled";
export type AfterSalesShipmentStatus = "pending" | "in_transit" | "delivered" | "exception";

export type ConsumerPrincipal = {
  kind: "consumer";
  market: MarketId;
  /** Stable ownership subject derived from a verified signed cart cookie. */
  cartId: string;
};

export type ServicePrincipal = {
  kind: "service";
  market: MarketId;
  /** Stable authenticated DTC actor identity used only for idempotency scope. */
  actorId: string;
  allowedMarkets: readonly MarketId[];
};

export type AfterSalesPrincipal = ConsumerPrincipal | ServicePrincipal;

export type AfterSalesProgress = {
  status: AfterSalesRequestStatus;
  message: string;
  occurredAt: string;
};

export type AfterSalesAttachment = {
  id: string;
  fileName: string;
  mediaType: AfterSalesMediaType;
  sizeBytes: number;
  status: AfterSalesAttachmentStatus;
  createdAt: string;
  expiresAt: string;
};

export type AfterSalesAttachmentContent = {
  fileName: string;
  mediaType: AfterSalesMediaType;
  sizeBytes: number;
  bytes: Uint8Array;
};

export type AfterSalesRequest = {
  id: string;
  /** Internal publication position; exposed only in the service view. */
  sequence: string;
  orderId: string;
  market: MarketId;
  type: AfterSalesRequestType;
  description: string;
  attachments: AfterSalesAttachment[];
  status: AfterSalesRequestStatus;
  progress: AfterSalesProgress[];
  ticketId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AfterSalesTicketReceipt = {
  id: string;
  ticketId: string;
  requestId: string;
  action: AfterSalesTicketAction;
  requestStatus: "ticket_created";
  createdAt: string;
};

export type AfterSalesTicket = {
  id: string;
  requestId: string;
  orderId: string;
  market: MarketId;
  action: AfterSalesTicketAction;
  /** The single immutable final consumer reply. */
  reply: string;
  status: AfterSalesTicketStatus;
  draftVersion: string;
  approvalId: string;
  policyVersion: string;
  orderVersion: string;
  receipt: AfterSalesTicketReceipt;
  createdAt: string;
  updatedAt: string;
};

export type AfterSalesOrderItem = {
  id: string;
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type AfterSalesRecipient = {
  name: string;
  countryCode: "AU" | "SG" | "US";
  region: string;
  postalCode: string;
};

export type AfterSalesOrder = {
  id: string;
  /** Internal ownership and market scope; never serialized. */
  ownerCartId: string;
  market: MarketId;
  currency: string;
  items: AfterSalesOrderItem[];
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  status: AfterSalesOrderStatus;
  createdAt: string;
  orderVersion: string;
  recipient: AfterSalesRecipient;
};

export type AfterSalesShipmentEvent = {
  id: string;
  status: AfterSalesShipmentStatus;
  description: string;
  occurredAt: string;
  locationSummary?: string;
};

export type AfterSalesShipment = {
  id: string;
  orderId: string;
  status: AfterSalesShipmentStatus;
  carrier: string;
  events: AfterSalesShipmentEvent[];
};

export type CreateAfterSalesRequestInput = {
  orderId: string;
  type: AfterSalesRequestType;
  description: string;
  attachmentIds?: string[];
};

export type UploadAttachmentInput = {
  orderId: string;
  fileName: string;
  mediaType: AfterSalesMediaType;
  bytes: Uint8Array;
};

export type CreateServiceTicketInput = {
  requestId: string;
  action: AfterSalesTicketAction;
  reply: string;
  draftVersion: string;
  approvalId: string;
  policyVersion: string;
  orderVersion: string;
};

export type IdempotencyOptions = {
  idempotencyKey: string;
};

export type CreateRequestResult = {
  request: AfterSalesRequest;
  replayed: boolean;
};

export type CreateTicketResult = {
  ticket: AfterSalesTicket;
  replayed: boolean;
};

export type ServiceRequestFeed = {
  items: AfterSalesRequest[];
  highWatermark: string;
  nextCursor: string;
  hasMore: boolean;
};

export type TicketCreationLookup =
  | { kind: "ticket"; ticket: AfterSalesTicket }
  | { kind: "in_flight"; retryAfterMs: number }
  | { kind: "currently_unavailable"; retryAfterMs: number };

/**
 * Domain-only after-sales boundary. HTTP headers, credentials, transport
 * status codes, and request-body validation remain outside this port.
 */
export interface AfterSalesPort {
  createRequest(
    principal: ConsumerPrincipal,
    input: CreateAfterSalesRequestInput,
    options: IdempotencyOptions,
  ): Promise<CreateRequestResult>;
  getRequest(principal: ConsumerPrincipal, requestId: string): Promise<AfterSalesRequest>;
  getConsumerTicket(principal: ConsumerPrincipal, ticketId: string): Promise<AfterSalesTicket>;
  uploadAttachment(
    principal: ConsumerPrincipal,
    input: UploadAttachmentInput,
  ): Promise<AfterSalesAttachment>;
  /** Shared authorized content read for both consumer and service attachment routes. */
  getAttachmentContent(
    principal: AfterSalesPrincipal,
    attachmentId: string,
  ): Promise<AfterSalesAttachmentContent>;
  getServiceOrder(principal: ServicePrincipal, orderId: string): Promise<AfterSalesOrder>;
  getServiceOrderShipment(
    principal: ServicePrincipal,
    orderId: string,
  ): Promise<AfterSalesShipment>;
  listServiceRequests(
    principal: ServicePrincipal,
    input?: { cursor?: string; limit?: number },
  ): Promise<ServiceRequestFeed>;
  getServiceRequest(
    principal: ServicePrincipal,
    requestId: string,
  ): Promise<AfterSalesRequest>;
  createTicket(
    principal: ServicePrincipal,
    input: CreateServiceTicketInput,
    options: IdempotencyOptions,
  ): Promise<CreateTicketResult>;
  getServiceTicket(principal: ServicePrincipal, ticketId: string): Promise<AfterSalesTicket>;
  findTicketByIdempotencyKey(
    principal: ServicePrincipal,
    idempotencyKey: string,
  ): Promise<TicketCreationLookup>;
}
