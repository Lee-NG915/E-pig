import { describe, expect, it } from "vitest";

import { inputVariants } from "./input";

describe("inputVariants", () => {
  it("maps sizes to contract heights (Sm 32 / Md 40) and defaults to Md", () => {
    expect(inputVariants({ size: "sm" })).toContain("h-8");
    expect(inputVariants({ size: "md" })).toContain("h-10");
    expect(inputVariants()).toContain("h-10");
  });

  it("drives the error state from aria-invalid with the destructive token", () => {
    const classes = inputVariants();
    expect(classes).toContain("aria-invalid:border-destructive");
    expect(classes).toContain("aria-invalid:ring-destructive/25");
  });

  it("keeps disabled and focus-visible states", () => {
    const classes = inputVariants();
    expect(classes).toContain("disabled:opacity-50");
    expect(classes).toContain("focus-visible:ring-ring/35");
  });
});
