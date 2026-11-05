import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

/**
 * Dedicated process-group lifecycle for the isolated PostgreSQL runner. The
 * test command is spawned as its own group so a timeout or an external
 * SIGINT/SIGTERM reaches pnpm and every Vitest worker it owns.
 */
export function runInProcessGroup({
  command,
  args,
  cwd,
  env,
  stdio = "inherit",
  timeoutMs,
  termGraceMs,
  groupExitTimeoutMs = termGraceMs + 5_000,
  signal,
  onTimeout,
}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio,
      detached: true,
    });
    const pgid = child.pid;
    let settled = false;
    let terminationReason = null;
    let timeoutTimer;
    let killTimer;

    const killGroup = (killSignal) => {
      if (!pgid) return;
      try {
        process.kill(-pgid, killSignal);
      } catch {
        // ESRCH: the group already exited; nothing else is owned here.
      }
    };

    const groupAlive = () => {
      if (!pgid) return false;
      try {
        process.kill(-pgid, 0);
        return true;
      } catch (error) {
        return error.code === "EPERM";
      }
    };

    const waitForGroupExit = async () => {
      const deadline = Date.now() + groupExitTimeoutMs;
      while (groupAlive() && Date.now() < deadline) {
        await delay(25);
      }
      if (groupAlive()) {
        killGroup("SIGKILL");
        const killDeadline = Date.now() + 1_000;
        while (groupAlive() && Date.now() < killDeadline) {
          await delay(25);
        }
      }
      return !groupAlive();
    };

    const finalize = async (code, exitSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      signal?.removeEventListener("abort", onAbort);

      let groupExited = true;
      if (terminationReason) {
        groupExited = await waitForGroupExit();
      }
      clearTimeout(killTimer);
      resolve({
        code,
        signal: exitSignal,
        timedOut: terminationReason === "timeout",
        aborted: terminationReason === "abort",
        groupExited,
      });
    };

    const requestTermination = (reason) => {
      if (terminationReason) return;
      terminationReason = reason;
      killGroup("SIGTERM");
      killTimer = setTimeout(() => {
        killGroup("SIGKILL");
      }, termGraceMs);
    };

    const onAbort = () => requestTermination("abort");

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (terminationReason) return;
        onTimeout?.();
        requestTermination("timeout");
      }, timeoutMs);
    }

    if (signal) {
      if (signal.aborted) {
        requestTermination("abort");
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      resolve({
        code: null,
        signal: null,
        timedOut: false,
        aborted: false,
        groupExited: true,
        spawnError: error,
      });
    });

    child.once("exit", (code, exitSignal) => {
      void finalize(code, exitSignal);
    });
  });
}
