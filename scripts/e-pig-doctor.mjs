#!/usr/bin/env node
/**
 * e-pig-doctor.mjs — agent/skill setup health check (Saleor paper-doctor inspired).
 *
 * Checks:
 *   1. Canonical skills live under .agents/skills/
 *   2. Required project skills exist (e-pig, e-pig-dev-loop)
 *   3. Community skills from skills-lock.json are present
 *   4. .claude/skills entries resolve (symlink or directory)
 *   5. Compiled AGENTS dump is quarantined via .cursorignore when present
 *
 * Exit 0 on pass; exit 1 on failures. --json for machine output.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const ROOT = process.cwd();
const AGENTS_SKILLS = path.join(ROOT, ".agents/skills");
const CLAUDE_SKILLS = path.join(ROOT, ".claude/skills");
const LOCK_PATH = path.join(ROOT, "skills-lock.json");
const CURSORIGNORE = path.join(ROOT, ".cursorignore");

const REQUIRED_PROJECT_SKILLS = ["e-pig", "e-pig-dev-loop"];

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    process.stdout.write("Usage: node scripts/e-pig-doctor.mjs [--json]\n");
    process.exit(0);
  }

  const errors = [];
  const warnings = [];

  if (!exists(AGENTS_SKILLS)) {
    errors.push(".agents/skills/ missing — project skills source of truth");
  }

  for (const name of REQUIRED_PROJECT_SKILLS) {
    const skillMd = path.join(AGENTS_SKILLS, name, "SKILL.md");
    if (!exists(skillMd)) {
      errors.push(`missing project skill: .agents/skills/${name}/SKILL.md`);
    }
  }

  if (exists(LOCK_PATH)) {
    const lock = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
    for (const name of Object.keys(lock.skills || {})) {
      const skillMd = path.join(AGENTS_SKILLS, name, "SKILL.md");
      if (!exists(skillMd)) {
        errors.push(`skills-lock entry missing on disk: ${name}`);
      }
    }
  } else {
    warnings.push("skills-lock.json missing (community skills may be unmanaged)");
  }

  if (exists(CLAUDE_SKILLS)) {
    for (const entry of fs.readdirSync(CLAUDE_SKILLS)) {
      const full = path.join(CLAUDE_SKILLS, entry);
      try {
        fs.statSync(full);
      } catch {
        errors.push(`.claude/skills/${entry} is a broken symlink/path`);
      }
    }
  } else {
    warnings.push(".claude/skills/ missing");
  }

  const compiledAgents = path.join(AGENTS_SKILLS, "e-pig", "AGENTS.md");
  if (exists(compiledAgents)) {
    const ignore = exists(CURSORIGNORE)
      ? fs.readFileSync(CURSORIGNORE, "utf8")
      : "";
    if (!ignore.includes(".agents/skills/e-pig/AGENTS.md")) {
      errors.push(
        "compiled .agents/skills/e-pig/AGENTS.md exists but is not listed in .cursorignore",
      );
    }
  }

  const ok = errors.length === 0;
  if (values.json) {
    process.stdout.write(
      JSON.stringify({ status: ok ? "ok" : "error", errors, warnings }) + "\n",
    );
  } else {
    process.stdout.write(ok ? "[doctor] PASS\n" : "[doctor] FAILED\n");
    for (const w of warnings) process.stdout.write(`  warn: ${w}\n`);
    for (const e of errors) process.stdout.write(`  error: ${e}\n`);
  }
  process.exit(ok ? 0 : 1);
}

main();
