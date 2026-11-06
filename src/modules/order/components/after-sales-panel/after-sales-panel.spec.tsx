// @vitest-environment jsdom
import { webcrypto } from "node:crypto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import {
  afterSalesRequestQueryKey,
  type AfterSalesRequestView,
} from "./after-sales-client";
import {
  afterSalesStorageKeys,
  createSubmission,
  type AfterSalesScope,
} from "./after-sales-storage";
import {
  afterSalesCartId,
  afterSalesMarket,
  afterSalesOrderId,
  afterSalesRequestId,
  answeredRequestFixture,
  pendingRequestFixture,
  ticketFixture,
} from "./after-sales-panel.mock";
import { AfterSalesPanel } from "./after-sales-panel";

const scope: AfterSalesScope = {
  market: afterSalesMarket.id,
  cartId: afterSalesCartId,
  orderId: afterSalesOrderId,
};
const keys = afterSalesStorageKeys(scope);
const requestKey = afterSalesRequestQueryKey(
  afterSalesMarket.id,
  afterSalesCartId,
  afterSalesOrderId,
  afterSalesRequestId,
);
const pendingBody = {
  order_id: afterSalesOrderId,
  type: "damaged" as const,
  description: "The left arm arrived with a crack in the fabric.",
  attachment_ids: [],
};
const savedKey = "11111111-1111-4111-8111-111111111111";
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-After-Sales-Contract-Version": "1",
      ...headers,
    },
  });
}

function pngResponse() {
  return new Response(PNG_BYTES, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "X-After-Sales-Contract-Version": "1",
    },
  });
}

function createdResponse(init?: RequestInit, status = 201) {
  const submitted = JSON.parse(String(init?.body ?? "{}")) as {
    description?: string;
    attachment_ids?: string[];
  };
  return jsonResponse(
    {
      ...pendingRequestFixture,
      description: submitted.description ?? pendingRequestFixture.description,
      attachments: (submitted.attachment_ids ?? []).map((attachmentId) => ({
        ...pendingRequestFixture.attachments[0],
        attachment_id: attachmentId,
        file_name: `${attachmentId}.png`,
      })),
    },
    status,
    status === 200 ? { "Idempotency-Replayed": "true" } : {},
  );
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        request_id: "req_test_error",
        retryable: false,
        recovery_action: "NONE",
      },
    },
    status,
  );
}

function requestUrl(input: RequestInfo | URL): URL {
  return new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    window.location.origin,
  );
}

function stubFetch(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(requestUrl(input), init)),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function deferNextDigest() {
  const realDigest = globalThis.crypto.subtle.digest.bind(
    globalThis.crypto.subtle,
  );
  let release: () => void = () => undefined;
  let markStarted: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementationOnce(
    async (algorithm, data) => {
      markStarted();
      await gate;
      return realDigest(algorithm, data);
    },
  );
  return { started, release };
}

function renderPanel(cartId = afterSalesCartId, orderId = afterSalesOrderId) {
  return render(
    <AfterSalesPanel
      market={afterSalesMarket}
      cartId={cartId}
      orderId={orderId}
    />,
  );
}

function seedIndex(request: AfterSalesRequestView = pendingRequestFixture) {
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

async function seedPending() {
  await createSubmission(scope, pendingBody, savedKey);
}

async function seedUnknownMarker() {
  await seedPending();
  window.sessionStorage.removeItem(keys.pending);
}

async function fillForm(description = "A crack in the left arm.") {
  fireEvent.change(screen.getByLabelText("What went wrong?"), {
    target: { value: "damaged" },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: description },
  });
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  window.localStorage.clear();
  window.sessionStorage.clear();
  getStorefrontQueryClient().clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  getStorefrontQueryClient().clear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: originalRevokeObjectURL,
  });
});

