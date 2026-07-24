import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
/** packages/storybook-host/.storybook → repo root（上三级） */
const repoRoot = path.resolve(dirname, "../../..");

/**
 * 业务 modules 聚合 Storybook（对齐 Joyboy libs/storybook-host 的"一个入口看全部 story"
 * 意图，但保持 E-pig 轻量：react-vite，不上 Next/Nx/MSW/addon 全家桶）。
 *
 * - stories 同时收 src/modules 业务组件与 happy-dog 基础组件（侧边栏按路径分组）
 * - vite alias `@` → src/（与 App 的 tsconfig paths 一致）
 * - next/image、next/link alias 成本目录轻量 mock，story 可在无 Next 运行时渲染
 *
 * Chromatic 视觉回归后续再接线（docs/engineering/component-folder-harness.md R2），
 * 本包刻意不安装 @chromatic-com/storybook。
 */
const config: StorybookConfig = {
  // SB10：相对 glob 无法可靠逃出包根；用 repoRoot 拼绝对 glob。
  // 注意：.storybook 相对包根是 1 级，相对仓根是 3 级（勿写成 ../../src）。
  stories: [
    path.join(repoRoot, "src/modules/**/*.stories.@(ts|tsx)"),
    path.join(repoRoot, "packages/happy-dog/src/**/*.stories.@(ts|tsx)"),
  ],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  docs: { autodocs: "tag" },
  viteFinal: async (viteConfig) => {
    const aliases: Record<string, string> = {
      "next/image": path.resolve(dirname, "next-image-mock.tsx"),
      "next/link": path.resolve(dirname, "next-link-mock.tsx"),
      "@": path.join(repoRoot, "src"),
    };
    const prior = viteConfig.resolve?.alias;
    const priorEntries = Array.isArray(prior)
      ? prior
      : Object.entries(prior ?? {}).map(([find, replacement]) => ({ find, replacement }));
    return {
      ...viteConfig,
      resolve: {
        ...viteConfig.resolve,
        alias: [
          ...priorEntries,
          ...Object.entries(aliases).map(([find, replacement]) => ({ find, replacement })),
        ],
      },
    };
  },
};

export default config;
