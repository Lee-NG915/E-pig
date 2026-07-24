import { describe, expect, it } from "vitest";

import { defaultColors, primitives, semanticColorKeys } from "./colors";
import { themeToCssVariables } from "./theme";
import { themes } from "./themes";

describe("happy-dog theme", () => {
  it("defines every semantic color in the default theme", () => {
    expect(Object.keys(defaultColors).sort()).toEqual([...semanticColorKeys].sort());
  });

  it("covers the status + destructive semantics required by the design contract", () => {
    for (const key of ["destructive", "destructive-foreground", "sale", "success", "warning", "info"] as const) {
      expect(defaultColors[key], key).toBeTruthy();
    }
  });

  it("matches the contract brand anchors (oklch conversions of the Figma hex)", () => {
    // primary = moss.700 #495133, background = cream.200 #FAF7EF, foreground = mono.900 #1F1F1F
    expect(defaultColors.primary).toBe("oklch(0.419 0.048 120.6)");
    expect(defaultColors.background).toBe("oklch(0.976 0.011 89.7)");
    expect(defaultColors.foreground).toBe("oklch(0.239 0 0)");
    expect(defaultColors.sale).toBe("oklch(0.588 0.154 38.2)");
    expect(defaultColors.destructive).toBe("oklch(0.541 0.148 28.5)");
  });

  it("documents the primitive hex scales from the design contract", () => {
    expect(primitives.moss[700]).toBe("#495133");
    expect(primitives.cream[200]).toBe("#FAF7EF");
    expect(primitives.mono[900]).toBe("#1F1F1F");
    expect(primitives.persimmon[500]).toBe("#C65530");
  });

  it("converts theme tokens to CSS custom properties", () => {
    expect(themeToCssVariables(themes.default)).toMatchObject({
      "--background": defaultColors.background,
      "--primary": defaultColors.primary,
      "--sale": defaultColors.sale,
      "--success": defaultColors.success,
      "--warning": defaultColors.warning,
      "--info": defaultColors.info,
      "--destructive": defaultColors.destructive,
      "--radius": "0.75rem",
    });
  });
});
