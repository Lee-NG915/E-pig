import type { ReactNode } from "react";

import { themeToStyle } from "./theme";
import { themes, type ThemeId } from "./themes";

export type ThemeProviderProps = { children: ReactNode; themeId?: ThemeId };

function resolveThemeId(themeId: ThemeId | undefined): ThemeId {
  if (themeId && themeId in themes) {
    return themeId;
  }
  return "default";
}

export function ThemeProvider({ children, themeId = "default" }: ThemeProviderProps) {
  const resolvedThemeId = resolveThemeId(themeId);
  const theme = themes[resolvedThemeId];

  return (
    <div data-theme={resolvedThemeId} style={themeToStyle(theme)} className="contents">
      {children}
    </div>
  );
}
