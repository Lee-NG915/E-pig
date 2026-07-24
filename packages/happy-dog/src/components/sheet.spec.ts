import { describe, expect, it } from "vitest";

import { sheetContentVariants } from "./sheet";

describe("sheetContentVariants", () => {
  it("defaults to the right-side desktop drawer", () => {
    const classes = sheetContentVariants();
    expect(classes).toContain("right-0");
    expect(classes).toContain("slide-in-from-right");
  });

  it("supports the mobile bottom drawer with 16px top radius", () => {
    const classes = sheetContentVariants({ side: "bottom" });
    expect(classes).toContain("bottom-0");
    expect(classes).toContain("slide-in-from-bottom");
    expect(classes).toContain("rounded-t-xl");
    expect(classes).not.toContain("slide-in-from-right");
  });
});
