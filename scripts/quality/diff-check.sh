#!/usr/bin/env bash
# E-pig 质量定向检查：对 git diff 变更的 .ts/.tsx 文件跑 ESLint，崩溃时用
# 文本扫描兜底（优先 rg，缺失时退回 grep）。
# 对应 package.json 的 `pnpm quality:diff`。人类、CI、AI agent wrapper 共用。
#
# 用法：
#   bash scripts/quality/diff-check.sh                # 检查 unstaged + staged
#   bash scripts/quality/diff-check.sh --staged-only  # 只检查 staged
#
# 退出码：0 = 通过（或仅 warning），1 = 有 error / 无法判定
#
# 注意：ESLint 9 已把 unix formatter 移出核心，这里用 --format json + node
# 转成 unix 风格行（file:line:col: message [Severity/rule]）。fallback 触发
# 条件相应改为「无结构化输出且 ESLint 退出码非 0（即可能崩溃）」。
# ESLint 本身已能抓这三类问题（no-restricted-imports 已配），文本扫描
# fallback 只在 ESLint 崩溃时兜底。

set -euo pipefail

STAGED_ONLY=false
[[ "${1:-}" == "--staged-only" ]] && STAGED_ONLY=true
SUMMARY_FILE="logs/quality-diff-summary.json"

