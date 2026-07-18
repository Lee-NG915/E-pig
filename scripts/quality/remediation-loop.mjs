#!/usr/bin/env node
/**
 * remediation-loop.mjs
 *
 * 通用"修复-验证收敛器"：单次执行校验器。
 * 调用方（agent）持有循环状态——每轮先批量应用修复，再用递增的 --attempt
 * 重新调用本脚本并回传状态 flags。本脚本只验证，从不修改代码。
 *
 * 执行的检查（按序，任一失败即停）：
 *   1. typecheck  (--typecheck-cmd, 默认 "pnpm typecheck")
 *   2. lint       (--lint-cmd,      默认 "pnpm lint")
 *   3. test       (--test-cmd,      默认 "pnpm test")
 *
 * 强制 invariants（循环状态由调用方通过 CLI flags 传入）：
 *   - empty-diff                       本轮没有 git diff → ESCALATE
 *   - same-diff-consecutive-attempts   与 --previous-diff-hash 相同 → ESCALATE
 *   - no-regression                    --check-passed-before 已设但当前挂 → ESCALATE
 *   - same-check-output-twice          压缩失败输出与 --previous-check-output 相同 → ESCALATE
 *   - hard-rule-or-blocked-path        命中 hard-rule 正则 → ESCALATE（不烧次数）
 *   - max attempts                     attempt >= max → ESCALATE
 *   - 其余 → 返回 retry record（escalate:false + current_check_compact_output
 *     + current_diff_hash，供下一轮回传）
 *
 * transient 正则只影响 reason 文案，不改变判定。
 *
 * 用法：
 *   node scripts/quality/remediation-loop.mjs \
 *     --run-id <uuid> \
 *     [--typecheck-cmd "pnpm typecheck"] \
 *     [--lint-cmd "pnpm lint"] \
 *     [--test-cmd "pnpm test"] \
 *     [--attempt <n>] [--max-attempts <n>] \
 *     [--previous-diff-hash <hash>] \
 *     [--previous-check-output <str>] \
 *     [--check-passed-before]
 *
 * 退出码：
 *   0  → 全部检查通过
 *   1  → 失败；看 JSON 的 escalate 字段：true = 停止交人，false = 修复后带
 *         递增 --attempt 重调
 *
 * 输出契约：stdout 恒为单行 JSON：
 *   {status, summary, escalate, escalate_reason?, attempt, max_attempts,
 *    violations_remaining?, changed_files, current_diff_hash?,
 *    current_check_compact_output?, next_actions, artifacts, duration_seconds}
 * 每次调用 append 一行 JSON 到 logs/remediation-<run-id>.json。
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const LOG_DIR = 'logs';
const MAX_ARTIFACT_LINES = 5;

const HARD_RULE_RE =
  /(hard-rule|hard rule|blocked path|must not|forbidden|do not add|integration blocked)/i;
const TRANSIENT_RE =
  /(timeout|timed out|econnreset|eai_again|enotfound|network error|socket hang up|temporar)/i;

function resolveLogPath(runId) {
  return path.resolve(process.cwd(), LOG_DIR, `remediation-${runId}.json`);
}

function logToFile(runId, record) {
  try {
    const logPath = resolveLogPath(runId);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // 日志失败不影响主流程
  }
}

function runCommand(cmd, { timeoutMs = 600_000, maxBuffer = 4 * 1024 * 1024 } = {}) {
  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      cwd: process.cwd(),
      maxBuffer,
      timeout: timeoutMs,
      shell: '/bin/sh',
    });
    return { exitCode: 0, output };
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}` || String(error.message || error);
    return { exitCode: error.status || 1, output };
  }
}

/**
 * macOS 可移植性：优先 shasum -a 256（macOS 自带），其次 sha256sum（GNU），
 * 都没有则退回 node:crypto。
 */
