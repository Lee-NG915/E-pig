import type { Preview } from "@storybook/react-vite";

import { ThemeProvider, themes, type ThemeId } from "../src/theme";
import "../src/styles/globals.css";

function resolveStorybookThemeId(value: unknown): ThemeId {
  if (typeof value === "string" && value in themes) {
    return value as ThemeId;
  }
  return "default";
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Theme",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "default", title: "Default" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "default",
  },
  decorators: [
    (Story, context) => {
      const themeId = resolveStorybookThemeId(context.globals.theme);
      return (
        <ThemeProvider themeId={themeId}>
          <Story />
        </ThemeProvider>
      );
    },
  ],
  parameters: { controls: { expanded: true }, a11y: { test: "todo" } },
  tags: ["autodocs"],
};

export default preview;