write_summary() {
  # $1=status $2=summary $3=next_actions(||分隔) $4=fallback_triggered $5=fallback_confidence $6=root_cause $7=safe_retry
  QD_STATUS="$1" QD_SUMMARY="$2" QD_NEXT_ACTIONS="$3" QD_FALLBACK="$4" \
  QD_CONFIDENCE="$5" QD_ROOT_CAUSE="$6" QD_SAFE_RETRY="$7" QD_FILE="$SUMMARY_FILE" \
  node -e "const fs=require('node:fs');
const payload={
  status: process.env.QD_STATUS,
  summary: process.env.QD_SUMMARY,
  next_actions: (process.env.QD_NEXT_ACTIONS||'').split('||').filter(Boolean),
  artifacts: [process.env.QD_FILE],
  fallback_triggered: process.env.QD_FALLBACK === 'true',
  fallback_confidence: process.env.QD_CONFIDENCE,
  ...(process.env.QD_ROOT_CAUSE ? { root_cause: process.env.QD_ROOT_CAUSE } : {}),
  ...(process.env.QD_SAFE_RETRY ? { safe_retry: process.env.QD_SAFE_RETRY } : {}),
  generated_at: new Date().toISOString(),
};
fs.mkdirSync(require('node:path').dirname(process.env.QD_FILE), { recursive: true });
fs.writeFileSync(process.env.QD_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');"
}

if $STAGED_ONLY; then
  FILES=$(git diff --name-only --cached 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
else
  CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
  STAGED=$(git diff --name-only --cached 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
  # 基线提交前的项目阶段，大量源码可能仍是 untracked；不扫它们等于没有门禁
  UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
  FILES=$(printf "%s\n%s\n%s" "$CHANGED" "$STAGED" "$UNTRACKED" | sort -u | grep -v '^$' || true)
fi

if [[ -z "$FILES" ]]; then
  echo "[OK] No TypeScript files changed."
  write_summary "success" "[OK] No TypeScript files changed." "" "false" "high" "" ""
  exit 0
fi

# 过滤掉已删除的文件
EXISTING_FILES=""
while IFS= read -r f; do
  [[ -f "$f" ]] && EXISTING_FILES="${EXISTING_FILES}${f}"$'\n'
done <<< "$FILES"
FILES=$(echo "$EXISTING_FILES" | grep -v '^$' || true)

if [[ -z "$FILES" ]]; then
  echo "[OK] No TypeScript files changed."
  write_summary "success" "[OK] No TypeScript files changed." "" "false" "high" "" ""
  exit 0
fi

FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
echo ""
echo "=================================================="
echo "  [INFO] E-pig Quality Diff Check"
echo "=================================================="
echo "Files scanned: $FILE_COUNT"
echo "$FILES" | while read -r f; do echo "  - $f"; done
echo ""

# 对变更文件跑 ESLint（json 格式 → node 转 unix 风格行）
set +e
ESLINT_OUTPUT=$(echo "$FILES" | xargs npx eslint --format json 2>&1)
ESLINT_EXIT=$?
set -e

RESULT=$(printf '%s' "$ESLINT_OUTPUT" | node -e "
let raw = '';
process.stdin.on('data', (c) => (raw += c)).on('end', () => {
  try {
    const start = raw.indexOf('[');
    if (start === -1) process.exit(0);
    const results = JSON.parse(raw.slice(start));
    const lines = [];
    for (const r of results) {
      for (const m of r.messages || []) {
        const sev = m.severity === 2 ? 'Error' : 'Warning';
        lines.push(\`\${r.filePath}:\${m.line}:\${m.column}: \${m.message} [\${sev}/\${m.ruleId || 'fatal'}]\`);
      }
    }
    process.stdout.write(lines.join('\n'));
  } catch {
    process.exit(0); // 非 JSON 输出（ESLint 崩溃）→ 无结构化结果
  }
});" || true)

FALLBACK_TRIGGERED=false

# Fallback 用的文本扫描器：优先 rg，缺失时退回 grep -nHE（输出均为 file:line:content）
if command -v rg >/dev/null 2>&1; then
  scan_files() { xargs rg -n --with-filename "$1" 2>/dev/null || true; }
else
  scan_files() { xargs grep -nHE "$1" 2>/dev/null || true; }
fi

# Fallback：ESLint 无结构化输出且退出码非 0（可能崩溃）→ 扫高危签名
if [[ -z "$RESULT" && "$ESLINT_EXIT" -ne 0 ]]; then
  FALLBACK_TRIGGERED=true
  FALLBACK_RESULT=""

  # 1) 公开变量放秘密：NEXT_PUBLIC_*SECRET/TOKEN/KEY/PASSWORD
  SECRET_RESULT=$(echo "$FILES" | scan_files "NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD)")
  if [[ -n "$SECRET_RESULT" ]]; then
    FALLBACK_RESULT="${FALLBACK_RESULT}"$'[ERR][grep-fallback] NEXT_PUBLIC_* variable looks like a secret:\n'"$SECRET_RESULT"$'\n'
  fi

  # 2) 依赖方向违规：src/modules/ 下 import @/adapters/ 或 @/integrations/
  MODULE_FILES=$(echo "$FILES" | grep "^src/modules/" || true)
  if [[ -n "$MODULE_FILES" ]]; then
    BOUNDARY_RESULT=$(echo "$MODULE_FILES" | scan_files "@/(adapters|integrations)/")
    if [[ -n "$BOUNDARY_RESULT" ]]; then
      FALLBACK_RESULT="${FALLBACK_RESULT}"$'[ERR][grep-fallback] src/modules/ importing @/adapters or @/integrations:\n'"$BOUNDARY_RESULT"$'\n'
    fi
  fi

  # 3) 绕过 env schema：src/ 下（除 src/platform/config/env.ts）直接读 process.env
  SRC_FILES=$(echo "$FILES" | grep "^src/" | grep -v "^src/platform/config/env.ts$" || true)
  if [[ -n "$SRC_FILES" ]]; then
    ENV_RESULT=$(echo "$SRC_FILES" | scan_files "process\.env\.")
    if [[ -n "$ENV_RESULT" ]]; then
      FALLBACK_RESULT="${FALLBACK_RESULT}"$'[ERR][grep-fallback] process.env read outside src/platform/config/env.ts:\n'"$ENV_RESULT"$'\n'
    fi
  fi

  if [[ -n "$FALLBACK_RESULT" ]]; then
    RESULT="$FALLBACK_RESULT"
  fi
fi

# ESLint 崩溃且 fallback 也无结果 → 无法安全判定
if [[ "$ESLINT_EXIT" -ne 0 && -z "$RESULT" ]]; then
  echo "[ERR] ESLint execution failed; cannot safely determine quality compliance."
  echo "$ESLINT_OUTPUT"
  write_summary "error" \
    "[ERR] ESLint execution failed; cannot safely determine quality compliance." \
    "Run npx eslint <file> directly to diagnose||Fix syntax/type errors first, then re-run this script" \
    "$FALLBACK_TRIGGERED" "low" \
    "ESLint crashed or produced no structured output — likely a parser/dependency issue unrelated to lint rules" \
    "Run 'npx eslint <file>' directly to diagnose; fix any syntax/type errors, then rerun this script"
  exit 1
fi

if [[ -z "$RESULT" ]]; then
  echo "[OK] All quality checks passed."
  write_summary "success" "[OK] All quality checks passed." "" "$FALLBACK_TRIGGERED" "high" "" ""
  exit 0
fi

echo "$RESULT"
echo ""
ERROR_COUNT=$(echo "$RESULT" | grep -cE "(\[Error/|\[ERR\])" 2>/dev/null || true)
WARN_COUNT=$(echo "$RESULT" | grep -cE "(\[Warning/|\[WARN\])" 2>/dev/null || true)
ERROR_COUNT=${ERROR_COUNT:-0}
WARN_COUNT=${WARN_COUNT:-0}
echo "  Errors: $ERROR_COUNT   Warnings: $WARN_COUNT"

NEXT_ACTIONS="Run pnpm quality:diff||Run npx eslint <file> for detailed errors||Escalate after 3 repeated failures"
if [[ "$WARN_COUNT" -gt 0 && "$ERROR_COUNT" -eq 0 ]]; then
  NEXT_ACTIONS="Review warning details||Re-run pnpm quality:diff"
fi

STATUS="success"
if [[ "$ERROR_COUNT" -gt 0 ]]; then
  STATUS="error"
elif [[ "$WARN_COUNT" -gt 0 ]]; then
  STATUS="warning"
fi

FALLBACK_CONFIDENCE="high"
if [[ "$FALLBACK_TRIGGERED" == true ]]; then
  FALLBACK_CONFIDENCE="low"
fi

ROOT_CAUSE=""
SAFE_RETRY=""
if [[ "$ERROR_COUNT" -gt 0 ]]; then
  ROOT_CAUSE="lint rule violation or fallback high-risk signature match"
  SAFE_RETRY="Run 'npx eslint <file>' for details, fix violations, then rerun this script"
elif [[ "$WARN_COUNT" -gt 0 ]]; then
  ROOT_CAUSE="lint warnings detected (non-blocking)"
  SAFE_RETRY="Review warning details, then rerun this script to confirm resolution"
fi

write_summary "$STATUS" "[INFO] Quality diff check completed" "$NEXT_ACTIONS" \
  "$FALLBACK_TRIGGERED" "$FALLBACK_CONFIDENCE" "$ROOT_CAUSE" "$SAFE_RETRY"

if [[ "$ERROR_COUNT" -gt 0 ]]; then
  echo "  Fix errors before committing. Run: npx eslint <file> for details."
  echo "  Root cause hint: lint rule violation or fallback high-risk signature match."
  echo "  Safe retry: pnpm quality:diff"
  echo "  Stop condition: if the same error repeats 3 times, escalate to manual investigation."
  exit 1
fi

exit 0
