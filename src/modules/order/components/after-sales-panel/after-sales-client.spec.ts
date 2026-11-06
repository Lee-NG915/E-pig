import { afterEach, expect, it, vi } from "vitest";

import {
  AFTER_SALES_CONTRACT_VERSION,
  AfterSalesClientError,
  createAfterSalesRequest,
  getAfterSalesRequest,
  getAttachmentContent,
  getConsumerTicket,
  uploadAttachment,
} from "./after-sales-client";
import {
  answeredRequestFixture,
  pendingRequestFixture,
  ticketFixture,
} from "./after-sales-panel.mock";
import replayedContractFixture from "../../../../../contracts/epig-after-sales/v1/fixtures/responses/create_after_sales_request.replayed.json";
import consumerTicketContractFixture from "../../../../../contracts/epig-after-sales/v1/fixtures/responses/get_consumer_ticket.ok.json";

const body = {
  order_id: pendingRequestFixture.order_id,
  type: pendingRequestFixture.type,
  description: pendingRequestFixture.description,
  attachment_ids: ["att_demo_1"],
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-After-Sales-Contract-Version": AFTER_SALES_CONTRACT_VERSION,
      ...headers,
    },
  });
}

function binary(bytes: Uint8Array, headers: Record<string, string> = {}) {
  return new Response(Uint8Array.from(bytes).buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "X-After-Sales-Contract-Version": AFTER_SALES_CONTRACT_VERSION,
      ...headers,
    },
  });
}

function capture(handler: (url: URL, init?: RequestInit) => Response) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      "https://e-pig.test",
    );
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  });
  vi.stubGlobal("fetch", mock);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("creates a request with same-origin, no-store, major 1 and an idempotency key", async () => {
  const calls = capture(() =>
    json(pendingRequestFixture, 200, { "Idempotency-Replayed": "true" }),
  );
  const result = await createAfterSalesRequest(
    "au",
    body,
    "11111111-1111-4111-8111-111111111111",
  );
  expect(result.replayed).toBe(true);
  expect(result.request.request_id).toBe("req_demo_1");
  const [call] = calls;
  expect(call?.url.pathname).toBe("/api/au/after-sales/requests");
  expect(call?.init?.method).toBe("POST");
  expect(call?.init?.credentials).toBe("same-origin");
  expect(call?.init?.cache).toBe("no-store");
  const headers = new Headers(call?.init?.headers);
  expect(headers.get("X-After-Sales-Contract-Version")).toBe(
    AFTER_SALES_CONTRACT_VERSION,
  );
  expect(headers.get("Idempotency-Key")).toBe(
    "11111111-1111-4111-8111-111111111111",
  );
  expect(headers.get("Content-Type")).toBe("application/json");
  expect(headers.get("Authorization")).toBeNull();
  expect(call?.init?.body).toBe(JSON.stringify(body));
});

it("uploads one multipart attachment through the consumer route", async () => {
  const calls = capture(() => json(pendingRequestFixture.attachments[0], 201));
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", {
    type: "image/png",
  });
  const attachment = await uploadAttachment("au", "order_demo_1", file);
  expect(attachment.attachment_id).toBe("att_demo_1");
  const [call] = calls;
  expect(call?.url.pathname).toBe("/api/au/after-sales/attachments");
  expect(call?.init?.method).toBe("POST");
  expect(call?.init?.body).toBeInstanceOf(FormData);
  const headers = new Headers(call?.init?.headers);
  expect(headers.get("X-After-Sales-Contract-Version")).toBe("1");
  expect(headers.get("Authorization")).toBeNull();
  expect(headers.get("Content-Type")).toBeNull();
});

