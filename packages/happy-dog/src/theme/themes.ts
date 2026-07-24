import { defaultColors } from "./colors";
import { defaultRadii } from "./radii";
import type { Theme } from "./theme";
import { defaultTypography } from "./typography";

const defaultTheme: Theme = { colors: defaultColors, typography: defaultTypography, radii: defaultRadii, componentOverrides: {} };
const darkTheme: Theme = {
  ...defaultTheme,
  colors: { ...defaultColors, background: "oklch(0.18 0.012 66)", foreground: "oklch(0.96 0.006 83)", primary: "oklch(0.78 0.05 151)", "primary-foreground": "oklch(0.18 0.012 66)" },
};

export const themes = { default: defaultTheme, dark: darkTheme } as const;
export type ThemeId = keyof typeof themes;
