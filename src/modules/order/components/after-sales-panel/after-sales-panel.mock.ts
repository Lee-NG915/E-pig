import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import {
  afterSalesRequestQueryKey,
  afterSalesTicketQueryKey,
  type AfterSalesRequestView,
  type AfterSalesTicketView,
} from "./after-sales-client";
import {
  afterSalesStorageKeys,
  createSubmission,
  type AfterSalesScope,
} from "./after-sales-storage";

export const afterSalesMarket = { id: "au", currency: "AUD" };
export const afterSalesCartId = "cart_demo_1";
export const afterSalesOrderId = "order_demo_1";
export const afterSalesRequestId = "req_demo_1";
export const afterSalesTicketId = "tkt_demo_1";

export const afterSalesScope: AfterSalesScope = {
  market: afterSalesMarket.id,
  cartId: afterSalesCartId,
  orderId: afterSalesOrderId,
};

export const afterSalesKeys = afterSalesStorageKeys(afterSalesScope);

export const pendingRequestFixture: AfterSalesRequestView = {
  request_id: afterSalesRequestId,
  order_id: afterSalesOrderId,
  market: "au",
  type: "damaged",
  description: "The left arm arrived with a crack in the fabric.",
  attachments: [
    {
      attachment_id: "att_demo_1",
      file_name: "damaged-arm.png",
      media_type: "image/png",
      size_bytes: 1200,
      status: "active",
      created_at: "2026-11-06T10:00:00Z",
      expires_at: "2026-11-13T10:00:00Z",
    },
  ],
  status: "pending",
  ticket_id: null,
  created_at: "2026-11-06T10:00:00Z",
  updated_at: "2026-11-06T10:05:00Z",
};

export const answeredRequestFixture: AfterSalesRequestView = {
  ...pendingRequestFixture,
  status: "ticket_created",
  ticket_id: afterSalesTicketId,
  updated_at: "2026-11-06T12:00:00Z",
};

export const ticketFixture: AfterSalesTicketView = {
  ticket_id: afterSalesTicketId,
  request_id: afterSalesRequestId,
  order_id: afterSalesOrderId,
  market: "au",
  action: "reship",
  reply:
    "We are sending a replacement arm. You do not need to return the damaged part.",
  status: "closed",
  receipt: {
    receipt_id: "rct_demo_1",
    ticket_id: afterSalesTicketId,
    request_id: afterSalesRequestId,
    action: "reship",
    request_status: "ticket_created",
    created_at: "2026-11-06T12:00:00Z",
  },
  created_at: "2026-11-06T12:00:00Z",
  updated_at: "2026-11-06T12:05:00Z",
};

export type AfterSalesStoryMode =
  | "loading"
  | "empty"
  | "forbidden"
  | "error"
  | "stale"
  | "conflict"
  | "retrying"
  | "success"
  | "pending"
  | "unknown";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-After-Sales-Contract-Version": "1",
    },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable = false,
  recoveryAction = "NONE",
): Response {
  return json(
    {
      error: {
        code,
        message,
        request_id: "req_story_error",
        retryable,
        recovery_action: recoveryAction,
      },
    },
    status,
  );
}

function withoutPending(scope: AfterSalesScope): void {
  const keys = afterSalesStorageKeys(scope);
  try {
    window.sessionStorage.removeItem(keys.pending);
  } catch {
    /* Story cleanup only. */
  }
}

function clearStoryStorage(scope: AfterSalesScope): void {
  const keys = afterSalesStorageKeys(scope);
  try {
    window.sessionStorage.removeItem(keys.pending);
    window.localStorage.removeItem(keys.marker);
    window.localStorage.removeItem(keys.index);
  } catch {
    /* Story cleanup only. */
  }
}

function writeIndex(
  scope: AfterSalesScope,
  request: AfterSalesRequestView,
): void {
  const keys = afterSalesStorageKeys(scope);
  window.localStorage.setItem(
    keys.index,
    JSON.stringify({
      version: 1,
      requests: [
        {
          request_id: request.request_id,
          created_at: request.created_at,
          updated_at: request.updated_at,
        },
      ],
      last_selected_id: request.request_id,
    }),
  );
}

