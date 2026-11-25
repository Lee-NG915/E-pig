import { describe, expect, it } from "vitest";

import { consumeOAuthState, issueOAuthState } from "./oauth-state";

const SECRET = "a".repeat(64);
const OTHER_SECRET = "b".repeat(64);

describe("oauth-state（无共享存储的 serverless 部署）", () => {
  it("签发与消费同源 secret 的 state 通过校验（跨实例场景）", () => {
    // 回归：进程内 Map 实现下，login 与 callback 落在不同 lambda 实例时
    // state 永远取不到，登录必然 401。无状态签名实现不依赖实例内存。
    const state = issueOAuthState(SECRET);
    expect(consumeOAuthState(state, SECRET)).toBe(true);
  });

  it("TTL 内随时可消费，过期拒绝", () => {
    const t0 = 1_700_000_000_000;
    const state = issueOAuthState(SECRET, t0);
    expect(consumeOAuthState(state, SECRET, t0 + 9 * 60 * 1000)).toBe(true);
    expect(consumeOAuthState(state, SECRET, t0 + 11 * 60 * 1000)).toBe(false);
  });

  it("篡改 payload 拒绝", () => {
    const state = issueOAuthState(SECRET);
    const [payload] = state.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as [string, number];
    decoded[1] = decoded[1] + 60_000;
    const forgedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    expect(consumeOAuthState(`${forgedPayload}.deadbeef`, SECRET)).toBe(false);
  });

  it("错误 secret 拒绝（防跨环境重放）", () => {
    const state = issueOAuthState(SECRET);
    expect(consumeOAuthState(state, OTHER_SECRET)).toBe(false);
  });

  it("垃圾输入拒绝", () => {
    expect(consumeOAuthState("", SECRET)).toBe(false);
    expect(consumeOAuthState("not-a-state", SECRET)).toBe(false);
    expect(consumeOAuthState("a.b.c", SECRET)).toBe(false);
    expect(consumeOAuthState(`${"x".repeat(600)}`, SECRET)).toBe(false);
  });

  it("两次签发的 state 不重复（nonce 随机）", () => {
    expect(issueOAuthState(SECRET)).not.toBe(issueOAuthState(SECRET));
  });
});
