export function isProcessGroupAlive(pgid: number | undefined): boolean;

export function signalProcessGroup(
  pgid: number | undefined,
  signal: NodeJS.Signals,
): boolean;

export function waitForProcessGroupExit(
  pgid: number | undefined,
  timeoutMs: number,
  pollIntervalMs?: number,
): Promise<boolean>;

export function terminateProcessGroup(options?: {
  pgid?: number;
  termGraceMs?: number;
  killWaitMs?: number;
  pollIntervalMs?: number;
  onEscalate?: () => void;
}): Promise<boolean>;
