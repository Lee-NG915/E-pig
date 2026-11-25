import "server-only";

import { randomBytes } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;
const states = new Map<string, number>();

/** Single-use OAuth state for the single-process deployment; multi-instance needs shared storage. */
export function issueOAuthState(): string {
  const now = Date.now();
  for (const [key, created] of states) {
    if (now - created > STATE_TTL_MS) states.delete(key);
  }
  const state = randomBytes(24).toString("base64url");
  states.set(state, now);
  return state;
}

export function consumeOAuthState(state: string): boolean {
  const created = states.get(state);
  if (created === undefined) return false;
  states.delete(state);
  return Date.now() - created <= STATE_TTL_MS;
}