let activeCleanup: (() => void) | undefined;
let activeGeneration = 0;

export async function installAfterSalesStory(
  mode: AfterSalesStoryMode,
): Promise<() => void> {
  activeCleanup?.();
  const generation = ++activeGeneration;
  const queryClient = getStorefrontQueryClient();
  queryClient.clear();
  clearStoryStorage(afterSalesScope);

  if (mode === "conflict" || mode === "retrying" || mode === "unknown") {
    await createSubmission(
      afterSalesScope,
      {
        order_id: afterSalesOrderId,
        type: "damaged",
        description: "The left arm arrived with a crack in the fabric.",
        attachment_ids: [],
      },
      "11111111-1111-4111-8111-111111111111",
    );
    if (mode === "unknown") withoutPending(afterSalesScope);
  }

  if (
    mode === "loading" ||
    mode === "forbidden" ||
    mode === "error" ||
    mode === "stale" ||
    mode === "success" ||
    mode === "pending"
  ) {
    writeIndex(
      afterSalesScope,
      mode === "success" ? answeredRequestFixture : pendingRequestFixture,
    );
  }

  if (mode === "stale") {
    queryClient.setQueryData(
      afterSalesRequestQueryKey(
        afterSalesMarket.id,
        afterSalesCartId,
        afterSalesOrderId,
        afterSalesRequestId,
      ),
      pendingRequestFixture,
    );
  }

  if (mode === "success") {
    queryClient.setQueryData(
      afterSalesRequestQueryKey(
        afterSalesMarket.id,
        afterSalesCartId,
        afterSalesOrderId,
        afterSalesRequestId,
      ),
      answeredRequestFixture,
    );
    queryClient.setQueryData(
      afterSalesTicketQueryKey(
        afterSalesMarket.id,
        afterSalesCartId,
        afterSalesOrderId,
        afterSalesTicketId,
      ),
      ticketFixture,
    );
  }

  const originalFetch = window.fetch;
  const mockFetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      window.location.origin,
    );
    const isRequest = url.pathname.includes("/after-sales/requests/");
    const isTicket = url.pathname.includes("/after-sales/tickets/");
    const isCreate = url.pathname.endsWith("/after-sales/requests");
    const isAttachmentContent = url.pathname.includes("/content");
    const isUpload = url.pathname.endsWith("/after-sales/attachments");

    if (mode === "loading" && isRequest) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    }
    if (mode === "forbidden") {
      return errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
    }
    if (mode === "error") {
      return errorResponse(
        500,
        "INTERNAL_ERROR",
        "The after-sales operation could not be completed.",
        false,
        "LOOKUP_FIRST",
      );
    }
    if (mode === "stale") {
      return errorResponse(
        503,
        "UPSTREAM_UNAVAILABLE",
        "A required after-sales service is temporarily unavailable.",
        true,
        "RETRY_REQUEST",
      );
    }
    if (mode === "conflict" && isCreate) {
      return errorResponse(
        409,
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used with different business fields.",
      );
    }
    if (mode === "retrying" && isCreate) {
      return errorResponse(
        503,
        "UPSTREAM_UNAVAILABLE",
        "A required after-sales service is temporarily unavailable.",
        false,
        "RETRY_CREATE_WITH_SAME_KEY",
      );
    }
    if (isTicket) return json(ticketFixture);
    if (isRequest) {
      if (mode === "success") return json(answeredRequestFixture);
      return json(pendingRequestFixture);
    }
    if (isAttachmentContent) {
      return new Response(PNG_BYTES, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-After-Sales-Contract-Version": "1",
        },
      });
    }
    if (isUpload) {
      return json(pendingRequestFixture.attachments[0], 201);
    }
    if (isCreate) return json(pendingRequestFixture, 201);
    return originalFetch(input, init);
  };
  window.fetch = mockFetch;

  activeCleanup = () => {
    if (window.fetch === mockFetch) window.fetch = originalFetch;
    if (activeGeneration !== generation) return;
    clearStoryStorage(afterSalesScope);
    getStorefrontQueryClient().clear();
    activeCleanup = undefined;
  };
  return activeCleanup;
}
