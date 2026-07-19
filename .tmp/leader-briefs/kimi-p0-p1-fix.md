# Kimi 任务：P0/P1 必要治理修复（可写仓库）

你是实现者。在 `/Users/lidonghai/castlery/E-pig` 落地下列修复。**只做必要项**；不要扩大审计里的过度建议。

## 禁止（不要做）

- 不要把 companions 升为 error
- 不要把 Storybook build / production build / smoke 塞进日常 verify
- 不要为 AI Test Record 做 NLP 解析
- 不要再装社区 skills
- 不要重构 app 架构、首页、theme portal、host→market（P2）
- 不要大改 roadmap 全文；文档状态只改与 Hard Rules 明显冲突的几处标记

## 必须做（P0）

### P0-1 Stop hook 阻断语义
- 文件：`scripts/quality/stop-review.sh`
- 当 `diff-check` 失败（EXIT_CODE != 0）时：对 Claude Stop hook 使用 **exit 2**（或打印 `{"decision":"block","reason":"..."}` 且 exit 2）
- 成功/仅 warn：仍 exit 0
- 在 `scripts/quality/run-post-edit-evals.mjs` **或**新建 `scripts/quality/run-stop-review-evals.mjs` 增加负向用例：模拟失败时 exit=2；成功时 exit=0
- 把新 eval 挂进 `pnpm test:harness-evals`（可改 package.json 串联两个 eval runner）

### P0-2 `.claude/skills` 全部改为指向 `.agents/skills` 的相对软链
- 删除 `.claude/skills` 下实体目录（copy），改为 `ln -sfn ../../.agents/skills/<name> .claude/skills/<name>`
- 保留已有正确软链
- 验证：`.claude/skills/ponytail/SKILL.md` 含 `disable-model-invocation` 与 E-pig override

### P0-3 doctor 加固 + 避免 `pnpm doctor` 撞名
- 扩展 `scripts/e-pig-doctor.mjs`：
  - `.claude/skills/*` 必须是 symlink
  - symlink 目标必须解析到 `.agents/skills/<同名>`
  - skills-lock 中每个 skill 在 `.agents` 存在
  - 对 `using-superpowers`、`ponytail` 检查 frontmatter 含 `disable-model-invocation`
- `package.json`：script `doctor` **改名为** `agent-doctor`
- 同步 AGENTS.md / README：写 `pnpm agent-doctor`

## 必须做（P1）

### P1-1 import 边界补洞
- eslint modules：限制相对路径到 adapters/integrations；禁 `stripe`/`@stripe/*`/`posthog-js`/`@sentry/*`
- diff-check fallback：modules 文件扫描相对路径 adapters/integrations
- harness evals 至少 1 个边界负向用例（可用临时 fixture + eslint CLI）

### P1-2 diff-check ESLint fail-open
- ESLINT_EXIT != 0 时最终必须 exit 1（不得被 WARN-only RESULT 吞掉）

### P1-3 verify 口径
- verify = docs:check && typecheck && lint && test && happy-dog:test && test:harness-evals && agent-doctor
- 不要加 build/storybook/smoke
- 更新 AGENTS/README 一句话说明

### P1-4 文档状态（最小）
- docs/codex/research/04 与 07：状态 proposal → accepted，更新日期 2026-07-19
- component-folder-contract-rollout.md：已实现项改成与现实一致

## 验收
pnpm agent-doctor && pnpm test:harness-evals && pnpm verify

写交付说明到 `.tmp/leader-briefs/kimi-p0-p1-done.md`。开始实现。
