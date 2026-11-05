import { describe, expect, it } from "vitest";

import { assertProcessGroupStopped } from "./after-sales-http-harness";

describe("assertProcessGroupStopped", () => {
  it("throws instead of reporting success when the group was not confirmed gone", () => {
    expect(() => assertProcessGroupStopped(4242, false)).toThrow(
      /Could not confirm cleanup of the Next dev process group \(pgid 4242\)/,
    );
  });

  it("accepts a cleanup that was observed gone", () => {
    expect(() => assertProcessGroupStopped(4242, true)).not.toThrow();
  });
});