it("reads request, ticket and authorized attachment content by ID", async () => {
  const calls = capture((url) => {
    if (url.pathname.includes("/tickets/")) return json(ticketFixture);
    if (url.pathname.includes("/content")) {
      return binary(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    }
    return json(answeredRequestFixture);
  });
  const request = await getAfterSalesRequest("au", "req_demo_1");
  expect(request.ticket_id).toBe("tkt_demo_1");
  const ticket = await getConsumerTicket("au", "tkt_demo_1");
  expect(ticket.reply).toContain("replacement arm");
  const content = await getAttachmentContent("au", "att_demo_1");
  expect(content.mediaType).toBe("image/png");
  expect(content.blob.size).toBeGreaterThan(0);

  expect(calls.map((call) => call.url.pathname)).toEqual([
    "/api/au/after-sales/requests/req_demo_1",
    "/api/au/after-sales/tickets/tkt_demo_1",
    "/api/au/after-sales/attachments/att_demo_1/content",
  ]);
  for (const call of calls) {
    expect(call.init?.method).toBe("GET");
    expect(call.init?.credentials).toBe("same-origin");
    expect(call.init?.cache).toBe("no-store");
    const headers = new Headers(call.init?.headers);
    expect(headers.get("X-After-Sales-Contract-Version")).toBe("1");
    expect(headers.get("Authorization")).toBeNull();
  }
});

it("maps a safe wire error and refuses a request from another market", async () => {
  capture(() =>
    json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required.",
          request_id: "req_error",
          retryable: false,
          recovery_action: "NONE",
        },
      },
      401,
    ),
  );
  await expect(getAfterSalesRequest("au", "req_demo_1")).rejects.toMatchObject({
    status: 401,
    code: "UNAUTHORIZED",
    requestId: "req_error",
  });

  capture(() => json({ ...pendingRequestFixture, market: "sg" }));
  await expect(getAfterSalesRequest("au", "req_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );
});

