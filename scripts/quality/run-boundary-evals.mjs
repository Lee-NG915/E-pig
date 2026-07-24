#!/usr/bin/env node
/**
 * Automated harness evals for import-boundary rules (eslint no-restricted-imports).
 *
 * 在 src/modules/ 下临时写入 fixture 文件并调用 eslint CLI：
 *   - 相对路径指向 adapters → 必须报错（no-restricted-imports）
 *   - 供应商 SDK（posthog-js）→ 必须报错（no-restricted-imports）
 *   - 合规 import（@/core/contracts）→ 必须通过
 * fixture 在 finally 中清理，不会留在仓库里。
 *
 * Usage: node scripts/quality/run-boundary-evals.mjs
 * Exit: 0 all pass; 1 any fail.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, "src/modules/__harness_eval_fixture__");

/** @typedef {{ id: string, file: string, content: string, expectLintError: boolean }} Case */

/** @type {Case[]} */
const CASES = [
  {
    id: "blocks-relative-path-adapter-import",
    file: "relative-adapter-import.ts",
    content:
      "import { mockCatalogPort } from \"../../adapters/commerce/mock\";\n\nexport const probe = mockCatalogPort;\n",
    expectLintError: true,
  },
  {
    id: "blocks-vendor-sdk-import",
    file: "vendor-sdk-import.ts",
    content: "import posthog from \"posthog-js\";\n\nexport const probe = posthog;\n",
    expectLintError: true,
  },
  {
    id: "allows-core-contracts-import",
    file: "clean-core-import.ts",
    content:
      "import type { Cart } from \"@/core/contracts/commerce\";\n\nexport const harnessEvalProbe: Cart | null = null;\n",
    expectLintError: false,
  },
];

function runCase(c) {
  const fixturePath = path.join(FIXTURE_DIR, c.file);
  fs.writeFileSync(fixturePath, c.content, "utf8");
  try {
    const result = spawnSync("npx", ["eslint", path.relative(ROOT, fixturePath)], {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
    });
    const exit = result.status ?? 1;
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const errors = [];

    if (c.expectLintError) {
      if (exit === 0) {
        errors.push("eslint exited 0 (expected boundary violation)");
      }
      if (!output.includes("no-restricted-imports")) {
        errors.push(`output missing "no-restricted-imports": ${output.slice(0, 300)}`);
      }
    } else if (exit !== 0) {
      errors.push(`eslint exited ${exit} on clean fixture: ${output.slice(0, 300)}`);
    }

    return { id: c.id, ok: errors.length === 0, errors };
  } finally {
    fs.rmSync(fixturePath, { force: true });
  }
}

function main() {
  let failed = 0;
  process.stdout.write("\n[harness-evals] import-boundary (eslint no-restricted-imports)\n");

  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  try {
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
  } finally {
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }

  if (failed > 0) {
    process.stdout.write(`[harness-evals] FAILED — ${failed}/${CASES.length}\n\n`);
    process.exit(1);
  }
  process.stdout.write(`[harness-evals] PASS — ${CASES.length}/${CASES.length}\n\n`);
  process.exit(0);
}

main();
