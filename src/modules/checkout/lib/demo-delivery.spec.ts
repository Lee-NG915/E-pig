import { describe, expect, it } from "vitest";
import { estimateDemoDelivery } from "./demo-delivery";

describe("explicit demo delivery estimates", () => {
  it("returns the approved test window without changing sandbox charges", () => {
    expect(estimateDemoDelivery("au", " 2000 ")).toEqual({ status: "estimated", minDays: 2, maxDays: 4 });
    expect(estimateDemoDelivery("au", "3000")).toEqual({ status: "estimated", minDays: 3, maxDays: 5 });
  });
  it("keeps empty, malformed and unknown postcodes distinct", () => {
    expect(estimateDemoDelivery("au", "")).toEqual({ status: "idle" });
    expect(estimateDemoDelivery("au", "20x0")).toEqual({ status: "invalid" });
    expect(estimateDemoDelivery("au", "9999")).toEqual({ status: "unknown" });
  });
  it.each(["sg", "us"])("does not imply delivery availability in %s", market => {
    expect(estimateDemoDelivery(market, "2000")).toEqual({ status: "unsupported" });
  });
});
