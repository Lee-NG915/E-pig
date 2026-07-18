import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // `_` 前缀参数表示有意未使用（如 interface 要求的占位参数）
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // 依赖方向（docs/codex/research/04 §4）：
  // app 组合一切；modules 只依赖 core contracts + shared；shared 不反向依赖业务层。
  {
    files: ["src/modules/**/*.ts", "src/modules/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/adapters/*", "@/integrations/*", "@/platform/registry"],
              message:
                "modules 只能通过 @/core/contracts 依赖 port；adapter 由 app 层经 platform/registry 组合后注入。",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**/*.ts", "src/shared/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*", "@/adapters/*", "@/integrations/*", "@/platform/*"],
              message: "shared 不得反向依赖业务/平台层，只允许依赖 @/core。",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
