import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const CART_COOKIE_MAX_AGE = 30 * 86400;
export const cartCookieName = (market: string) => `epig_cart_${market}`;

/** The ID alone is never authority: the MAC binds it to market and absolute expiry. */
export function signCartCookie(id: string, market: string, secret: string, now = Date.now() / 1000) {
  const payload = Buffer.from(JSON.stringify([id, market, Math.floor(now) + CART_COOKIE_MAX_AGE])).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function readCartCookie(token: string | undefined, market: string, secret: string, now = Date.now() / 1000): string | null {
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
    const [id, signedMarket, expires] = decoded;
    return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) && signedMarket === market
      && Number.isInteger(expires) && expires > now && expires <= now + CART_COOKIE_MAX_AGE
      ? id : null;
  } catch {
    return null;
  }
}
