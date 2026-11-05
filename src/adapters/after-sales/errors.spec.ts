import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import manifest from "../../../contracts/epig-after-sales/v1/fixtures/manifest.json";
import leakFixture from "../../../contracts/epig-after-sales/v1/fixtures/responses/create_after_sales_request.error_leak.json";
import validationFixture from "../../../contracts/epig-after-sales/v1/fixtures/responses/create_after_sales_request.validation_error.json";
import requestConflictFixture from "../../../contracts/epig-after-sales/v1/fixtures/responses/create_service_ticket.order_version_conflict.json";

import { parseAfterSalesErrorResponse, toWireError } from "./wire";

type ErrorFixtureBody = {
  error: {
    code: string;
    request_id: string;
    retryable: boolean;
    recovery_action: string;
    details?: Record<string, unknown>;
  };
};

const fixtureRoot = new URL(
  "../../../contracts/epig-after-sales/v1/fixtures/",
  import.meta.url,
);
const errorFixtures = manifest.fixtures
  .filter((entry) =>
    entry.expected_valid
    && entry.kind === "response"
    && entry.schema === "#/components/schemas/ErrorResponse",
  )
  .map((entry) => ({
    fixtureId: entry.fixture_id,
    operationId: entry.operation_id,
    body: JSON.parse(
      readFileSync(new URL(entry.path, fixtureRoot), "utf8"),
    ) as ErrorFixtureBody,
  }));

describe("after-sales error mapping", () => {
  it.each(errorFixtures)(
    "$fixtureId preserves the $operationId error contract",
    ({ body }) => {
      const parsed = parseAfterSalesErrorResponse(body);
      const wire = toWireError(parsed, "fallback");

      expect(parsed).toMatchObject({
        code: body.error.code,
        requestId: body.error.request_id,
        retryable: body.error.retryable,
        recoveryAction: body.error.recovery_action,
        ...(body.error.details ? { details: body.error.details } : {}),
      });
      expect(wire).toEqual({
        error: {
          code: body.error.code,
          message: parsed.message,
          request_id: body.error.request_id,
          retryable: body.error.retryable,
          recovery_action: body.error.recovery_action,
          ...(body.error.details ? { details: body.error.details } : {}),
        },
      });
    },
  );

  it("preserves stable code, retryable, recovery action, request ID, and allowed details", () => {
    const parsed = parseAfterSalesErrorResponse(validationFixture);
    expect(parsed).toMatchObject({
      code: "VALIDATION_ERROR",
      retryable: false,
      recoveryAction: "NONE",
      requestId: validationFixture.error.request_id,
      details: { field: "description" },
    });
    expect(toWireError(parsed, "fallback")).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.message,
        request_id: validationFixture.error.request_id,
        retryable: false,
        recovery_action: "NONE",
        details: { field: "description" },
      },
    });
  });

  it("drops unknown details and top-level leakage from a shared negative fixture", () => {
    const parsed = parseAfterSalesErrorResponse(leakFixture);
    const wire = toWireError(parsed, "fallback");

    expect(parsed.details).toEqual({ field: "description" });
    expect(JSON.stringify(wire)).not.toContain("Synthetic Avenue");
    expect(JSON.stringify(wire)).not.toMatch(/approval_id|approvalId|stack/);
  });

  it("maps order-version conflict to a non-retryable conflict", () => {
    const parsed = parseAfterSalesErrorResponse(requestConflictFixture);
    expect(parsed).toMatchObject({
      kind: "conflict",
      code: "ORDER_VERSION_CONFLICT",
      retryable: false,
      recoveryAction: "NONE",
    });
  });

  it("fails closed for unknown values without using unsafe messages or causes", () => {
    const source = new Error("RAW_SECRET_MUST_NOT_LEAK");
    const wire = toWireError(source, "req_mock_safe");

    expect(wire).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "The after-sales operation could not be completed.",
        request_id: "req_mock_safe",
        retryable: false,
        recovery_action: "LOOKUP_FIRST",
      },
    });
    expect(JSON.stringify(wire)).not.toContain("RAW_SECRET_MUST_NOT_LEAK");
  });
});
