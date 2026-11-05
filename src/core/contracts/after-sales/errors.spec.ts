import { describe, expect, it } from "vitest";

import { AppError } from "@/core/errors/errors";

import {
  AfterSalesError,
  createAfterSalesError,
  normalizeAfterSalesError,
} from "./errors";

describe("after-sales typed errors", () => {
  it("preserves stable wire code and safe recovery semantics while remaining an AppError", () => {
    const error = createAfterSalesError({
      code: "RATE_LIMITED",
      requestId: "req_mock_1",
      details: { retry_after_seconds: 12 },
    });

    expect(error).toBeInstanceOf(AfterSalesError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      kind: "rate_limited",
      code: "RATE_LIMITED",
      retryable: true,
      recoveryAction: "RETRY_REQUEST",
      requestId: "req_mock_1",
    });
    expect(error.message).not.toContain("secret");
    expect(error.cause).toBeUndefined();
  });

  it("fails closed for unknown errors without copying cause, stack, or source message", () => {
    const source = new Error("customer description and bearer token must not leak");
    source.stack = "stack with raw token";
    const error = normalizeAfterSalesError(source, "req_mock_2");

    expect(error).toMatchObject({
      kind: "unknown",
      code: "INTERNAL_ERROR",
      requestId: "req_mock_2",
      retryable: false,
      recoveryAction: "LOOKUP_FIRST",
    });
    expect(error.message).not.toContain("customer description");
    expect(error.message).not.toContain("bearer token");
    expect(error.cause).toBeUndefined();
  });
});
