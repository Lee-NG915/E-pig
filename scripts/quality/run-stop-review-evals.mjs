#!/usr/bin/env node
/**
 * Automated harness evals for stop-review.sh (Claude Stop hook 阻断语义).
 *
 * 通过 STOP_REVIEW_DIFF_CHECK_CMD 注入假 diff-check，验证：
 *   - diff-check 失败（exit != 0）→ stop-review 打印 {"decision":"block",...} 且 exit 2
 *   - diff-check 成功 / 仅 warn（exit 0）→ stop-review exit 0
 *
 * Usage: node scripts/quality/run-stop-review-evals.mjs
 * Exit: 0 all pass; 1 any fail.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const HOOK = path.join(ROOT, "scripts/quality/stop-review.sh");

/** @typedef {{ id: string, diffCheckBody: string, expectExit: number, mustInclude?: string[] }} Case */

/** @type {Case[]} */
const CASES = [
  {
    id: "blocks-with-exit-2-on-diff-check-failure",
    diffCheckBody: "#!/usr/bin/env bash\necho '[ERR] simulated lint error'\nexit 1\n",
    expectExit: 2,
    mustInclude: ['"decision":"block"'],
  },
  {
    id: "exit-0-on-diff-check-success",
    diffCheckBody: "#!/usr/bin/env bash\necho '[OK] All quality checks passed.'\nexit 0\n",
    expectExit: 0,
  },
  {
    id: "exit-0-on-diff-check-warn-only",
    diffCheckBody: "#!/usr/bin/env bash\necho '[WARN] companions missing'\nexit 0\n",
    expectExit: 0,
  },
];

function runCase(c, fakeCmd) {
  const result = spawnSync("bash", [HOOK], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, STOP_REVIEW_DIFF_CHECK_CMD: fakeCmd },
  });

  const exit = result.status ?? 1;
  const stdout = result.stdout ?? "";
  const errors = [];

  if (exit !== c.expectExit) {
    errors.push(`exit ${exit} (expected ${c.expectExit})`);
  }
  for (const needle of c.mustInclude || []) {
    if (!stdout.includes(needle)) {
      errors.push(`stdout missing ${JSON.stringify(needle)}`);
    }
  }

  return { id: c.id, ok: errors.length === 0, errors };
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stop-review-evals-"));
  let failed = 0;
  process.stdout.write("\n[harness-evals] stop-review.sh\n");

  try {
    for (const c of CASES) {
      const fakeCmd = path.join(tmp, `${c.id}.sh`);
      fs.writeFileSync(fakeCmd, c.diffCheckBody, { mode: 0o755 });
      const r = runCase(c, fakeCmd);
      if (r.ok) {
        process.stdout.write(`  PASS  ${r.id}\n`);
      } else {
        failed += 1;
        process.stdout.write(`  FAIL  ${r.id}\n`);
        for (const e of r.errors) process.stdout.write(`        - ${e}\n`);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (failed > 0) {
    process.stdout.write(`[harness-evals] FAILED — ${failed}/${CASES.length}\n\n`);
    process.exit(1);
  }
  process.stdout.write(`[harness-evals] PASS — ${CASES.length}/${CASES.length}\n\n`);
  process.exit(0);
}

main();
