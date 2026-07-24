---
status: proposal
last-modified: 2026-07-19
register: product
platform: web
---

# E-pig PRODUCT.md

轻量多市场家具电商前端。P0：mock catalog + client cart；真实 commerce/payment 后续通过 ports/adapters 接入。

## Users

- 浏览商品与内容的 shopper（多市场：au / sg / us）
- 用 AI coding agents 交付功能的工程师

## Jobs to be done

1. 快速浏览目录与内容页
2. 管理购物车（P0 localStorage；后续 server cart）
3. 保持 AI 可治理的交付质量（测试、companions、Hard Rules）

## Non-goals (current)

- 完整 OMS / ERP / 自建支付账本
- Saleor/Shopify 供应商锁定
- Nx 任务编排平台
