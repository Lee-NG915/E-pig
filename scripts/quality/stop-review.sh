#!/usr/bin/env bash
# Stop Hook: 会话结束时的质量检查（AI agent wrapper）
# 核心逻辑：scripts/quality/diff-check.sh
# 本 wrapper 增加：规则/架构文档变更检测 + 日志与机器可读 summary

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
LOG_FILE="$LOG_DIR/review-$(date +%Y%m%d).log"
SUMMARY_JSON="$LOG_DIR/review-summary-latest.json"
mkdir -p "$LOG_DIR"

# --- 守卫：检测规则/架构文档变更 ---
ALL_CHANGED=$(git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null)
RULE_FILES=$(echo "$ALL_CHANGED" | sort -u | grep -iE \
  "^(\.agents/|AGENTS\.md|docs/)" \
  | grep -v '^$' || true)

if [[ -n "$RULE_FILES" ]]; then
  echo ""
  echo "================================================================"
  echo "  [WARN] RULE / ARCHITECTURE DOC FILES CHANGED"
  echo "================================================================"
  echo "$RULE_FILES" | while read -r f; do echo "    - $f"; done
  echo "  确认改动是有意的，且相关文档（AGENTS.md / 镜像规则）已同步。"
  echo ""
  { echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) - RULE/DOC FILES CHANGED ==="; echo "$RULE_FILES"; echo ""; } >> "$LOG_FILE"
fi

# --- 跑核心 diff 检查 ---
set +e
OUTPUT=$(bash "$REPO_ROOT/scripts/quality/diff-check.sh" 2>&1)
EXIT_CODE=$?
set -e

echo "$OUTPUT"
{ echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="; echo "$OUTPUT"; echo ""; } >> "$LOG_FILE"

# 失败时给出 root cause hint / safe retry / stop condition
if [[ "$EXIT_CODE" -ne 0 ]] || echo "$OUTPUT" | grep -qE "(\[Error/|\[ERR\])" 2>/dev/null; then
  echo "  Root cause hint: lint rule violation or ESLint execution failure."
  echo "  Safe retry: pnpm lint / pnpm quality:diff"
  echo "  Stop condition: 同一失败连续出现 3 次 → 停止自动修复，转人工调查。"
fi
echo ""
echo "Log: $LOG_FILE"
echo "Summary JSON: $SUMMARY_JSON"
echo ""

STATUS="success"
SUMMARY="[OK] stop-review completed without quality errors"
NEXT_ACTIONS="No action required"
if [[ "$EXIT_CODE" -ne 0 ]]; then
  STATUS="error"
  SUMMARY="[ERR] stop-review detected quality errors"
  NEXT_ACTIONS="Run pnpm lint||Run pnpm quality:diff||Escalate to manual investigation after 3 repeated failures"
elif echo "$OUTPUT" | grep -q "\[WARN\]" 2>/dev/null; then
  STATUS="warning"
  SUMMARY="[WARN] stop-review completed with warnings"
  NEXT_ACTIONS="Review warning details||Run pnpm quality:diff for confirmation"
fi

export SR_STATUS="$STATUS"
export SR_SUMMARY="$SUMMARY"
export SR_NEXT_ACTIONS="$NEXT_ACTIONS"
export SR_OUTPUT="$OUTPUT"
export SR_LOG_FILE="$LOG_FILE"
export SR_SUMMARY_JSON="$SUMMARY_JSON"

node -e "const fs=require('node:fs');
const nextActions=(process.env.SR_NEXT_ACTIONS||'').split('||').filter(Boolean);
const payload={
  status: process.env.SR_STATUS || 'unknown',
  summary: process.env.SR_SUMMARY || '',
  next_actions: nextActions,
  artifacts: [process.env.SR_LOG_FILE || ''],
  output_excerpt: (process.env.SR_OUTPUT || '').split('\n').slice(0, 80),
  generated_at: new Date().toISOString(),
};
fs.writeFileSync(process.env.SR_SUMMARY_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');"

exit "$EXIT_CODE"
