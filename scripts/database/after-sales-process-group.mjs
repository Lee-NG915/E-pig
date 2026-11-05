import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_POLL_INTERVAL_MS = 25;

/**
 * A detached child is the leader of its own process group, so the negative pid
 * addresses every member, including workers that outlive the leader.
 */
export function isProcessGroupAlive(pgid) {
  if (!Number.isInteger(pgid) || pgid <= 0) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    // EPERM still means a member exists; only ESRCH proves the group is gone.
    return error?.code === "EPERM";
  }
}

export function signalProcessGroup(pgid, signal) {
  if (!Number.isInteger(pgid) || pgid <= 0) return false;
  try {
    process.kill(-pgid, signal);
    return true;
  } catch {
    // ESRCH: the group already exited; nothing else is owned here.
    return false;
  }
}

export async function waitForProcessGroupExit(
  pgid,
  timeoutMs,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (isProcessGroupAlive(pgid)) {
    if (Date.now() >= deadline) return false;
    await delay(pollIntervalMs);
  }
  return true;
}

/**
 * Bounded, group-wide termination: SIGTERM, wait for every member to disappear,
 * then SIGKILL and wait again. Returns true only when the group was observed
 * gone, including the case where the leader exited before this call.
 */
export async function terminateProcessGroup({
  pgid,
  termGraceMs = 5_000,
  killWaitMs = 2_000,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  onEscalate,
} = {}) {
  if (!isProcessGroupAlive(pgid)) return true;
  signalProcessGroup(pgid, "SIGTERM");
  if (await waitForProcessGroupExit(pgid, termGraceMs, pollIntervalMs)) return true;
  onEscalate?.();
  signalProcessGroup(pgid, "SIGKILL");
  return waitForProcessGroupExit(pgid, killWaitMs, pollIntervalMs);
}
