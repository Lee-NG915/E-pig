#!/usr/bin/env node
/**
 * check-component-companions.mjs
 *
 * Component-folder harness Static/Gate (H1):
 * When a main component .tsx changes (or --report-all), verify companion files exist:
 *   - *.spec.ts / *.spec.tsx  (always for in-scope components)
 *   - *.stories.tsx           (happy-dog always; modules when allowlist flag on)
 *   - *.md with 状态矩阵/用户故事 (module folder-shaped when requireMd)
 *   - CF-1: flat impl must be listed in allowlist.legacyFlatFiles
 *
 * Supports:
 *   - folder shape: components/foo/foo.tsx
 *   - flat legacy:  components/foo.tsx (only if in legacyFlatFiles)
 *
 * Usage:
 *   node scripts/quality/check-component-companions.mjs
 *   node scripts/quality/check-component-companions.mjs --report-all
 *   node scripts/quality/check-component-companions.mjs --level=error
 *   node scripts/quality/check-component-companions.mjs --json
 *
 * Exit: warn level → always 0 (violations printed); error level → 1 if violations.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const ROOT = process.cwd();
const ALLOWLIST_PATH = path.join(ROOT, "scripts/quality/component-folder-allowlist.json");
const LOG_PATH = path.join(ROOT, "logs/component-folder-companions.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function escapeRegex(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

// Minimal glob: supports "**/name", "**/*.<ext>", and exact basenames.
function matchesIgnore(relPosix, patterns) {
  const base = path.posix.basename(relPosix);
  return patterns.some((pat) => {
    if (pat.startsWith("**/")) {
      const rest = pat.slice(3);
      if (rest.startsWith("*.")) {
        const suffix = rest.slice(1); // ".spec.tsx"
        return base.endsWith(suffix);
      }
      return base === rest || relPosix.endsWith("/" + rest);
    }
    if (pat.includes("*")) {
      const re = new RegExp("^" + escapeRegex(pat).replace(/\\\*/g, "[^/]*") + "$");
      return re.test(relPosix) || re.test(base);
    }
    return relPosix === pat || base === pat;
  });
}

function listGitTouchedTsx() {
  const cmds = [
    "git diff --name-only HEAD",
    "git diff --name-only --cached",
    "git ls-files --others --exclude-standard",
  ];
  const files = new Set();
  for (const cmd of cmds) {
    try {
      const out = execSync(cmd, { encoding: "utf8", cwd: ROOT });
      for (const line of out.split("\n")) {
        const f = line.trim();
        if (f && /\.(tsx|ts)$/.test(f)) files.add(f);
      }
    } catch {
      // not a git repo / empty
    }
  }
  return [...files].filter((f) => fs.existsSync(path.join(ROOT, f)));
}

function walkComponents(dirRel) {
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  function walk(current) {
    for (const ent of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "parts" || ent.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(ent.name)) continue;
      out.push(toPosix(path.relative(ROOT, full)));
    }
  }
  walk(abs);
  return out;
}

function moduleComponentDirs(allowlist) {
  // Prefer moduleComponentDirs; keep moduleComponentGlobs as deprecated alias.
  const dirs = allowlist.moduleComponentDirs || allowlist.moduleComponentGlobs || [];
  return dirs.map(toPosix);
}

function legacyFlatSet(allowlist) {
  return new Set((allowlist.legacyFlatFiles || []).map(toPosix));
}

function resolveComponentTarget(relPosix, allowlist) {
  if (matchesIgnore(relPosix, allowlist.ignoreFilePatterns || [])) return null;

  const happyRoot = toPosix(allowlist.happyDogComponentsDir);
  const moduleRoots = moduleComponentDirs(allowlist);

  const isHappy = relPosix.startsWith(happyRoot + "/") || relPosix === happyRoot;
  const isModule = moduleRoots.some((root) => relPosix.startsWith(root + "/") || relPosix === root);
  if (!isHappy && !isModule) return null;

  const base = path.posix.basename(relPosix);
  const stem = base.replace(/\.(tsx|ts)$/, "");
  const dir = path.posix.dirname(relPosix);
  const parentName = path.posix.basename(dir);

  // folder shape: …/foo/foo.tsx
  if (parentName === stem) {
    return {
      kind: "folder",
      impl: relPosix,
      stem,
      dir,
      isHappy,
      isModule,
    };
  }

  // flat legacy: …/components/foo.tsx (parent directory named components)
  if (parentName === "components" || parentName === path.posix.basename(happyRoot)) {
    return {
      kind: "flat",
      impl: relPosix,
      stem,
      dir,
      isHappy,
      isModule,
    };
  }

  // nested under parts/ — only enforce if file name matches parent folder (rare)
  if (dir.includes("/parts/")) {
    return null;
  }

  return null;
}

