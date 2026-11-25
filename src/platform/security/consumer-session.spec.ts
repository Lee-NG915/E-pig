import { describe, expect, it } from "vitest";

import { readConsumerSession, signConsumerSession } from "./consumer-session";
import { consumeOAuthState, issueOAuthState } from "./oauth-state";

const secret = "test-consumer-secret-32-characters-min";
const session = { githubId: "55341019", login: "Lee-NG915" };

describe("consumer session", () => {
  it("round-trips a signed session", () => {
    const token = signConsumerSession(session, secret);
    expect(readConsumerSession(token, secret)).toEqual(session);
  });

  it("rejects tampered payloads and wrong secrets", () => {
    const token = signConsumerSession(session, secret);
    expect(readConsumerSession(token, "wrong-secret-32-characters-minimum")).toBeNull();
    expect(readConsumerSession(`${token}x`, secret)).toBeNull();
    expect(readConsumerSession("", secret)).toBeNull();
    expect(readConsumerSession(undefined, secret)).toBeNull();
  });

  it("rejects expired sessions", () => {
    const now = Date.now() / 1000;
    const token = signConsumerSession(session, secret, now - 9 * 3600);
    expect(readConsumerSession(token, secret, now)).toBeNull();
  });

  it("rejects malformed identities", () => {
    const bad = signConsumerSession({ githubId: "not-a-number", login: "x" }, secret);
    expect(readConsumerSession(bad, secret)).toBeNull();
  });
});

describe("oauth state", () => {
  it("accepts a fresh state only once", () => {
    const state = issueOAuthState();
    expect(consumeOAuthState(state)).toBe(true);
    expect(consumeOAuthState(state)).toBe(false);
  });

  it("rejects unknown states", () => {
    expect(consumeOAuthState("forged-state")).toBe(false);
  });
});
