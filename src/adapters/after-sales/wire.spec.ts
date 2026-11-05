import { describe, expect, it } from "vitest";

import type {
  AfterSalesAttachment,
  AfterSalesOrder,
  AfterSalesRequest,
  AfterSalesShipment,
  AfterSalesTicket,
} from "@/core/contracts/after-sales";

import consumerRequestCreated from "../../../contracts/epig-after-sales/v1/fixtures/responses/create_after_sales_request.created.json";
import consumerTicketOk from "../../../contracts/epig-after-sales/v1/fixtures/responses/get_consumer_ticket.ok.json";
import serviceOrderOk from "../../../contracts/epig-after-sales/v1/fixtures/responses/get_service_order.ok.json";
import serviceRequestOk from "../../../contracts/epig-after-sales/v1/fixtures/responses/get_service_request.ok.json";
import shipmentOk from "../../../contracts/epig-after-sales/v1/fixtures/responses/get_service_order_shipment.ok.json";
import serviceTicketOk from "../../../contracts/epig-after-sales/v1/fixtures/responses/get_service_ticket.ok.json";
import attachmentCreated from "../../../contracts/epig-after-sales/v1/fixtures/responses/upload_attachment.created.json";
import {
  toAttachment,
  toConsumerRequest,
  toConsumerTicket,
  toServiceOrder,
  toServiceRequest,
  toServiceShipment,
  toServiceTicket,
  type WireAttachment,
  type WireConsumerRequest,
  type WireServiceOrder,
  type WireServiceRequest,
  type WireServiceShipment,
  type WireServiceTicket,
} from "./wire";

function requestFromFixture(fixture: WireConsumerRequest): AfterSalesRequest {
  return {
    id: fixture.request_id,
    sequence: "42",
    orderId: fixture.order_id,
    market: fixture.market,
    type: fixture.type,
    description: fixture.description,
    attachments: fixture.attachments.map((attachment) => ({
      id: attachment.attachment_id,
      fileName: attachment.file_name,
      mediaType: attachment.media_type,
      sizeBytes: attachment.size_bytes,
      status: attachment.status,
      createdAt: attachment.created_at,
      expiresAt: attachment.expires_at,
    })),
    status: fixture.status,
    progress: fixture.progress.map((progress) => ({
      status: progress.status,
      message: progress.message,
      occurredAt: progress.occurred_at,
    })),
    ticketId: fixture.ticket_id,
    createdAt: fixture.created_at,
    updatedAt: fixture.updated_at,
  };
}

function ticketFromFixture(fixture: WireServiceTicket): AfterSalesTicket {
  return {
    id: fixture.ticket_id,
    requestId: fixture.request_id,
    orderId: fixture.order_id,
    market: fixture.market,
    action: fixture.action,
    reply: fixture.reply,
    status: fixture.status,
    draftVersion: fixture.draft_version,
    approvalId: fixture.approval_id,
    policyVersion: fixture.policy_version,
    orderVersion: fixture.order_version,
    receipt: {
      id: fixture.receipt.receipt_id,
      ticketId: fixture.receipt.ticket_id,
      requestId: fixture.receipt.request_id,
      action: fixture.receipt.action,
      requestStatus: fixture.receipt.request_status,
      createdAt: fixture.receipt.created_at,
    },
    createdAt: fixture.created_at,
    updatedAt: fixture.updated_at,
  };
}

