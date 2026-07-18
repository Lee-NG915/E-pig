import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function lint(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

describe("env hygiene ESLint policy", () => {
  it("拒绝 env.ts 之外的 process.env 读取，包括 computed access", async () => {
    const directAccess = ["process", "env", "NODE_ENV"].join(".");
    const computedAccess = ["process", "['env']", ".NODE_ENV"].join("");
    const direct = await lint(
      `export const mode = ${directAccess};`,
      "src/platform/registry.ts",
    );
    const computed = await lint(
      `export const mode = ${computedAccess};`,
      "src/platform/registry.ts",
    );

    expect(direct.some((message) => message.ruleId === "no-restricted-syntax")).toBe(true);
    expect(computed.some((message) => message.ruleId === "no-restricted-syntax")).toBe(true);
  });

  it("允许唯一 env schema 文件读取普通变量", async () => {
    const access = ["process", "env", "MARKET"].join(".");
    const messages = await lint(
      `export const market = ${access};`,
      "src/platform/config/env.ts",
    );

    expect(messages).toEqual([]);
  });

  it("即使在 env schema 文件也拒绝 NEXT_PUBLIC secret 签名", async () => {
    const publicSecret = ["NEXT_PUBLIC_PAYMENT", "SECRET"].join("_");
    const access = ["process", "env", publicSecret].join(".");
    const messages = await lint(
      `export const leaked = ${access};`,
      "src/platform/config/env.ts",
    );

    expect(messages.some((message) => message.ruleId === "no-restricted-syntax")).toBe(true);

    const computedAccess = ["process", "['env']", `[${JSON.stringify(publicSecret)}]`].join("");
    const computedMessages = await lint(
      `export const leaked = ${computedAccess};`,
      "src/platform/config/env.ts",
    );
    expect(
      computedMessages.some((message) => message.ruleId === "no-restricted-syntax"),
    ).toBe(true);

    const schemaMessages = await lint(
      `export const clientEnvSchema = { ${publicSecret}: true };`,
      "src/platform/config/env.ts",
    );
    expect(schemaMessages.some((message) => message.ruleId === "no-restricted-syntax")).toBe(
      true,
    );
  });
});