function getDiffHash() {
  try {
    execSync('command -v shasum', { stdio: 'ignore', shell: '/bin/sh' });
    return execSync('git diff HEAD | shasum -a 256', {
      encoding: 'utf8',
      cwd: process.cwd(),
      shell: '/bin/sh',
    }).trim();
  } catch {
    // shasum 不可用，继续探测
  }
  try {
    execSync('command -v sha256sum', { stdio: 'ignore', shell: '/bin/sh' });
    return execSync('git diff HEAD | sha256sum', {
      encoding: 'utf8',
      cwd: process.cwd(),
      shell: '/bin/sh',
    }).trim();
  } catch {
    // sha256sum 也不可用，退回 node:crypto
  }
  try {
    const diff = execSync('git diff HEAD', {
      encoding: 'utf8',
      cwd: process.cwd(),
      maxBuffer: 16 * 1024 * 1024,
    });
    return createHash('sha256').update(diff).digest('hex');
  } catch {
    return '';
  }
}

function hasWorkingDiff() {
  try {
    execSync('git diff --quiet HEAD', { cwd: process.cwd() });
    return false;
  } catch {
    return true;
  }
}

function getDiffFiles() {
  try {
    return execSync('git diff --name-only HEAD', { encoding: 'utf8', cwd: process.cwd() })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function stripAnsi(value) {
  return value.replaceAll(/\[[0-9;]*m/g, '');
}

function topNonEmptyLines(output, maxLines = MAX_ARTIFACT_LINES) {
  return stripAnsi(output)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

/**
 * 解析失败输出为 {file, line, rule, message} 列表：
 * - tsc 风格:   src/foo.ts(12,5): error TS2322: message
 * - eslint unix 风格: src/foo.tsx:12:5: message [rule-name]
 */
function parseCheckViolations(output) {
  const lines = topNonEmptyLines(output, 40);
  const parsed = [];
  for (const line of lines) {
    const tscMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.*)$/i);
    if (tscMatch) {
      parsed.push({
        file: tscMatch[1],
        line: tscMatch[2],
        rule: tscMatch[5],
        message: tscMatch[6] || 'TypeScript error',
      });
      continue;
    }
    const eslintMatch = line.match(/^(.+?):(\d+):(\d+):\s*(.+?)(?:\s+\[([^\]]+)\])?$/);
    if (eslintMatch && /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(eslintMatch[1])) {
      parsed.push({
        file: eslintMatch[1],
        line: eslintMatch[2],
        rule: eslintMatch[5] || 'lint_violation',
        message: eslintMatch[4] || 'Lint violation',
      });
    }
  }
  if (parsed.length > 0) {
    return parsed;
  }
  const first = topNonEmptyLines(output, 1)[0] || 'Check failed';
  return [{ file: 'unknown', line: 'unknown', rule: 'check_failure', message: first }];
}

function buildEscalateRecord({
  summary,
  reason,
  attempt,
  maxAttempts,
  failedCheck,
  violations,
  diffFiles,
  currentDiffHash,
  logPath,
  durationSeconds,
}) {
  const primary = violations[0];
  const firstTarget =
    primary && primary.file !== 'unknown'
      ? `${primary.file}:${primary.line}`
      : 'remaining violations';
  return {
    status: 'error',
    summary,
    escalate: true,
    escalate_reason: reason,
    attempt,
    max_attempts: maxAttempts,
    ...(failedCheck ? { failed_check: failedCheck } : {}),
    violations_remaining: violations,
    changed_files: diffFiles,
    ...(currentDiffHash ? { current_diff_hash: currentDiffHash } : {}),
    next_actions: [
      `Manual investigation of ${firstTarget}`,
      'Do not report the task as complete',
    ],
    artifacts: [logPath],
    duration_seconds: durationSeconds,
    generated_at: new Date().toISOString(),
  };
}

function buildRetryRecord({
  summary,
  reason,
  attempt,
  maxAttempts,
  failedCheck,
  violations,
  diffFiles,
  currentDiffHash,
  compactOutput,
  logPath,
  durationSeconds,
}) {
  return {
    status: 'error',
    summary,
    escalate: false,
    escalate_reason: reason,
    attempt,
    max_attempts: maxAttempts,
    ...(failedCheck ? { failed_check: failedCheck } : {}),
    violations_remaining: violations,
    changed_files: diffFiles,
    current_diff_hash: currentDiffHash,
    current_check_compact_output: compactOutput,
    next_actions: ['Fix the failures and re-run this script with incremented --attempt'],
    artifacts: [logPath],
    duration_seconds: durationSeconds,
    generated_at: new Date().toISOString(),
  };
}

function emit(record) {
  // 输出契约：恒为单行 JSON
  process.stdout.write(JSON.stringify(record) + '\n');
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/quality/remediation-loop.mjs --run-id <uuid> [options]

通用修复-验证收敛器（单次执行校验）。调用方控制循环：批量修复后递增
--attempt 重新调用，并回传上一轮的状态 flags。

Required:
  --run-id <uuid>              本次收敛循环的唯一标识

Check commands (按 typecheck → lint → test 顺序执行):
  --typecheck-cmd <cmd>        默认 "pnpm typecheck"
  --lint-cmd <cmd>             默认 "pnpm lint"
  --test-cmd <cmd>             默认 "pnpm test"

Loop state (调用方持有，重调时回传):
  --attempt <n>                当前轮次（默认 1）
  --max-attempts <n>           最大轮次（默认 3）
  --previous-diff-hash <hash>  上一轮的 current_diff_hash
  --previous-check-output <s>  上一轮的 current_check_compact_output
  --check-passed-before        之前曾全绿过（本轮再挂即 no-regression ESCALATE）

  --help                       显示本帮助

输出：stdout 恒为单行 JSON；exit 0 = 全绿，exit 1 = 失败（看 escalate 字段）。
日志：每次调用 append 一行 JSON 到 logs/remediation-<run-id>.json。
`);
}

function main() {
  const startTime = Date.now();
  const { values } = parseArgs({
    options: {
      'run-id': { type: 'string' },
      'typecheck-cmd': { type: 'string', default: 'pnpm typecheck' },
      'lint-cmd': { type: 'string', default: 'pnpm lint' },
      'test-cmd': { type: 'string', default: 'pnpm test' },
      attempt: { type: 'string', default: '1' },
      'max-attempts': { type: 'string', default: '3' },
      'previous-diff-hash': { type: 'string' },
      'previous-check-output': { type: 'string' },
      'check-passed-before': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!values['run-id']) {
    const record = {
      status: 'error',
      summary: '--run-id is required',
      escalate: true,
      escalate_reason: 'missing_run_id',
      attempt: 1,
      max_attempts: 3,
      changed_files: [],
      next_actions: ['Re-run with --run-id <uuid>'],
      artifacts: [],
      duration_seconds: 0,
      generated_at: new Date().toISOString(),
    };
    emit(record);
    process.exit(1);
  }

  const runId = values['run-id'];
  const attempt = Number(values.attempt);
  const maxAttempts = Number(values['max-attempts']);
  const previousDiffHash = values['previous-diff-hash'] || '';
  const previousCheckOutput = values['previous-check-output'] || '';
  const checkPassedBefore = values['check-passed-before'];
  const logPath = resolveLogPath(runId);
  const elapsed = () => Math.round((Date.now() - startTime) / 1000);
  const failSummary = `Remediation verification failed on attempt ${attempt} of ${maxAttempts}`;

  const escalateAndExit = ({ reason, failedCheck, violations, diffFiles, currentDiffHash }) => {
    const record = buildEscalateRecord({
      summary: failSummary,
      reason,
      attempt,
      maxAttempts,
      failedCheck,
      violations,
      diffFiles,
      currentDiffHash,
      logPath,
      durationSeconds: elapsed(),
    });
    logToFile(runId, record);
    emit(record);
    process.exit(1);
  };

  // --- Invariant: empty diff ---
  const diffFiles = getDiffFiles();
  const currentDiffHash = getDiffHash();

  if (!hasWorkingDiff()) {
    escalateAndExit({
      reason: 'empty-diff',
      violations: [
        { file: 'unknown', line: 'unknown', rule: 'empty_diff', message: 'No code diff detected' },
      ],
      diffFiles: [],
      currentDiffHash,
    });
  }

  // --- Invariant: same diff between attempts ---
  if (previousDiffHash && currentDiffHash === previousDiffHash) {
    escalateAndExit({
      reason: 'same-diff-consecutive-attempts',
      violations: [
        {
          file: 'unknown',
          line: 'unknown',
          rule: 'same_fix_no_diff',
          message: 'Current attempt produced the same diff as previous attempt',
        },
      ],
      diffFiles,
      currentDiffHash,
    });
  }

  // --- 按序执行 typecheck → lint → test ---
  const checks = [
    { name: 'typecheck', cmd: values['typecheck-cmd'] },
    { name: 'lint', cmd: values['lint-cmd'] },
    { name: 'test', cmd: values['test-cmd'] },
  ];

  for (const check of checks) {
    const result = runCommand(check.cmd);
    if (result.exitCode === 0) {
      continue;
    }

    const output = result.output || '';
    const compactOutput = topNonEmptyLines(output, 30).join('\n');
    const violations = parseCheckViolations(output);

    // Invariant: no regression —— 之前全绿过，本轮又挂
    if (checkPassedBefore) {
      escalateAndExit({
        reason: 'no-regression-check-reverted',
        failedCheck: check.name,
        violations,
        diffFiles,
        currentDiffHash,
      });
    }

    // Invariant: 同一压缩失败输出连续两次 → 修复没有推进
    if (previousCheckOutput && previousCheckOutput === compactOutput) {
      escalateAndExit({
        reason: 'same-check-output-twice',
        failedCheck: check.name,
        violations,
        diffFiles,
        currentDiffHash,
      });
    }

    // hard-rule / blocked path → 直接 ESCALATE，不烧次数
    if (HARD_RULE_RE.test(compactOutput)) {
      escalateAndExit({
        reason: 'hard-rule-or-blocked-path',
        failedCheck: check.name,
        violations,
        diffFiles,
        currentDiffHash,
      });
    }

    const transient = TRANSIENT_RE.test(compactOutput);

    // 达到最大轮次 → ESCALATE（transient 只影响 reason 文案）
    if (attempt >= maxAttempts) {
      escalateAndExit({
        reason: transient
          ? 'transient-check-failure-at-max-attempts'
          : 'check-still-failing-after-max-attempts',
        failedCheck: check.name,
        violations,
        diffFiles,
        currentDiffHash,
      });
    }

    // 可重试：返回 retry record，调用方修复后递增 --attempt 重调
    const record = buildRetryRecord({
      summary: `${check.name} failed on attempt ${attempt} of ${maxAttempts}`,
      reason: transient ? 'transient-check-failure-retryable' : 'check-failure-retryable',
      attempt,
      maxAttempts,
      failedCheck: check.name,
      violations,
      diffFiles,
      currentDiffHash,
      compactOutput,
      logPath,
      durationSeconds: elapsed(),
    });
    logToFile(runId, record);
    emit(record);
    process.exit(1);
  }

  // --- 全绿 ---
  const record = {
    status: 'success',
    summary: `All quality checks passed on attempt ${attempt} (typecheck → lint → test)`,
    escalate: false,
    attempt,
    max_attempts: maxAttempts,
    checks_run: checks.map((check) => check.name),
    changed_files: diffFiles,
    current_diff_hash: currentDiffHash,
    next_actions: ['Quality gate green — proceed with the workflow'],
    artifacts: [logPath],
    duration_seconds: elapsed(),
    generated_at: new Date().toISOString(),
  };
  logToFile(runId, record);
  emit(record);
  process.exit(0);
}

try {
  main();
} catch (error) {
  const record = {
    status: 'error',
    summary: `Remediation loop crashed: ${error.message}`,
    escalate: true,
    escalate_reason: 'runtime_crash',
    attempt: 0,
    max_attempts: 0,
    violations_remaining: [
      { file: 'unknown', line: 'unknown', rule: 'runtime_crash', message: String(error.message || error) },
    ],
    changed_files: [],
    next_actions: ['Check environment and rerun', 'Escalate to a human if repeated'],
    artifacts: [],
    duration_seconds: 0,
    generated_at: new Date().toISOString(),
  };
  // 崩溃兜底：尽力记日志
  const runIdMatch = process.argv.find((arg, index) => arg === '--run-id' && process.argv[index + 1]);
  if (runIdMatch) {
    const runId = process.argv[process.argv.indexOf('--run-id') + 1];
    record.artifacts = [resolveLogPath(runId)];
    logToFile(runId, record);
  }
  emit(record);
  process.exit(1);
}
