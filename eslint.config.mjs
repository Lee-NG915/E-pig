import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const directProcessEnvSelectors = [
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: "process.env 只能在 src/platform/config/env.ts 中读取，请使用 typed env。",
  },
  {
    selector: "MemberExpression[object.name='process'][computed=true][property.value='env']",
    message: "process['env'] 只能在 src/platform/config/env.ts 中读取，请使用 typed env。",
  },
];

const publicSecretSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|PASSWORD)$/]",
    message: "NEXT_PUBLIC_* 会进入客户端 bundle，变量名疑似包含秘密。",
  },
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][computed=true][property.value=/^NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|PASSWORD)$/]",
    message: "NEXT_PUBLIC_* 会进入客户端 bundle，变量名疑似包含秘密。",
  },
  {
    selector:
      "MemberExpression[object.object.name='process'][object.computed=true][object.property.value='env'][property.name=/^NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|PASSWORD)$/]",
    message: "NEXT_PUBLIC_* 会进入客户端 bundle，变量名疑似包含秘密。",
  },
  {
    selector:
      "MemberExpression[object.object.name='process'][object.computed=true][object.property.value='env'][computed=true][property.value=/^NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|PASSWORD)$/]",
    message: "NEXT_PUBLIC_* 会进入客户端 bundle，变量名疑似包含秘密。",
  },
  {
    selector:
      "VariableDeclarator[id.name='clientEnvSchema'] Property[key.name=/^NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|PASSWORD)$/]",
    message: "clientEnvSchema 中的 NEXT_PUBLIC_* 属性疑似包含秘密。",
  },
  {
    selector:
      "VariableDeclarator[id.name='clientEnvSchema'] Property[computed=true][key.value=/^NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|PASSWORD)$/]",
    message: "clientEnvSchema 中的 NEXT_PUBLIC_* 属性疑似包含秘密。",
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // `_` 前缀参数表示有意未使用（如 interface 要求的占位参数）
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/platform/config/env.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...directProcessEnvSelectors],
    },
  },
  {
    files: ["src/platform/config/env.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...publicSecretSelectors],
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
  {
    files: ["packages/happy-dog/src/**/*.ts", "packages/happy-dog/src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/modules/*", "@/adapters/*", "@/integrations/*", "@/platform/*"],
              message: "happy-dog 是独立基础组件包，不得依赖 App 或业务/适配/集成/平台层。",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "**/storybook-static/**", "next-env.d.ts"]),
]);
