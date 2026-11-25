import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const CONSUMER_SESSION_COOKIE = "epig_consumer_session";
export const CONSUMER_SESSION_MAX_AGE = 8 * 3600;

export type ConsumerSession = { githubId: string; login: string };

/** The session binds one GitHub subject to an absolute expiry, never to data access by itself. */
export function signConsumerSession(
  session: ConsumerSession,
  secret: string,
  now = Date.now() / 1000,
): string {
  const payload = Buffer.from(
    JSON.stringify([session.githubId, session.login, Math.floor(now) + CONSUMER_SESSION_MAX_AGE]),
  ).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function readConsumerSession(
  token: string | undefined,
  secret: string,
  now = Date.now() / 1000,
): ConsumerSession | null {
  if (!token || token.length > 512) return null;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== 3) return null;
    const [githubId, login, expires] = decoded;
    if (
      typeof githubId !== "string" ||
      !/^\d{1,32}$/.test(githubId) ||
      typeof login !== "string" ||
      !login ||
      login.length > 64 ||
      !Number.isInteger(expires) ||
      expires <= now
    ) {
      return null;
    }
    return { githubId, login };
  } catch {
    return null;
  }
}
