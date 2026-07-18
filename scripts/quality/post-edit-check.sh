#!/usr/bin/env bash
# PostToolUse Hook: 单文件编辑后的实时提醒（从不阻断，永远 exit 0）
# 接收 Claude Code 的 hook JSON（stdin），提取 tool_input.file_path
# 真正的质量验证由 .agents/rules/quality-self-check.md 约束 AI 在全部编辑
# 完成后执行——本 hook 从不跑 lint、从不阻断，避免打断批量编辑。

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
# 兼容 Edit / Write / MultiEdit 输入形态
print(
  data.get('tool_input', {}).get('file_path') or
  data.get('tool_input', {}).get('path') or
  ''
)
" 2>/dev/null)

# python3 不可用时退回 node
if [[ -z "$FILE" ]] && command -v node >/dev/null 2>&1; then
  FILE=$(echo "$INPUT" | node -e "
let raw = '';
process.stdin.on('data', (c) => (raw += c)).on('end', () => {
  try {
    const data = JSON.parse(raw);
    process.stdout.write(
      (data.tool_input && (data.tool_input.file_path || data.tool_input.path)) || ''
    );
  } catch {
    process.stdout.write('');
  }
});" 2>/dev/null)
fi

[[ -z "$FILE" ]] && exit 0

# --- 守卫 1：规则/架构文档自保护 ---
if echo "$FILE" | grep -qiE "(\.agents/|AGENTS\.md|docs/codex/research/)"; then
  echo ""
  echo "================================================================"
  echo "  [WARN] 规则/架构文档被修改"
  echo "================================================================"
  echo ""
  echo "  File: $FILE"
  echo ""
  echo "  该文件属于全仓库通用的规则或架构约定，改动会影响所有后续"
  echo "  AI 会话与贡献者。继续前请确认："
  echo "    • 这是有意的规则/架构修改"
  echo "    • 已同步更新相关文档（AGENTS.md / 受影响 skill / 镜像规则）"
  echo "    • docs/codex/research/ 文件已同步更新\"更新日期\"行"
  echo ""
  echo "  若为误改，请立即 revert。"
  echo ""
  exit 0
fi

# --- 守卫 2：架构敏感面相关性过滤 ---
if ! echo "$FILE" | grep -qiE "(env|market|adapter|contract|registry|secret|payment|checkout)"; then
  exit 0
fi

echo ""
echo "[WARN] [Quality] 该文件涉及架构敏感面（env/market/adapter/contract），请对照 AGENTS.md Hard Rules 检查改动: $FILE"
echo ""
echo "  重点核对："
echo "    • server secret 是否进了 NEXT_PUBLIC_*（禁止）"
echo "    • 是否在 src/platform/config/env.ts 之外直接读 process.env"
echo "    • modules 是否 import 了 @/adapters/* 或 @/integrations/*（ESLint 已强制）"
echo "    • 价格/库存/cart/checkout/payment 是否被放进缓存（禁止）"
echo ""
exit 0
