#!/usr/bin/env node
/**
 * check-doc-sync.mjs
 *
 * 文档漂移锚点校验：把"同一事实写在两处"的表述收敛为可 grep 的字符串锚点。
 *
 * 校验点：
 *   1. AGENTS.md 的 Commands 章节必须包含 package.json 里的全部 scripts 名
 *      （逐个 substring 检查，缺一个即报）。
 *   2. README.md 必须包含 `pnpm dev` 与 `MARKET=`。
 *   3. README 的 MARKET_IDS marker 必须与 typed market registry 一致。
 *
 * 输出：
 *   默认：人读文本（[doc-sync] PASS / FAILED + 缺失清单）。
 *   --json：单行 JSON。
 *   缺失 → exit 1 + {status:'error', root_cause, safe_retry, mismatches:[{file, missing[]}]}
 *   全过 → exit 0。
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = process.cwd();
const AGENTS_PATH = path.join(ROOT, 'AGENTS.md');
const README_PATH = path.join(ROOT, 'README.md');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const MARKETS_PATH = path.join(ROOT, 'src/platform/config/markets.ts');

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * 提取 AGENTS.md 的 Commands 章节（## Commands 到下一个二级标题之间）。
 */
function extractCommandsSection(agentsContent) {
  const match = agentsContent.match(/^## Commands\s*$/m);
  if (!match || match.index === undefined) {
    return '';
  }
  const rest = agentsContent.slice(match.index + match[0].length);
  const nextHeading = rest.search(/^## /m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function emitJson(record) {
  process.stdout.write(JSON.stringify(record) + '\n');
}

function main() {
  const { values } = parseArgs({
    options: {
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write('Usage: node scripts/quality/check-doc-sync.mjs [--json] [--help]\n');
    process.exit(0);
  }

  const mismatches = [];

  // --- 锚点 1：AGENTS.md Commands 章节 ⊇ package.json scripts ---
  const pkg = JSON.parse(readFile(PACKAGE_PATH));
  const scriptNames = Object.keys(pkg.scripts || {});
  const agents = readFile(AGENTS_PATH);
  const commandsSection = extractCommandsSection(agents);

  if (!commandsSection) {
    mismatches.push({
      file: 'AGENTS.md',
      missing: ['missing section: ## Commands'],
    });
  } else {
    const missingScripts = scriptNames.filter((name) => !commandsSection.includes(name));
    if (missingScripts.length > 0) {
      mismatches.push({
        file: 'AGENTS.md',
        missing: missingScripts.map((name) => `missing script in Commands section: ${name}`),
      });
    }
  }

  // --- 锚点 2：README.md ⊇ {pnpm dev, MARKET=} ---
  const readme = readFile(README_PATH);
  const readmeMissing = ['pnpm dev', 'MARKET='].filter((snippet) => !readme.includes(snippet));
  if (readmeMissing.length > 0) {
    mismatches.push({
      file: 'README.md',
      missing: readmeMissing.map((snippet) => `missing snippet: ${snippet}`),
    });
  }

  // --- 锚点 3：README MARKET_IDS marker === markets.ts 中的显式 id ---
  const marketsSource = readFile(MARKETS_PATH);
  const registryIds = [...marketsSource.matchAll(/^\s+id:\s*"([a-z0-9-]+)",\s*$/gm)].map(
    (match) => match[1],
  );
  const marketMarker = readme.match(/<!-- MARKET_IDS:([^>]+) -->/);
  const readmeIds = marketMarker ? marketMarker[1].trim().split('|') : [];
  if (
    registryIds.length === 0 ||
    readmeIds.length !== registryIds.length ||
    readmeIds.some((id, index) => id !== registryIds[index])
  ) {
    mismatches.push({
      file: 'README.md',
      missing: [
        `MARKET_IDS marker must be: <!-- MARKET_IDS:${registryIds.join('|')} -->`,
      ],
    });
  }

  if (mismatches.length > 0) {
    const record = {
      status: 'error',
      summary: 'Docs are out of sync with package.json / project conventions',
      root_cause: 'Required anchor snippets missing from AGENTS.md or README.md',
      safe_retry: 'Align the reported files with the anchors, then rerun this script.',
      mismatches,
      generated_at: new Date().toISOString(),
    };
    if (values.json) {
      emitJson(record);
    } else {
      console.error('[doc-sync] FAILED — docs are out of sync');
      for (const mismatch of mismatches) {
        console.error(`- ${mismatch.file}`);
        for (const missing of mismatch.missing) {
          console.error(`  - ${missing}`);
        }
      }
      console.error('[doc-sync] Safe retry: align the reported files, then rerun this script.');
      console.error(JSON.stringify(record));
    }
    process.exit(1);
  }

  if (values.json) {
    emitJson({
      status: 'success',
      summary: 'Key docs are in sync',
      generated_at: new Date().toISOString(),
    });
  } else {
    process.stdout.write('[doc-sync] PASS — AGENTS.md Commands and README.md anchors are in sync.\n');
  }
  process.exit(0);
}

try {
  main();
} catch (error) {
  const record = {
    status: 'error',
    summary: `check-doc-sync crashed: ${error.message}`,
    root_cause: 'Failed to read AGENTS.md / README.md / package.json',
    safe_retry: 'Ensure the files exist at the repo root, then rerun this script.',
    generated_at: new Date().toISOString(),
  };
  const jsonOnly = process.argv.includes('--json');
  if (jsonOnly) {
    emitJson(record);
  } else {
    console.error(`[doc-sync] ERROR — ${record.summary}`);
    console.error(JSON.stringify(record));
  }
  process.exit(1);
}
