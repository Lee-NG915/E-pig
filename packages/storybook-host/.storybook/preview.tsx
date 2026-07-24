import type { Preview } from "@storybook/react-vite";

import { ThemeProvider, themes, type ThemeId } from "@e-pig/happy-dog/theme";

import "./preview.css";

/**
 * 全局 preview（与 happy-dog 自家 Storybook 同一套主题机制）：
 * - ThemeProvider + globals.css，主题经 toolbar 切换（default / dark）
 * - next/image、next/link 已在 main.ts 的 viteFinal 里 alias 成轻量 mock
 *
 * 注意：依赖 cart 的组件（product-card / cart-sheet / cart-sheet-mount /
 * site-header）必须在各自 story 的 decorators 里包 CartMarketProvider。
 * host 不全局注入 market —— 每个 story 文件使用自己专属的 market id，
 * 避免共享同一个 demo cart store（localStorage + 模块级 Map）互相污染。
 */

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
    (Story, context) => (
      <ThemeProvider themeId={resolveStorybookThemeId(context.globals.theme)}>
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: { controls: { expanded: true }, a11y: { test: "todo" } },
  tags: ["autodocs"],
};

export default preview;
