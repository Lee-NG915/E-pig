---
status: proposal
last-modified: 2026-07-19
register: product
---

# E-pig DESIGN.md

提案级设计契约，供 `impeccable` 与人类共同遵守。品牌视觉终稿未冻结；实现以 `packages/happy-dog` tokens 为准。

## Platform

web

## Tokens（真源）

- 包：`@e-pig/happy-dog` → `src/theme/{colors,typography,radii,theme}.ts`
- 语义色：`background` / `foreground` / `primary` / `muted` / `accent` / `border` / `ring`
- 禁止在业务组件硬编码 hex / 任意 oklch；用 CSS variables / happy-dog 类名

## Brand influence

- 中性壳（background / muted / border）占大面积
- 品牌色（primary / accent）仅用于 CTA、链接、选中态、关键徽章
- 禁止默认紫→靛渐变、奶油底+赤陶套装、全圆角 pill 堆叠、多层 glow（与仓库前端设计规则一致）

## AI slop 禁用

- 英雄区信息过载（统计条、多促销 chip、浮动 sticker）
- 无产品/场景锚点的抽象渐变当主视觉
- 为“好看”新增未使用的依赖或动画库

## Components

- 基础 UI → `packages/happy-dog`
- 业务 UI → `src/modules/<domain>/components/<name>/`（folder contract）
- Stories：`pnpm storybook:modules`（6007）

## Motion

- 有意图的 2–3 处即可；必须尊重 `prefers-reduced-motion`
