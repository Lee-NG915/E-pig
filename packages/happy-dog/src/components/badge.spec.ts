import { describe, expect, it } from "vitest";

import { badgeVariants } from "./badge";

describe("badgeVariants", () => {
  it("maps contract variants to semantic tokens", () => {
    expect(badgeVariants({ variant: "default" })).toContain("bg-primary");
    expect(badgeVariants({ variant: "secondary" })).toContain("bg-secondary");
    expect(badgeVariants({ variant: "outline" })).toContain("text-foreground");
  });

  it("supports sale / success / info status badges", () => {
    expect(badgeVariants({ variant: "sale" })).toContain("bg-sale");
    expect(badgeVariants({ variant: "success" })).toContain("bg-success");
    expect(badgeVariants({ variant: "info" })).toContain("bg-info");
  });
});
