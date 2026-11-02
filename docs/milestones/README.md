# 里程碑 PRD 索引

更新日期：2026-11-02

状态：proposal

本目录把 `docs/codex/research/06-roadmap-and-open-questions.md` 的粗粒度 Phase **拆成可独立交付的子里程碑 PRD**，方便实现、验收与 `phase-review` 评分（A 项优先读本目录，E 项读 `.agents/skills/phase-review/references/phase-capability-checklists.md`）。

## 总原则

- **参考参考工程，复现核心意图**；不复制 Nx / MUI Joy / Redis ISR / 多支付全家桶。
- 每个子里程碑：目标、范围、非目标、参考工程锚点、验收标准、依赖、风险。
- 完成某个子里程碑后，由人显式触发 phase-review（可评 `M2.x`）。

## Phase 对照

| Phase（06） | 子里程碑 | 文档 |
| --- | --- | --- |
| 1 最小骨架 | （已完成，见 phase-reviews） | `docs/phase-reviews/phase-1-minimal-skeleton.md` |
| 2 浏览与加购 | M2.1–M2.5 | [phase-2/README.md](./phase-2/README.md) |
| 3 Checkout 与支付 | 待拆 | — |
| 4 真实 adapter | 待拆 | — |
| 5 生产准备 | 待拆 | — |

## 建议实现顺序（Phase 2）

```text
M2.1 Home + PLP
  → M2.2 PDP + variants
    → M2.4 Server cart（可与 M2.2 末并行设计 cookie 契约）
      → M2.3 Search（可依赖 PLP 列表原语）
        → M2.5 Cache / SEO / 图片（横切，宜在页面稳定后收口）
```

Search（M2.3）也可在 M2.1 后并行，但须复用同一套 listing 契约，避免两套列表模型。

## 全站优化与交易闭环提案

[全站优化与沙箱交易闭环需求文档](./storefront-end-to-end/requirements.md)（2026-11-02，draft，待用户审核）统一梳理现有页面、Phase 2 缺口与 Phase 3 沙箱结算目标。

已确认 AU 完整沙箱支付及订单回查，SG/US 做兼容检查；其余范围与业务规则见文档待审核项。当前仅需求阶段，未批准实现，也不替代以上里程碑的交付状态。[决策记录](./storefront-end-to-end/contracts.md)保留用户确认与未决项。