it("fails closed on unreadable or mismatched responses", async () => {
  capture(() => json({ request_id: "req_demo_1" }));
  await expect(getAfterSalesRequest("au", "req_demo_1")).rejects.toMatchObject({
    message: expect.stringContaining("could not be read safely"),
  });

  capture(() => json({ ...answeredRequestFixture, request_id: "req_other" }));
  await expect(getAfterSalesRequest("au", "req_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );

  capture(() => json({ ...ticketFixture, ticket_id: "tkt_other" }));
  await expect(getConsumerTicket("au", "tkt_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );

  capture(() => json({ ...answeredRequestFixture, ticket_id: null }));
  await expect(getAfterSalesRequest("au", "req_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );

  capture(() =>
    json({
      ...ticketFixture,
      receipt: { ...ticketFixture.receipt, ticket_id: "tkt_other" },
    }),
  );
  await expect(getConsumerTicket("au", "tkt_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );
});

it("accepts a matching 201 create and rejects inconsistent replay status headers", async () => {
  capture(() => json(pendingRequestFixture, 201));
  const created = await createAfterSalesRequest(
    "au",
    body,
    "11111111-1111-4111-8111-111111111111",
  );
  expect(created.replayed).toBe(false);

  capture(() => json(pendingRequestFixture, 200));
  await expect(
    createAfterSalesRequest("au", body, "key"),
  ).rejects.toBeInstanceOf(AfterSalesClientError);

  capture(() =>
    json(pendingRequestFixture, 201, { "Idempotency-Replayed": "true" }),
  );
  await expect(
    createAfterSalesRequest("au", body, "key"),
  ).rejects.toBeInstanceOf(AfterSalesClientError);

  capture(() => json(pendingRequestFixture, 202));
  await expect(
    createAfterSalesRequest("au", body, "key"),
  ).rejects.toBeInstanceOf(AfterSalesClientError);
});

it.each([
  ["order", { order_id: "order_other" }],
  ["market", { market: "sg" }],
  ["type", { type: "return" }],
  ["description", { description: "A different description." }],
  [
    "attachments",
    {
      attachments: [
        {
          ...pendingRequestFixture.attachments[0],
          attachment_id: "att_other",
        },
      ],
    },
  ],
])(
  "refuses a valid-shaped success whose %s does not match the submitted application",
  async (_label, override) => {
    capture(() => json({ ...pendingRequestFixture, ...override }, 201));
    await expect(
      createAfterSalesRequest(
        "au",
        body,
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toBeInstanceOf(AfterSalesClientError);
  },
);

it("treats a missing attachment list as empty when matching a submitted body", async () => {
  capture(() =>
    json({ ...pendingRequestFixture, attachments: [] }, 201),
  );
  const emptyBody = { ...body, attachment_ids: [] };
  await expect(
    createAfterSalesRequest("au", emptyBody, "key"),
  ).resolves.toMatchObject({ request: { request_id: "req_demo_1" } });
});

it("requires the advertised contract major on successful responses", async () => {
  capture(
    () =>
      new Response(JSON.stringify(pendingRequestFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  await expect(getAfterSalesRequest("au", "req_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );

  capture(
    () =>
      new Response(JSON.stringify(pendingRequestFixture), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-After-Sales-Contract-Version": "2",
        },
      }),
  );
  await expect(getAfterSalesRequest("au", "req_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );
});

it("enforces the documented response status for attachment and read endpoints", async () => {
  capture(() => json(pendingRequestFixture.attachments[0], 200));
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", {
    type: "image/png",
  });
  await expect(uploadAttachment("au", "order_demo_1", file)).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );

  capture(() => json(pendingRequestFixture, 201));
  await expect(getAfterSalesRequest("au", "req_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );

  capture(() => binary(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {}) );
  await expect(getAttachmentContent("au", "att_demo_1")).resolves.toMatchObject({
    mediaType: "image/png",
  });
});

it("rejects blank description, blank reply and receipt action mismatches", async () => {
  capture(() => json({ ...pendingRequestFixture, description: "   " }));
  await expect(getAfterSalesRequest("au", "req_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );

  capture(() => json({ ...ticketFixture, reply: " \n\t " }));
  await expect(getConsumerTicket("au", "tkt_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );

  capture(() =>
    json({
      ...ticketFixture,
      receipt: { ...ticketFixture.receipt, action: "refund" },
    }),
  );
  await expect(getConsumerTicket("au", "tkt_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );

  const withoutAction = {
    ...ticketFixture,
    receipt: { ...ticketFixture.receipt } as Record<string, unknown>,
  };
  delete withoutAction.receipt.action;
  capture(() => json(withoutAction));
  await expect(getConsumerTicket("au", "tkt_demo_1")).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );
});

it("counts attachment filename length in Unicode code points, not UTF-16 units", async () => {
  capture(() =>
    json(
      {
        ...pendingRequestFixture.attachments[0],
        file_name: "😀".repeat(255),
      },
      201,
    ),
  );
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", {
    type: "image/png",
  });
  await expect(uploadAttachment("au", "order_demo_1", file)).resolves.toMatchObject(
    { file_name: "😀".repeat(255) },
  );

  capture(() =>
    json(
      {
        ...pendingRequestFixture.attachments[0],
        file_name: "😀".repeat(256),
      },
      201,
    ),
  );
  await expect(uploadAttachment("au", "order_demo_1", file)).rejects.toBeInstanceOf(
    AfterSalesClientError,
  );
});

it("parses the shared source contract fixtures without altering their positive examples", async () => {
  const replayBody = {
    order_id: replayedContractFixture.order_id,
    type: replayedContractFixture.type as "damaged",
    description: replayedContractFixture.description,
    attachment_ids: replayedContractFixture.attachments.map(
      (attachment) => attachment.attachment_id,
    ),
  };
  capture(() =>
    json(replayedContractFixture, 200, { "Idempotency-Replayed": "true" }),
  );
  const replay = await createAfterSalesRequest("au", replayBody, "source-key");
  expect(replay.replayed).toBe(true);
  expect(replay.request.request_id).toBe(replayedContractFixture.request_id);

  capture(() => json(consumerTicketContractFixture));
  const ticket = await getConsumerTicket(
    "au",
    consumerTicketContractFixture.ticket_id,
  );
  expect(ticket.receipt.action).toBe(ticket.action);
});
