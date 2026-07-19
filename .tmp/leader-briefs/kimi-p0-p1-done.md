# Kimi P0/P1 治理修复 — 交付说明

日期：2026-07-19

## 落地清单

### P0

- **P0-1 Stop hook 阻断语义**
  - `scripts/quality/stop-review.sh`：diff-check 失败（EXIT_CODE != 0）时打印 `{"decision":"block","reason":...}` 并 **exit 2**；成功/仅 warn 仍 exit 0。新增 `STOP_REVIEW_DIFF_CHECK_CMD` 环境变量作为 eval 注入缝（正常调用无需设置）。
  - 新建 `scripts/quality/run-stop-review-evals.mjs`：3 个用例（失败→exit 2 + block JSON；成功→exit 0；warn-only→exit 0）。
  - `pnpm test:harness-evals` 串联三个 eval runner（post-edit / stop-review / boundary）。

- **P0-2 `.claude/skills` 全量相对软链**
  - 17 个实体目录删除并改为 `ln -s ../../.agents/skills/<name>`；保留 6 个已有正确软链；现 23 个条目全部为软链。
  - 验证：`.claude/skills/ponytail/SKILL.md` 含 `disable-model-invocation` 与 `E-pig override`（grep 均命中）。

- **P0-3 doctor 加固 + 改名**
  - `scripts/e-pig-doctor.mjs`：`.claude/skills/*` 必须 symlink（lstat）；readlink 目标必须解析到 `.agents/skills/<同名>`；解析后须含 SKILL.md；skills-lock 存在性检查保留；新增 `using-superpowers`/`ponytail` frontmatter 必含 `disable-model-invocation`。
  - package.json script `doctor` → `agent-doctor`（避免与 pnpm 内置命令撞名）；AGENTS.md / README.md / `.agents/skills/e-pig/SKILL.md` 同步。
  - 负向探针：放入实体目录后 doctor exit 1 并指名错误，清理后恢复 PASS。

### P1

- **P1-1 import 边界补洞**
  - `eslint.config.mjs` modules 块：新增 pattern 组 `**/adapters/**`、`**/integrations/**`（gitignore 语义，覆盖 `../../` 相对路径与本地同名目录）；`paths` 禁 `stripe`、`posthog-js`；pattern 禁 `@stripe/*`、`@sentry/*`。已实测 ESLint 9 用 `ignore({allowRelativePaths:true})` 匹配，确认命中。
  - `scripts/quality/diff-check.sh` fallback：modules 文件新增相对路径签名扫描 `['"](\.{1,2}/)+[^'"]*(adapters|integrations)/`。
  - 新建 `scripts/quality/run-boundary-evals.mjs`：临时 fixture + eslint CLI，3 用例（相对路径→拒、posthog-js→拒、`@/core/contracts`→放行），finally 清理不留仓库。

- **P1-2 diff-check ESLint fail-open**
  - `ESLINT_EXIT != 0` 且 RESULT 仅 warning 时，记为失败（`ESLINT_SILENT_FAILURE`，ERROR_COUNT 置 1），最终 exit 1，summary root_cause/safe_retry 相应区分。

- **P1-3 verify 口径**
  - `verify = docs:check && typecheck && lint && test && happy-dog:test && test:harness-evals && agent-doctor`；未加 build/storybook/smoke。AGENTS.md / README.md / e-pig SKILL.md 一句话口径已更新。

- **P1-4 文档状态（最小）**
  - `docs/codex/research/04`、`07`：状态 `proposal` → `accepted`，日期 2026-07-19。
  - `component-folder-contract-rollout.md`：R1「stop-review.sh 接 companions」由「仍待」改为已实现（经 diff-check H1 Gate），日期 2026-07-19。companions 仍保持 warn（未升 error）。

## 验收结果

- `pnpm agent-doctor` → PASS
- `pnpm test:harness-evals` → 8/8 PASS（2 post-edit + 3 stop-review + 3 boundary）
- `pnpm verify` → 全链路 PASS（docs:check / typecheck / lint / test 99+4 / harness-evals / agent-doctor）

## AI Test Record

- Behavior changed: stop-review 失败语义 exit 1→exit 2(+block JSON)；doctor 新增硬性检查；eslint/diff-check 边界规则扩到相对路径与供应商 SDK；diff-check ESLint fail-open 修复；verify 组成扩大；script `doctor` 改名 `agent-doctor`。
- Tests added/updated: `scripts/quality/run-stop-review-evals.mjs`（新）、`scripts/quality/run-boundary-evals.mjs`（新）；doctor 负向探针（手动一次性）。
- Tests run: `pnpm agent-doctor`、`pnpm test:harness-evals`、`pnpm verify`、doctor 负向探针、minimatch/ignore pattern 实测探针。
- Result: PASS
- Failures or gaps: diff-check 的 fail-open 分支无自动化用例（需模拟 ESLint 崩溃，注入缝成本高于收益）；audit 历史文档（`docs/audits/*`、`.tmp/leader-briefs/*`）中 `pnpm doctor` 字样按"历史记录不改"处理未动。
- Next risk: `.claude/skills` 软链依赖 `.agents/skills` 同名目录存在，新增社区 skill 时必须先在 `.agents` 落盘再建链（doctor 已兜底）。
