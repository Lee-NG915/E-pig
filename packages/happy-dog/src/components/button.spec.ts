import { describe, expect, it } from "vitest";

import { buttonVariants } from "./button";

describe("buttonVariants", () => {
  it("maps sizes to the contract control heights (32/40/48)", () => {
    expect(buttonVariants({ size: "sm" })).toContain("h-8");
    expect(buttonVariants({ size: "default" })).toContain("h-10");
    expect(buttonVariants({ size: "lg" })).toContain("h-12");
  });

  it("uses semantic tokens for every style variant", () => {
    expect(buttonVariants({ variant: "default" })).toContain("bg-primary");
    expect(buttonVariants({ variant: "secondary" })).toContain("bg-secondary");
    expect(buttonVariants({ variant: "destructive" })).toContain("bg-destructive");
    expect(buttonVariants({ variant: "destructive" })).toContain("text-destructive-foreground");
    expect(buttonVariants({ variant: "outline" })).toContain("border");
    expect(buttonVariants({ variant: "ghost" })).toContain("hover:bg-muted");
    expect(buttonVariants({ variant: "link" })).toContain("text-primary");
  });

  it("keeps destructive on the danger token, not raw palette classes", () => {
    expect(buttonVariants({ variant: "destructive" })).not.toContain("bg-red-600");
  });

  it("keeps default variants when no props are passed", () => {
    const classes = buttonVariants();
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("h-10");
  });
});
