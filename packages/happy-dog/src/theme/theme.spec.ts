import { describe, expect, it } from "vitest";

import { defaultColors, semanticColorKeys } from "./colors";
import { themeToCssVariables } from "./theme";
import { themes } from "./themes";

describe("happy-dog theme", () => {
  it("defines every semantic color in the default theme", () => {
    expect(Object.keys(defaultColors).sort()).toEqual([...semanticColorKeys].sort());
  });

  it("converts theme tokens to CSS custom properties", () => {
    expect(themeToCssVariables(themes.default)).toMatchObject({
      "--background": defaultColors.background,
      "--primary": defaultColors.primary,
      "--radius": "0.75rem",
    });
  });
});
