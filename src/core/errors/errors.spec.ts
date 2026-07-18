import { describe, expect, it } from "vitest";

import { AppError, errorKinds, isAppError, normalizeError, toPublicError } from "./errors";

describe("AppError", () => {
  it("携带 kind、cause 与 retryable", () => {
    const cause = new Error("stripe timeout");
    const error = new AppError("upstream", "payment provider failed", {
      cause,
      retryable: true,
    });
    expect(error.kind).toBe("upstream");
    expect(error.cause).toBe(cause);
    expect(error.retryable).toBe(true);
    expect(isAppError(error)).toBe(true);
  });

  it("kind 集合与 contract 约定一致", () => {
    expect(errorKinds).toEqual([
      "validation",
      "unauthorized",
      "not_found",
      "conflict",
      "rate_limited",
      "upstream",
      "unknown",
    ]);
  });
});

describe("normalizeError", () => {
  it("AppError 原样透传", () => {
    const error = new AppError("not_found", "missing");
    expect(normalizeError(error)).toBe(error);
  });

  it("普通 Error 归一化为 unknown 且保留 cause", () => {
    const normalized = normalizeError(new Error("boom"));
    expect(normalized.kind).toBe("unknown");
    expect(normalized.message).toBe("boom");
    expect(normalized.cause).toBeInstanceOf(Error);
  });

  it("非 Error 值归一化为 unknown", () => {
    expect(normalizeError("nope").kind).toBe("unknown");
  });
});

describe("toPublicError", () => {
  it("AppError 只暴露 kind 与 message", () => {
    const publicError = toPublicError(new AppError("validation", "quantity invalid"));
    expect(publicError).toEqual({ kind: "validation", message: "quantity invalid" });
  });

  it("未知错误返回通用文案，不泄露 cause/stack", () => {
    const publicError = toPublicError(new Error("db password is hunter2"));
    expect(publicError.kind).toBe("unknown");
    expect(publicError.message).not.toContain("hunter2");
  });
});