function companionPaths(target) {
  const { dir, stem } = target;
  return {
    specTs: `${dir}/${stem}.spec.ts`,
    specTsx: `${dir}/${stem}.spec.tsx`,
    stories: `${dir}/${stem}.stories.tsx`,
    md: `${dir}/${stem}.md`,
  };
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function mdHasRequiredHeading(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  // \b 对 CJK 永远失配（CJK 非 \w），改用否定前瞻：标题词后不得紧跟 ASCII word 字符。
  return /^##\s*(状态矩阵|用户故事)(?![A-Za-z0-9_])/m.test(text);
}

function checkTarget(target, allowlist) {
  const c = companionPaths(target);
  const missing = [];
  const legacyFlat = legacyFlatSet(allowlist);

  if (target.kind === "flat" && !legacyFlat.has(target.impl)) {
    missing.push({
      ruleId: "CF-1",
      missing:
        "folder shape (…/<name>/<name>.tsx) — flat not in legacyFlatFiles; migrate or register",
    });
  }

  const hasSpec = fileExists(c.specTs) || fileExists(c.specTsx);
  if (!hasSpec) missing.push({ ruleId: "CF-2", missing: "spec (.spec.ts|.spec.tsx)" });

  if (target.isHappy) {
    if (!fileExists(c.stories)) missing.push({ ruleId: "CF-3", missing: "stories (.stories.tsx)" });
  } else if (target.isModule && target.kind === "folder" && allowlist.requireStoriesForModuleFolders) {
    if (!fileExists(c.stories)) missing.push({ ruleId: "CF-3", missing: "stories (.stories.tsx)" });
  }

  if (target.isModule && target.kind === "folder" && allowlist.requireMdForModuleFolders) {
    if (!fileExists(c.md)) {
      missing.push({ ruleId: "CF-4", missing: "md (COMPONENT PRD)" });
    } else if (!mdHasRequiredHeading(c.md)) {
      missing.push({ ruleId: "CF-4", missing: "md heading ## 状态矩阵 or ## 用户故事" });
    }
  }

  if (missing.length === 0) return null;
  return {
    file: target.impl,
    kind: target.kind,
    scope: target.isHappy ? "happy-dog" : "module",
    missing,
  };
}

function main() {
  // pnpm 常以 `pnpm run X -- --flag` 转发，裸 `--` 会让后续 flag 变成 positional
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const { values } = parseArgs({
    args: argv,
    options: {
      "report-all": { type: "boolean", default: false },
      level: { type: "string", default: process.env.COMPANIONS_LEVEL || "warn" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(
      "Usage: node scripts/quality/check-component-companions.mjs [--report-all] [--level=warn|error] [--json]\n",
    );
    process.exit(0);
  }

  const level = values.level === "error" ? "error" : "warn";
  const allowlist = readJson(ALLOWLIST_PATH);

  let candidates;
  if (values["report-all"]) {
    const roots = [allowlist.happyDogComponentsDir, ...moduleComponentDirs(allowlist)];
    candidates = roots.flatMap((r) => walkComponents(r));
  } else {
    candidates = listGitTouchedTsx();
  }

  const targets = [];
  const seen = new Set();
  for (const rel of candidates) {
    const relPosix = toPosix(rel);
    const target = resolveComponentTarget(relPosix, allowlist);
    if (!target || seen.has(target.impl)) continue;
    seen.add(target.impl);
    targets.push(target);
  }

  const violations = [];
  for (const t of targets) {
    const v = checkTarget(t, allowlist);
    if (v) violations.push(v);
  }

  const payload = {
    status: violations.length === 0 ? "success" : level === "error" ? "error" : "warning",
    summary:
      violations.length === 0
        ? `[companions] PASS — checked ${targets.length} component(s)`
        : `[companions] ${level.toUpperCase()} — ${violations.length} component(s) missing companions (checked ${targets.length})`,
    level,
    checked: targets.length,
    violation_count: violations.length,
    violations,
    next_actions:
      violations.length === 0
        ? []
        : [
            "Add missing .spec / .stories / .md beside the component",
            "CF-1: migrate to …/<name>/<name>.tsx or add path to allowlist.legacyFlatFiles",
            "See docs/engineering/component-workflow-guide.md",
            level === "warn" ? "Currently warn-only; set --level=error or COMPANIONS_LEVEL=error to fail CI" : "Fix before merge",
          ],
    artifacts: [toPosix(path.relative(ROOT, LOG_PATH))],
    generated_at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

  if (values.json) {
    process.stdout.write(JSON.stringify(payload) + "\n");
  } else {
    process.stdout.write(`\n${payload.summary}\n`);
    for (const v of violations) {
      process.stdout.write(`  - ${v.file} [${v.scope}/${v.kind}]\n`);
      for (const m of v.missing) {
        process.stdout.write(`      missing: ${m.missing} (${m.ruleId})\n`);
      }
    }
    if (violations.length > 0) {
      process.stdout.write(`  log: ${payload.artifacts[0]}\n`);
      process.stdout.write(`  guide: docs/engineering/component-workflow-guide.md\n\n`);
    } else {
      process.stdout.write("\n");
    }
  }

  if (level === "error" && violations.length > 0) process.exit(1);
  process.exit(0);
}

main();
