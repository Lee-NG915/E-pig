import { describe, expect, it } from "vitest";
import { cartCookieName, readCartCookie, signCartCookie } from "./cart-cookie";

const secret = "a-test-only-secret-with-at-least-32-characters";
const id = "1b32b928-e69b-4cf3-a242-d8b6965d16a2";

describe("anonymous cart credential", () => {
  it("binds the signed cart to its market and expiry", () => {
    const token = signCartCookie(id, "au", secret, 1000);
    expect(readCartCookie(token, "au", secret, 1001)).toBe(id);
    expect(readCartCookie(token, "sg", secret, 1001)).toBeNull();
    expect(readCartCookie(token, "au", secret, 1000 + 30 * 86400)).toBeNull();
    expect(cartCookieName("au")).not.toBe(cartCookieName("sg"));
  });

  it("rejects unsigned, corrupted, and differently signed identifiers", () => {
    const token = signCartCookie(id, "au", secret, 1000);
    expect(readCartCookie(id, "au", secret, 1001)).toBeNull();
    expect(readCartCookie(`${token}x`, "au", secret, 1001)).toBeNull();
    expect(readCartCookie(token, "au", `${secret}x`, 1001)).toBeNull();
    expect(readCartCookie(undefined, "au", secret, 1001)).toBeNull();
  });
});