it("shows a browser-local empty state without claiming the server has no requests", async () => {
  const fetchMock = stubFetch(() => {
    throw new Error("Unexpected network request");
  });
  renderPanel();

  expect(
    await screen.findByText(
      "No saved after-sales request in this browser yet.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/This does not confirm anything about applications sent/),
  ).toBeTruthy();
  expect(screen.getByLabelText("What went wrong?")).toBeTruthy();
  expect(screen.getByLabelText("Description")).toBeTruthy();
  expect(screen.getByLabelText(/Photos/)).toBeTruthy();
  expect(
    screen.getByLabelText("Have a request ID from customer support?"),
  ).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("uses Unicode code points for the 5000 character limit", async () => {
  stubFetch(() => {
    throw new Error("Unexpected network request");
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  fireEvent.change(screen.getByLabelText("What went wrong?"), {
    target: { value: "damaged" },
  });
  const description = screen.getByLabelText("Description");
  fireEvent.change(description, {
    target: { value: "😀".repeat(5001) },
  });
  expect(screen.getByText("5001 / 5000 characters")).toBeTruthy();
  const send = screen.getByRole("button", { name: "Send request" });
  expect((send as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(description, {
    target: { value: "😀".repeat(5000) },
  });
  expect(screen.getByText("5000 / 5000 characters")).toBeTruthy();
  expect((send as HTMLButtonElement).disabled).toBe(false);
});

it("focuses the description and blocks a blank submission", async () => {
  const fetchMock = stubFetch(() => {
    throw new Error("Unexpected network request");
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  fireEvent.change(screen.getByLabelText("What went wrong?"), {
    target: { value: "damaged" },
  });
  const description = screen.getByLabelText("Description");
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));

  expect(
    await screen.findByText("Describe the issue before sending."),
  ).toBeTruthy();
  expect(document.activeElement).toBe(description);
  expect(description.getAttribute("aria-invalid")).toBe("true");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects unsupported and oversized files before uploading", async () => {
  const fetchMock = stubFetch(() => {
    throw new Error("Unexpected network request");
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  const input = screen.getByLabelText(/Photos/);

  fireEvent.change(input, {
    target: {
      files: [new File(["notes"], "notes.txt", { type: "text/plain" })],
    },
  });
  expect(
    await screen.findByText(/notes.txt: use a JPEG, PNG, or WebP image/),
  ).toBeTruthy();

  fireEvent.change(input, {
    target: {
      files: [
        new File([new Uint8Array(5_242_881)], "huge.png", {
          type: "image/png",
        }),
      ],
    },
  });
  expect(
    await screen.findByText(/huge.png: each photo must be 5 MiB or smaller/),
  ).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("uploads at most three files and names the surplus file", async () => {
  let uploaded = 0;
  const fetchMock = stubFetch((url) => {
    if (url.pathname.endsWith("/after-sales/attachments")) {
      uploaded += 1;
      return jsonResponse(
        {
          ...pendingRequestFixture.attachments[0],
          attachment_id: `att_upload_${uploaded}`,
          file_name: `photo-${uploaded}.png`,
        },
        201,
      );
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  const input = screen.getByLabelText(/Photos/);
  fireEvent.change(input, {
    target: {
      files: [1, 2, 3, 4].map(
        (index) =>
          new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], `photo-${index}.png`, {
            type: "image/png",
          }),
      ),
    },
  });

  expect(
    await screen.findByText(/photo-4.png: you can attach up to 3 photos/),
  ).toBeTruthy();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(screen.getAllByRole("button", { name: "Preview" })).toHaveLength(3);
});

it("creates and revokes a controlled object URL for authorized previews", async () => {
  stubFetch((url) => {
    if (url.pathname.endsWith("/after-sales/attachments")) {
      return jsonResponse(
        {
          ...pendingRequestFixture.attachments[0],
          attachment_id: "att_preview",
          file_name: "preview.png",
        },
        201,
      );
    }
    if (url.pathname.endsWith("/content")) {
      return pngResponse();
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  fireEvent.change(screen.getByLabelText(/Photos/), {
    target: {
      files: [
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "preview.png", {
          type: "image/png",
        }),
      ],
    },
  });
  await screen.findByText("preview.png");
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));

  expect(await screen.findByAltText("Preview of preview.png")).toBeTruthy();
  const createObjectURL = vi.mocked(URL.createObjectURL);
  const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});

it("keeps recovery storage partitioned by market, cart, and order", async () => {
  stubFetch(() => {
    throw new Error("Unexpected network request");
  });
  await seedPending();
  renderPanel("cart_other", afterSalesOrderId);
  await screen.findByText(/No saved after-sales request/);
  expect(
    screen.queryByText("An unconfirmed application is saved in this tab."),
  ).toBeNull();
  expect(window.sessionStorage.getItem(keys.pending)).not.toBeNull();
});

it("prevents a duplicate submit while the first save is still starting", async () => {
  let postCalls = 0;
  let resolveCreate: (response: Response) => void = () => undefined;
  const createPromise = new Promise<Response>((resolve) => {
    resolveCreate = resolve;
  });
  let submittedInit: RequestInit | undefined;
  stubFetch((url, init) => {
    if (url.pathname.endsWith("/after-sales/requests") && init?.method === "POST") {
      postCalls += 1;
      submittedInit = init;
      return createPromise;
    }
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(pendingRequestFixture);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  await fillForm();
  const send = screen.getByRole("button", { name: "Send request" });
  fireEvent.click(send);
  fireEvent.click(send);

  await waitFor(() => expect(postCalls).toBe(1));
  resolveCreate(createdResponse(submittedInit));
  expect(await screen.findByText("Received — awaiting reply")).toBeTruthy();
  expect(postCalls).toBe(1);
});

it("replays the original key and body after a refresh", async () => {
  let phase: "fail" | "success" = "fail";
  const posts: Array<{ key: string | null; body: string }> = [];
  stubFetch((url, init) => {
    if (url.pathname.endsWith("/after-sales/requests") && init?.method === "POST") {
      posts.push({
        key: new Headers(init.headers).get("Idempotency-Key"),
        body: String(init.body),
      });
      if (phase === "fail") throw new TypeError("Network unavailable");
      return createdResponse(init, 200);
    }
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(pendingRequestFixture);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  await fillForm();
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  await screen.findByText("An unconfirmed application is saved in this tab.");

  const saved = JSON.parse(
    window.sessionStorage.getItem(keys.pending) ?? "null",
  ) as { idempotencyKey: string; body: Record<string, unknown> };
  expect(saved).not.toBeNull();
  expect(posts[0]?.key).toBe(saved.idempotencyKey);

  cleanup();
  getStorefrontQueryClient().clear();
  phase = "success";
  renderPanel();

  expect(await screen.findByText("Received — awaiting reply")).toBeTruthy();
  expect(posts).toHaveLength(2);
  expect(posts[1]?.key).toBe(saved.idempotencyKey);
  expect(posts[1]?.body).toBe(JSON.stringify(saved.body));
  expect(window.sessionStorage.getItem(keys.pending)).toBeNull();
  const index = JSON.parse(
    window.localStorage.getItem(keys.index) ?? "null",
  ) as { requests: Array<{ request_id: string }> };
  expect(index.requests[0]?.request_id).toBe(afterSalesRequestId);
});

it.each([401, 403])(
  "clears cached content and stops retrying after a %i",
  async (status) => {
    seedIndex();
    getStorefrontQueryClient().setQueryData(requestKey, pendingRequestFixture);
    const fetchMock = stubFetch(() =>
      errorResponse(
        status,
        status === 401 ? "UNAUTHORIZED" : "FORBIDDEN_MARKET",
        status === 401
          ? "Authentication is required."
          : "The authenticated actor is not authorized for this market.",
      ),
    );
    renderPanel();

    expect(
      await screen.findByText(/You no longer have access to this order/),
    ).toBeTruthy();
    expect(screen.queryByText(pendingRequestFixture.description)).toBeNull();
    expect(screen.queryByText(afterSalesRequestId)).toBeNull();
    expect(getStorefrontQueryClient().getQueryData(requestKey)).toBeUndefined();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  },
);

it("keeps the original key and context locked after a 409", async () => {
  await seedPending();
  const keysUsed: Array<string | null> = [];
  stubFetch((url, init) => {
    if (url.pathname.endsWith("/after-sales/requests") && init?.method === "POST") {
      keysUsed.push(new Headers(init.headers).get("Idempotency-Key"));
      return errorResponse(
        409,
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used with different business fields.",
      );
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();

  expect(
    await screen.findByText(/This application is locked/),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Description")).toBeNull();
  expect(keysUsed[0]).toBe(savedKey);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry saved application" }),
  );
  await waitFor(() => expect(keysUsed).toHaveLength(2));
  expect(keysUsed[1]).toBe(savedKey);
});

it("labels a failed refresh as stale instead of success", async () => {
  seedIndex();
  getStorefrontQueryClient().setQueryData(requestKey, pendingRequestFixture);
  stubFetch(() =>
    errorResponse(
      503,
      "UPSTREAM_UNAVAILABLE",
      "A required after-sales service is temporarily unavailable.",
    ),
  );
  renderPanel();

  expect(
    await screen.findByText(/This is the last confirmed read from/),
  ).toBeTruthy();
  expect(screen.getByText(pendingRequestFixture.description)).toBeTruthy();
  expect(screen.queryByText("Reply received")).toBeNull();
});

it("shows the pending request and never invents a reply", async () => {
  seedIndex();
  const fetchMock = stubFetch((url) => {
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(pendingRequestFixture);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();

  expect(await screen.findByText("Received — awaiting reply")).toBeTruthy();
  expect(screen.queryByText("Customer support reply")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("renders the server reply as text and never as HTML", async () => {
  const maliciousReply = '<img src=x onerror="alert(1)">Replacement approved';
  seedIndex(answeredRequestFixture);
  const fetchMock = stubFetch((url) => {
    if (url.pathname.includes("/after-sales/tickets/")) {
      return jsonResponse({ ...ticketFixture, reply: maliciousReply });
    }
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(answeredRequestFixture);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  const { container } = renderPanel();

  expect(await screen.findByText("Customer support reply")).toBeTruthy();
  expect(screen.getByText(maliciousReply)).toBeTruthy();
  expect(container.querySelector("img")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("fails closed when a saved request response is unreadable", async () => {
  seedIndex();
  stubFetch((url) => {
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse({ request_id: afterSalesRequestId });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();

  expect(
    await screen.findByText(
      /This browser’s saved request could not be read/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/could not be read safely/),
  ).toBeTruthy();
});

it("rejects a request response from another market", async () => {
  seedIndex();
  stubFetch((url) => {
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse({ ...pendingRequestFixture, market: "sg" });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();

  expect(
    await screen.findByText(/does not match this order/),
  ).toBeTruthy();
  expect(screen.queryByText(pendingRequestFixture.description)).toBeNull();
});

it("does not show a reply that belongs to another request", async () => {
  seedIndex(answeredRequestFixture);
  stubFetch((url) => {
    if (url.pathname.includes("/after-sales/tickets/")) {
      return jsonResponse({
        ...ticketFixture,
        request_id: "req_other",
        receipt: { ...ticketFixture.receipt, request_id: "req_other" },
      });
    }
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(answeredRequestFixture);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();

  expect(
    await screen.findByText(
      /The saved reply does not match this request or order/,
    ),
  ).toBeTruthy();
  expect(
    screen.queryByText(/We are sending a replacement arm/),
  ).toBeNull();
});

it("keeps the pending key and body when the request ID index cannot be saved", async () => {
  const originalSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key.endsWith(":index")) {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }
    return originalSetItem.call(this, key, value);
  });
  stubFetch((url, init) => {
    if (url.pathname.endsWith("/after-sales/requests") && init?.method === "POST") {
      return createdResponse(init);
    }
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(pendingRequestFixture);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  await fillForm();
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));

  expect(
    await screen.findByText(
      /Your application was received, but this browser could not save its application ID/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(new RegExp(`Keep this ID: ${afterSalesRequestId}`)),
  ).toBeTruthy();
  expect(window.sessionStorage.getItem(keys.pending)).not.toBeNull();
  expect(window.localStorage.getItem(keys.marker)).not.toBeNull();
  expect(window.localStorage.getItem(keys.index)).toBeNull();
});

it("blocks sending before any write when recovery storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage disabled", "SecurityError");
  });
  const fetchMock = stubFetch(() => {
    throw new Error("Unexpected network request");
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  await fillForm();
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));

  expect(
    await screen.findByText(/could not save your application safely/),
  ).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem(keys.pending)).toBeNull();
});

it("fails closed when the saved request index is corrupt", async () => {
  window.localStorage.setItem(keys.index, "{this is not json");
  const fetchMock = stubFetch(() => {
    throw new Error("Unexpected network request");
  });
  renderPanel();

  expect(
    await screen.findByText(
      /A saved application in this browser cannot be read safely/,
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/No saved after-sales request/)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("allows a new key only after a definitively unwritten 400", async () => {
  let postCalls = 0;
  const keysUsed: Array<string | null> = [];
  stubFetch((url, init) => {
    if (url.pathname.endsWith("/after-sales/requests") && init?.method === "POST") {
      postCalls += 1;
      keysUsed.push(new Headers(init.headers).get("Idempotency-Key"));
      if (postCalls === 1) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "The after-sales request is invalid.",
        );
      }
      return createdResponse(init);
    }
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(pendingRequestFixture);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  await fillForm();
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));

  expect(
    await screen.findByText(
      /The application was not created. You can correct the details and send a new application/,
    ),
  ).toBeTruthy();
  expect(window.sessionStorage.getItem(keys.pending)).toBeNull();
  expect(window.localStorage.getItem(keys.marker)).toBeNull();

  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "A corrected description." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  await waitFor(() => expect(postCalls).toBe(2));
  expect(keysUsed[1]).not.toBe(keysUsed[0]);
  expect(await screen.findByText("Received — awaiting reply")).toBeTruthy();
});

it("blocks a new request after the saved body is lost and recovers only through the server", async () => {
  await seedUnknownMarker();
  stubFetch((url) => {
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse({ ...pendingRequestFixture, attachments: [] });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();

  expect(
    await screen.findByText(/The result of an earlier application is unknown/),
  ).toBeTruthy();
  expect(screen.queryByText("Start a request")).toBeNull();
  expect(screen.queryByLabelText("Description")).toBeNull();

  fireEvent.change(
    screen.getByLabelText("Have a request ID from customer support?"),
    { target: { value: afterSalesRequestId } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Find request" }));

  expect(
    await screen.findByText(
      "Application found. The details below come from customer support’s records.",
    ),
  ).toBeTruthy();
  expect(screen.getByText(afterSalesRequestId)).toBeTruthy();
  expect(window.localStorage.getItem(keys.marker)).toBeNull();
  const index = JSON.parse(
    window.localStorage.getItem(keys.index) ?? "null",
  ) as { requests: Array<{ request_id: string }> };
  expect(index.requests[0]?.request_id).toBe(afterSalesRequestId);
});

it("refuses a recovery request from another order without indexing it", async () => {
  await seedUnknownMarker();
  stubFetch((url) => {
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse({
        ...pendingRequestFixture,
        order_id: "order_other",
      });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(/The result of an earlier application is unknown/);
  fireEvent.change(
    screen.getByLabelText("Have a request ID from customer support?"),
    { target: { value: afterSalesRequestId } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Find request" }));

  expect(
    await screen.findByText(/does not belong to this order/),
  ).toBeTruthy();
  expect(window.localStorage.getItem(keys.index)).toBeNull();
});

it.each([
  ["another order", { order_id: "order_other" }],
  ["different content", { description: "A different issue." }],
])(
  "does not confirm a valid-shaped replay that matches %s",
  async (_label, override) => {
    await seedPending();
    const fetchMock = stubFetch((url, init) => {
      if (
        url.pathname.endsWith("/after-sales/requests") &&
        init?.method === "POST"
      ) {
        return jsonResponse(
          { ...pendingRequestFixture, attachments: [], ...override },
          200,
          { "Idempotency-Replayed": "true" },
        );
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    renderPanel();

    expect(
      await screen.findByText(
        /could not confirm whether the application was received/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("An unconfirmed application is saved in this tab."),
    ).toBeTruthy();
    expect(screen.queryByText("Received — awaiting reply")).toBeNull();
    expect(window.sessionStorage.getItem(keys.pending)).not.toBeNull();
    expect(window.localStorage.getItem(keys.marker)).not.toBeNull();
    expect(window.localStorage.getItem(keys.index)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

it("aborts a concurrent upload and ignores its late success after a 401", async () => {
  seedIndex();
  getStorefrontQueryClient().setQueryData(requestKey, pendingRequestFixture);
  let uploadCalls = 0;
  let uploadSignal: AbortSignal | undefined;
  let resolveUpload: (response: Response) => void = () => undefined;
  const uploadPromise = new Promise<Response>((resolve) => {
    resolveUpload = resolve;
  });
  stubFetch((url, init) => {
    if (
      url.pathname.endsWith("/after-sales/attachments") &&
      init?.method === "POST"
    ) {
      uploadCalls += 1;
      uploadSignal = init.signal ?? undefined;
      return uploadPromise;
    }
    if (url.pathname.endsWith("/content")) {
      return errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
    }
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(pendingRequestFixture);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(pendingRequestFixture.description);

  fireEvent.change(screen.getByLabelText(/Photos/), {
    target: {
      files: [
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "late.png", {
          type: "image/png",
        }),
      ],
    },
  });
  await waitFor(() => expect(uploadCalls).toBe(1));
  fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0]);

  expect(
    await screen.findByText(/You no longer have access to this order/),
  ).toBeTruthy();
  await waitFor(() => expect(uploadSignal?.aborted).toBe(true));

  resolveUpload(
    jsonResponse(
      {
        ...pendingRequestFixture.attachments[0],
        attachment_id: "att_late",
        file_name: "late.png",
      },
      201,
    ),
  );
  await waitFor(() =>
    expect(getStorefrontQueryClient().getQueryData(requestKey)).toBeUndefined(),
  );
  expect(screen.queryByText("late.png")).toBeNull();
  expect(screen.queryByText(pendingRequestFixture.description)).toBeNull();
  expect(screen.queryByText("Received — awaiting reply")).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("aborts an in-flight create on 401 and preserves the unknown application context", async () => {
  await seedPending();
  const oldEntry = {
    request_id: "req_old",
    created_at: "2026-11-05T09:00:00Z",
    updated_at: "2026-11-05T09:05:00Z",
  };
  window.localStorage.setItem(
    keys.index,
    JSON.stringify({
      version: 1,
      requests: [oldEntry],
      last_selected_id: oldEntry.request_id,
    }),
  );
  let postCalls = 0;
  let postSignal: AbortSignal | undefined;
  let resolvePost: (response: Response) => void = () => undefined;
  let resolveRequest: (response: Response) => void = () => undefined;
  const postPromise = new Promise<Response>((resolve) => {
    resolvePost = resolve;
  });
  const requestPromise = new Promise<Response>((resolve) => {
    resolveRequest = resolve;
  });
  stubFetch((url, init) => {
    if (url.pathname.endsWith("/after-sales/requests") && init?.method === "POST") {
      postCalls += 1;
      postSignal = init.signal ?? undefined;
      return postPromise;
    }
    if (url.pathname.includes("/after-sales/requests/")) {
      return requestPromise;
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();

  await waitFor(() => expect(postCalls).toBe(1));
  resolveRequest(
    errorResponse(401, "UNAUTHORIZED", "Authentication is required."),
  );
  expect(
    await screen.findByText(/You no longer have access to this order/),
  ).toBeTruthy();
  await waitFor(() => expect(postSignal?.aborted).toBe(true));

  resolvePost(jsonResponse({ ...pendingRequestFixture, attachments: [] }, 200, {
    "Idempotency-Replayed": "true",
  }));
  await waitFor(() =>
    expect(getStorefrontQueryClient().getQueryData(requestKey)).toBeUndefined(),
  );

  expect(window.sessionStorage.getItem(keys.pending)).not.toBeNull();
  expect(window.localStorage.getItem(keys.marker)).not.toBeNull();
  const index = JSON.parse(
    window.localStorage.getItem(keys.index) ?? "null",
  ) as { requests: Array<{ request_id: string }> };
  expect(index.requests.map((item) => item.request_id)).toEqual(["req_old"]);
  expect(screen.queryByText("Received — awaiting reply")).toBeNull();
  expect(screen.queryByText(pendingRequestFixture.description)).toBeNull();
});

it("keeps the earlier unknown lock when recovering a different old application", async () => {
  await seedUnknownMarker();
  const oldRequest = {
    ...pendingRequestFixture,
    request_id: "req_old",
    description: "An older issue from the same order.",
    attachments: [],
  };
  stubFetch((url) => {
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(oldRequest);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(/The result of an earlier application is unknown/);

  fireEvent.change(
    screen.getByLabelText("Have a request ID from customer support?"),
    { target: { value: oldRequest.request_id } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Find request" }));

  expect(
    await screen.findByText(
      /An earlier submission still cannot be confirmed, so starting a new application is blocked/,
    ),
  ).toBeTruthy();
  expect(await screen.findByText(oldRequest.description)).toBeTruthy();
  expect(
    screen.getByText(/The result of an earlier application is unknown/),
  ).toBeTruthy();
  expect(window.localStorage.getItem(keys.marker)).not.toBeNull();
  expect(screen.queryByText("Start a request")).toBeNull();
  const index = JSON.parse(
    window.localStorage.getItem(keys.index) ?? "null",
  ) as { requests: Array<{ request_id: string }> };
  expect(index.requests[0]?.request_id).toBe(oldRequest.request_id);
});

it("keeps ordinary recovery available when no unknown marker exists", async () => {
  stubFetch((url) => {
    if (url.pathname.includes("/after-sales/requests/")) {
      return jsonResponse(pendingRequestFixture);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(/No saved after-sales request/);

  fireEvent.change(
    screen.getByLabelText("Have a request ID from customer support?"),
    { target: { value: afterSalesRequestId } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Find request" }));

  expect(
    await screen.findByText(
      "Application found. The details below come from customer support’s records.",
    ),
  ).toBeTruthy();
  expect(
    screen.queryByText(/The result of an earlier application is unknown/),
  ).toBeNull();
  expect(screen.getByText("Start a request")).toBeTruthy();
  expect(window.localStorage.getItem(keys.marker)).toBeNull();
});

it("keeps the unknown marker and index when access is lost while hashing a recovery", async () => {
  await seedUnknownMarker();
  const oldEntry = {
    request_id: "req_old",
    created_at: "2026-11-05T09:00:00Z",
    updated_at: "2026-11-05T09:05:00Z",
  };
  const seededIndex = {
    version: 1,
    requests: [oldEntry],
    last_selected_id: oldEntry.request_id,
  };
  window.localStorage.setItem(keys.index, JSON.stringify(seededIndex));
  const markerBefore = window.localStorage.getItem(keys.marker);
  expect(markerBefore).not.toBeNull();

  let oldRequestStarted = false;
  let resolveOldRequest: (response: Response) => void = () => undefined;
  const oldRequestPromise = new Promise<Response>((resolve) => {
    resolveOldRequest = resolve;
  });
  stubFetch((url) => {
    if (url.pathname.includes(`/after-sales/requests/${oldEntry.request_id}`)) {
      oldRequestStarted = true;
      return oldRequestPromise;
    }
    if (url.pathname.includes(`/after-sales/requests/${afterSalesRequestId}`)) {
      return jsonResponse({ ...pendingRequestFixture, attachments: [] });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  const digest = deferNextDigest();
  renderPanel();
  await screen.findByText(/The result of an earlier application is unknown/);
  await waitFor(() => expect(oldRequestStarted).toBe(true));

  fireEvent.change(
    screen.getByLabelText("Have a request ID from customer support?"),
    { target: { value: afterSalesRequestId } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Find request" }));
  await digest.started;

  resolveOldRequest(
    errorResponse(401, "UNAUTHORIZED", "Authentication is required."),
  );
  expect(
    await screen.findByText(/You no longer have access to this order/),
  ).toBeTruthy();
  digest.release();

  await waitFor(() =>
    expect(window.localStorage.getItem(keys.marker)).toBe(markerBefore),
  );
  expect(window.sessionStorage.getItem(keys.pending)).toBeNull();
  expect(
    JSON.parse(window.localStorage.getItem(keys.index) ?? "null"),
  ).toEqual(seededIndex);
  expect(
    screen.getByText(/You no longer have access to this order/),
  ).toBeTruthy();
});

it("writes no pending context when access is lost while hashing a new submission", async () => {
  stubFetch((url) => {
    if (url.pathname.includes("/after-sales/requests/")) {
      return errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  const digest = deferNextDigest();
  renderPanel();
  await screen.findByText(/No saved after-sales request/);
  await fillForm();
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  await digest.started;

  fireEvent.change(
    screen.getByLabelText("Have a request ID from customer support?"),
    { target: { value: afterSalesRequestId } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Find request" }));
  expect(
    await screen.findByText(/You no longer have access to this order/),
  ).toBeTruthy();
  digest.release();

  await waitFor(() =>
    expect(window.sessionStorage.getItem(keys.pending)).toBeNull(),
  );
  expect(window.localStorage.getItem(keys.marker)).toBeNull();
  expect(window.localStorage.getItem(keys.index)).toBeNull();
  expect(
    screen.getByText(/You no longer have access to this order/),
  ).toBeTruthy();
});

it("revokes an open preview object URL when access is lost", async () => {
  seedIndex();
  getStorefrontQueryClient().setQueryData(requestKey, pendingRequestFixture);
  let requestCalls = 0;
  stubFetch((url) => {
    if (url.pathname.endsWith("/content")) return pngResponse();
    if (url.pathname.includes("/after-sales/requests/")) {
      requestCalls += 1;
      return requestCalls === 1
        ? jsonResponse(pendingRequestFixture)
        : errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(pendingRequestFixture.description);
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(await screen.findByAltText("Preview of damaged-arm.png")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Refresh request" }));

  expect(
    await screen.findByText(/You no longer have access to this order/),
  ).toBeTruthy();
  expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith("blob:preview");
  expect(screen.queryByText(pendingRequestFixture.description)).toBeNull();
});

it("ignores a late preview success after access is lost", async () => {
  seedIndex();
  getStorefrontQueryClient().setQueryData(requestKey, pendingRequestFixture);
  let requestCalls = 0;
  let resolveContent: (response: Response) => void = () => undefined;
  const contentPromise = new Promise<Response>((resolve) => {
    resolveContent = resolve;
  });
  stubFetch((url) => {
    if (url.pathname.endsWith("/content")) return contentPromise;
    if (url.pathname.includes("/after-sales/requests/")) {
      requestCalls += 1;
      return requestCalls === 1
        ? jsonResponse(pendingRequestFixture)
        : errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  renderPanel();
  await screen.findByText(pendingRequestFixture.description);
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  await waitFor(() => expect(requestCalls).toBe(1));

  fireEvent.click(screen.getByRole("button", { name: "Refresh request" }));
  expect(
    await screen.findByText(/You no longer have access to this order/),
  ).toBeTruthy();

  resolveContent(pngResponse());
  await waitFor(() =>
    expect(getStorefrontQueryClient().getQueryData(requestKey)).toBeUndefined(),
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.queryByAltText("Preview of damaged-arm.png")).toBeNull();
});
