import type { CSSProperties } from "react";

import type { SemanticColors } from "./colors";
import type { Radii } from "./radii";
import type { Typography } from "./typography";

export type ComponentOverrides = Record<string, never>;
export type Theme = {
  colors: SemanticColors;
  typography: Typography;
  radii: Radii;
  componentOverrides: ComponentOverrides;
};

export function themeToCssVariables(theme: Theme): Record<`--${string}`, string> {
  const colorVariables = Object.fromEntries(Object.entries(theme.colors).map(([key, value]) => [`--${key}`, value]));
  return {
    ...colorVariables,
    "--font-sans": theme.typography.fontSans,
    "--font-display": theme.typography.fontDisplay,
    "--radius": theme.radii.radius,
  };
}

export function themeToStyle(theme: Theme): CSSProperties {
  return themeToCssVariables(theme) as CSSProperties;
}
