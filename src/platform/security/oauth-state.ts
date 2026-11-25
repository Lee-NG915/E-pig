import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_STATE_LENGTH = 512;

/**
 * 无状态 OAuth state（serverless / 多实例部署安全）。
 * base64url([nonce, expiresAt]) + "." + HMAC-SHA256(secret)，签名与过期校验
 * 不依赖实例内存；nonce 保证每次签发唯一。放弃进程内 Map 的单次消费语义：
 * TTL 内重放同一 state 只能重复兑换同一个 GitHub code，而 code 本身被
 * GitHub 限制为单次使用，重放在 GitHub 侧即失败。
 */
export function issueOAuthState(secret: string, now = Date.now()): string {
  const nonce = randomBytes(24).toString("base64url");
  const payload = Buffer.from(JSON.stringify([nonce, now + STATE_TTL_MS])).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function consumeOAuthState(state: string, secret: string, now = Date.now()): boolean {
  if (!state || state.length > MAX_STATE_LENGTH) return false;
  const [payload, mac, extra] = state.split(".");
  if (!payload || !mac || extra !== undefined) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== 2) return false;
    const [nonce, expires] = decoded;
    return (
      typeof nonce === "string" &&
      nonce.length >= 16 &&
      Number.isInteger(expires) &&
      (expires as number) > now
    );
  } catch {
    return false;
  }
}
