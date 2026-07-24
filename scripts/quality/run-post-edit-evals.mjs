#!/usr/bin/env node
/**
 * Automated harness evals for post-edit-check.sh (stdin → stdout / exit 0).
 * Cheapest "who tests the tester" coverage; see .claude/evals/README.md.
 *
 * Usage: node scripts/quality/run-post-edit-evals.mjs
 * Exit: 0 all pass; 1 any fail.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const HOOK = path.join(ROOT, "scripts/quality/post-edit-check.sh");

/** @typedef {{ id: string, stdin: string, expectExit: number, mustInclude?: string[], mustBeEmpty?: boolean }} Case */

/** @type {Case[]} */
const CASES = [
  {
    id: "silent-on-unrelated-file",
    stdin: JSON.stringify({ tool_input: { file_path: "src/shared/lib/money.ts" } }),
    expectExit: 0,
    mustBeEmpty: true,
  },
  {
    id: "warns-on-env-file",
    stdin: JSON.stringify({ tool_input: { file_path: "src/platform/config/env.ts" } }),
    expectExit: 0,
    mustInclude: ["[WARN] [Quality]", "NEXT_PUBLIC_", "process.env"],
  },
];

function runCase(c) {
  const result = spawnSync("bash", [HOOK], {
    cwd: ROOT,
    input: c.stdin,
    encoding: "utf8",
    env: process.env,
  });

  const exit = result.status ?? 1;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const errors = [];

  if (exit !== c.expectExit) {
    errors.push(`exit ${exit} (expected ${c.expectExit})`);
  }
  if (c.mustBeEmpty) {
    if (stdout.trim() !== "" || stderr.trim() !== "") {
      errors.push(`expected empty output, got stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`);
    }
  }
  for (const needle of c.mustInclude || []) {
    if (!stdout.includes(needle)) {
      errors.push(`stdout missing ${JSON.stringify(needle)}`);
    }
  }

  return { id: c.id, ok: errors.length === 0, errors, stdout };
}

function main() {
  let failed = 0;
  process.stdout.write("\n[harness-evals] post-edit-check.sh\n");

  for (const c of CASES) {
    const r = runCase(c);
    if (r.ok) {
      process.stdout.write(`  PASS  ${r.id}\n`);
    } else {
      failed += 1;
      process.stdout.write(`  FAIL  ${r.id}\n`);
      for (const e of r.errors) process.stdout.write(`        - ${e}\n`);
    }
  }

  if (failed > 0) {
    process.stdout.write(`[harness-evals] FAILED — ${failed}/${CASES.length}\n\n`);
    process.exit(1);
  }
  process.stdout.write(`[harness-evals] PASS — ${CASES.length}/${CASES.length}\n\n`);
  process.exit(0);
}

main();
