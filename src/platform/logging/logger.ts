/**
 * 轻量 logger facade（04 §2）：业务代码只依赖这个门面，
 * server 端后续可换成 Pino 实现而不改调用方。
 * 输出始终是结构化 JSON 行，event 命名用 `domain.action`（如 `cart.created`）。
 *
 * 注意：本模块不读取 process.env —— LOG_LEVEL 由 platform/config/env.ts
 * 在 schema 校验后调用 setLogLevel 注入（logger 必须在 env 失败时也可用）。
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

export type LogFields = Record<string, unknown>;

export type Logger = {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
};

function write(level: LogLevel, bindings: LogFields, event: string, fields?: LogFields) {
  if (levelPriority[level] < levelPriority[currentLevel]) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    event,
    ...bindings,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** 创建带绑定字段的子 logger（如 { module: "cart" }）。 */
export function createLogger(bindings: LogFields = {}): Logger {
  return {
    debug: (event, fields) => write("debug", bindings, event, fields),
    info: (event, fields) => write("info", bindings, event, fields),
    warn: (event, fields) => write("warn", bindings, event, fields),
    error: (event, fields) => write("error", bindings, event, fields),
  };
}

export const logger = createLogger();