describe("after-sales wire serializers", () => {
  it("matches the shared consumer request fixture with an explicit allowlist", () => {
    const request = requestFromFixture(
      consumerRequestCreated as WireConsumerRequest,
    ) as AfterSalesRequest & {
      approvalId: string;
      draftVersion: string;
      cartId: string;
    };
    request.approvalId = "approval_must_not_leak";
    request.draftVersion = "draft_must_not_leak";
    request.cartId = "cart_must_not_leak";
    request.attachments[0] = {
      ...request.attachments[0],
      storageUrl: "https://storage.invalid/private",
      bytes: new Uint8Array([1, 2, 3]),
    } as AfterSalesAttachment & { storageUrl: string; bytes: Uint8Array };

    const wire = toConsumerRequest(request);
    expect(wire).toEqual(consumerRequestCreated);
    expect(JSON.stringify(wire)).not.toMatch(
      /"(?:approvalId|draftVersion|cartId|storageUrl|bytes)"/,
    );
  });

  it("matches the shared service request fixture and keeps sequence out of the consumer view", () => {
    const fixture = serviceRequestOk as WireServiceRequest;
    const request: AfterSalesRequest = {
      id: fixture.request_id,
      sequence: fixture.sequence,
      orderId: fixture.order_id,
      market: fixture.market,
      type: fixture.type,
      description: fixture.description,
      attachments: fixture.attachments.map((attachment) => ({
        id: attachment.attachment_id,
        fileName: attachment.file_name,
        mediaType: attachment.media_type,
        sizeBytes: attachment.size_bytes,
        status: attachment.status,
        createdAt: attachment.created_at,
        expiresAt: attachment.expires_at,
      })),
      status: fixture.status,
      progress: [],
      ticketId: fixture.ticket_id,
      createdAt: fixture.created_at,
      updatedAt: fixture.updated_at,
    };

    expect(toServiceRequest(request)).toEqual(serviceRequestOk);
    expect(toConsumerRequest(request)).not.toHaveProperty("sequence");
  });

  it("matches consumer and service ticket fixtures while removing audit fields only from the consumer view", () => {
    const ticket = ticketFromFixture(serviceTicketOk as WireServiceTicket);
    ticket.receipt = {
      ...ticket.receipt,
      approvalId: "receipt_approval_must_not_leak",
    } as AfterSalesTicket["receipt"] & { approvalId: string };

    expect(toServiceTicket(ticket)).toEqual(serviceTicketOk);
    expect(toConsumerTicket(ticket)).toEqual(consumerTicketOk);
    expect(JSON.stringify(toConsumerTicket(ticket))).not.toMatch(
      /approvalId|draftVersion|policyVersion|orderVersion/,
    );
  });

  it("matches service order and shipment fixtures without leaking address or private item fields", () => {
    const orderFixture = serviceOrderOk as WireServiceOrder;
    const shipmentFixture = shipmentOk as WireServiceShipment;
    const order: AfterSalesOrder = {
      id: orderFixture.order_id,
      ownerCartId: "cart_must_not_leak",
      market: orderFixture.market,
      currency: orderFixture.currency,
      items: orderFixture.items.map((item) => ({
        id: item.order_item_id,
        productId: "product_must_not_leak",
        variantId: "variant_must_not_leak",
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        unitPriceMinor: item.unit_price_minor,
        lineTotalMinor: item.line_total_minor,
      })),
      subtotalMinor: orderFixture.subtotal_minor,
      shippingMinor: orderFixture.shipping_minor,
      taxMinor: orderFixture.tax_minor,
      discountMinor: orderFixture.discount_minor,
      totalMinor: orderFixture.total_minor,
      status: orderFixture.status,
      createdAt: orderFixture.created_at,
      orderVersion: orderFixture.order_version,
      recipient: {
        name: "Ada Buyer",
        countryCode: "AU",
        region: "NSW",
        postalCode: "2000",
        fullAddress: "FULL_ADDRESS_MUST_NOT_LEAK",
      } as AfterSalesOrder["recipient"] & { fullAddress: string },
    };
    (order as AfterSalesOrder & { fullAddress: string }).fullAddress =
      "TOP_LEVEL_ADDRESS_MUST_NOT_LEAK";

    const shipment: AfterSalesShipment = {
      id: shipmentFixture.shipment_id,
      orderId: shipmentFixture.order_id,
      status: shipmentFixture.status,
      carrier: shipmentFixture.carrier,
      events: shipmentFixture.events.map((event) => ({
        id: event.event_id,
        status: event.status,
        description: event.description,
        occurredAt: event.occurred_at,
        locationSummary: event.location_summary,
        storageUrl: "storage_must_not_leak",
      })) as AfterSalesShipment["events"],
    };

    expect(toServiceOrder(order)).toEqual(serviceOrderOk);
    expect(toServiceShipment(shipment)).toEqual(shipmentOk);
    const serialized = JSON.stringify([toServiceOrder(order), toServiceShipment(shipment)]);
    expect(serialized).not.toMatch(/FULL_ADDRESS|fullAddress|ownerCartId|productId|variantId|storageUrl/);
  });

  it("matches the shared attachment fixture and strips storage or byte fields", () => {
    const fixture = attachmentCreated as WireAttachment;
    const attachment: AfterSalesAttachment = {
      id: fixture.attachment_id,
      fileName: fixture.file_name,
      mediaType: fixture.media_type,
      sizeBytes: fixture.size_bytes,
      status: fixture.status,
      createdAt: fixture.created_at,
      expiresAt: fixture.expires_at,
      storageUrl: "storage_must_not_leak",
      bytes: new Uint8Array([1, 2, 3]),
    } as AfterSalesAttachment & { storageUrl: string; bytes: Uint8Array };

    expect(toAttachment(attachment)).toEqual(attachmentCreated);
    expect(JSON.stringify(toAttachment(attachment))).not.toMatch(
      /"(?:storageUrl|bytes)"/,
    );
  });
});
