import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger, setLogLevel } from "./logger";

describe("logger facade", () => {
  afterEach(() => {
    setLogLevel("info");
    vi.restoreAllMocks();
  });

  it("输出结构化 JSON 行（level/time/event + fields）", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    createLogger({ module: "cart" }).info("cart.created", { cartId: "c1" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "info", event: "cart.created", module: "cart", cartId: "c1" });
    expect(typeof line.time).toBe("string");
  });

  it("低于当前级别的日志被过滤", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger();

    logger.debug("should.be.hidden");
    expect(spy).not.toHaveBeenCalled();

    setLogLevel("debug");
    logger.debug("should.be.visible");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("error/warn 走对应 console 通道", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = createLogger();

    logger.error("boom");
    logger.warn("careful");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
