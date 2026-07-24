# Claude Code：本轮变更 Code Review（只读）

审查 E-pig 仓库中刚落地的「Saleor 融合 + 社区 skills + 统筹 skill」改动。不要修改文件。

## 范围

重点：
- `.agents/skills/e-pig-dev-loop/`、`.agents/skills/e-pig/`
- 对 `using-superpowers` / `ponytail` 等的 E-pig override（`disable-model-invocation`）
- `src/shared/lib/cache-manifest.ts` + spec
- `src/platform/seo/**` + spec
- `scripts/e-pig-doctor.mjs`、`package.json` verify/doctor
- `AGENTS.md` thin router、`DESIGN.md`/`PRODUCT.md`、`.cursorignore`
- `docs/agent-skills-migration-audit.md`、`docs/engineering/page-workflow-guide.md`
- `skills-lock.json`

## 审查清单

1. Hard Rules 是否被违反（尤其 cache 禁区、shared 不依赖 platform）
2. 社区 skills 冲突是否真正被压制（auto-invoke）
3. Saleor 融合是否误引入 Saleor 绑定
4. 测试是否覆盖关键回归点
5. 文档/命令是否与 package.json 同步
6. 安全：JSON-LD 序列化

## 输出格式

### Findings（blocker / major / minor）
### Residual risks
### Verdict: APPROVE / APPROVE_WITH_NITS / REQUEST_CHANGES

中文，简洁。
 M .agents/skills/README.md
 M AGENTS.md
 M README.md
 M docs/agent-skills-migration-audit.md
 M docs/engineering/page-workflow-guide.md
 M eslint.config.mjs
 M package.json
?? .agents/skills/brainstorming/
?? .agents/skills/code-review/
?? .agents/skills/e-pig-dev-loop/
?? .agents/skills/e-pig/
?? .agents/skills/grill-me/
?? .agents/skills/grilling/
?? .agents/skills/impeccable/
?? .agents/skills/implement/
?? .agents/skills/ponytail-audit/
?? .agents/skills/ponytail-debt/
?? .agents/skills/ponytail-review/
?? .agents/skills/ponytail/
?? .agents/skills/requesting-code-review/
?? .agents/skills/subagent-driven-development/
?? .agents/skills/tdd/
?? .agents/skills/test-driven-development/
?? .agents/skills/using-superpowers/
?? .agents/skills/verification-before-completion/
?? .agents/skills/writing-plans/
?? .claude/skills/brainstorming/
?? .claude/skills/code-review/
?? .claude/skills/e-pig
?? .claude/skills/e-pig-dev-loop
?? .claude/skills/grill-me/
?? .claude/skills/grilling/
?? .claude/skills/impeccable/
?? .claude/skills/implement/
?? .claude/skills/ponytail-audit/
?? .claude/skills/ponytail-debt/
?? .claude/skills/ponytail-review/
?? .claude/skills/ponytail/
?? .claude/skills/requesting-code-review/
?? .claude/skills/subagent-driven-development/
?? .claude/skills/tdd/
?? .claude/skills/test-driven-development/
?? .claude/skills/using-superpowers/
?? .claude/skills/verification-before-completion/
?? .claude/skills/writing-plans/
?? .cursor/skills/
?? .cursorignore
?? .tmp/leader-briefs/claude-review-prompt.md
?? .tmp/leader-briefs/install-superpowers.log
?? .tmp/leader-briefs/kimi-saleor-fusion-report.md
?? .tmp/leader-briefs/kimi-saleor-fusion-stderr.txt
?? .tmp/leader-briefs/kimi-saleor-fusion-stdout.txt
?? .tmp/leader-briefs/kimi-saleor-fusion.md
?? DESIGN.md
?? PRODUCT.md
?? scripts/e-pig-doctor.mjs
?? skills-lock.json
?? src/platform/seo/
?? src/shared/lib/cache-manifest.spec.ts
?? src/shared/lib/cache-manifest.ts
