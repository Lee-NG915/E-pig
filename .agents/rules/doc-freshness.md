# Document Freshness — 文档元数据更新规则

**Canonical source。经 AGENTS.md → @include 链加载（CLAUDE.md → AGENTS.md → 本文件）。Cursor 镜像见 .cursor/rules/doc-freshness.mdc。**

编辑任何带 YAML frontmatter 或"更新日期"头的 Markdown 文件时，在同一次编辑内同步更新元数据。
无需提醒——任何 AI 工具或人类编辑者每次都自动适用。

---

## A. `docs/codex/research/*.md`（本仓库特有格式）

这些文件**不用 YAML frontmatter**，而是在正文头部有这样的行：

```text
更新日期：2026-07-18

状态：proposal
```

规则：

| 字段 | 动作 |
| --- | --- |
| `更新日期：YYYY-MM-DD` | 编辑内容时同步改为**当天日期** |
| `状态：...` | **不要改**，除非负责人明确要求 |

执行方式：

1. 编辑前先读文件头 10 行，确认是否有"更新日期："行。
2. 有则在**同一次 Edit 调用**里把日期改为当天，不作为单独步骤。

---

## B. 带 YAML frontmatter 的 `.md` / `.mdx`

| 字段 | 动作 |
| --- | --- |
| `last-reviewed` | 设为当天日期（YYYY-MM-DD） |
| `last-modified` | 设为当天日期（YYYY-MM-DD） |
| `updated_at` | 设为当天日期（YYYY-MM-DD） |
| `version` | 内容编辑递增 patch（1.0.0 → 1.0.1）；新增章节递增 minor（1.0.0 → 1.1.0） |
| `owner` | **不要改**，除非用户明确要求 |
| `status` | **不要改**，除非用户明确要求 |

执行方式：

1. 编辑任何 `.md` / `.mdx` 前先读文件头 10 行，判断有无 frontmatter。
2. 上述字段存在则在**同一次 Edit 调用**里更新，不作为单独步骤。
3. `last-reviewed` 与 `version` 同时存在时两个都更新。

---

## 示例

```yaml
# 编辑前
---
status: accepted
version: 1.0.0
owner: platform-team
last-reviewed: 2026-01-10
---
# 编辑内容后
---
status: accepted
version: 1.0.1
owner: platform-team
last-reviewed: 2026-07-18
---
```

---

## 适用范围

适用于提交到本仓库的全部文档：

- `docs/**/*.md`（含 `docs/codex/research/*.md`，按 A 节规则）
- `.agents/**/*.md`
- 其他任何带 YAML frontmatter 或"更新日期"头的 `.md` / `.mdx`

**不适用**于：

- 源代码文件（`.ts`、`.tsx`、`.js` 等）
- 自动生成文件（`node_modules`、`.next`、`dist`）
- 既无 frontmatter 也无"更新日期"头的文件
