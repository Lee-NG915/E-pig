• ## Findings

  ### Blocker
  - **`.agents/skills/e-pig-dev-loop/SKILL.md:53` 引用缺失文件**：文中说"详见同目录 `CONFLICTS.md`"，但 `CONFLICTS.md` 不存在，冲突裁决表无法查阅，loop 的权威性受损。

  ### Major
  - **`src/shared/lib/cache-manifest.ts:109` profile 绕过风险**：`applyCacheProfile(profile, params)` 接受任意 `CacheProfile` 对象，仅校验 `profile.id` 是否含禁用词。外部可传入自定义 profile，其 `tagPattern` 仍可包含 `price/cart/checkout` 等敏感字段。
  - **`src/shared/lib/cache-manifest.ts:123` 禁用词匹配过宽**：`normalized.includes(forbidden)` 会误杀合法 id（如 `"inventory-report"` 含 `inventory`）。应精确匹配或限定前缀。
  - **`src/platform/seo/json-ld.ts:10` JSON-LD 转义不完整**：仅转义 `<`，未处理 `-->` / `]]>` 等可闭合 `<script>` 的序列，`dangerouslySetInnerHTML` 存在 XSS 隐患。
  - **`src/platform/seo/hreflang.ts:19` 不支持 market 多 locale**：`buildHreflangAlternates` 只取 `market.defaultLocale`，但 `markets.ts` 的 `locales` 是数组；未来一个市场多语言时会漏 alternate。

  ### Minor
  - **`src/platform/seo/seo.spec.ts` 覆盖缺口**：未测 `noIndex`、description 默认值、canonical path 无前导 slash、多 locale hreflang、JSON-LD 缺字段行为。
  - **`src/platform/seo/hreflang.ts:8` `host` 字段冗余**：`HreflangAlternate.host` 可从 `href` 解析，与 `href` 重复存储。
  - **`scripts/e-pig-doctor.mjs` 未校验 hash**：只检查 `skills-lock.json` 中 skill 文件存在，未校验 `computedHash`。
  - **`scripts/e-pig-doctor.mjs:79` symlink 检测可用 `lstatSync` 更明确**：当前 `statSync` + catch ENOENT 能工作，但 `lstatSync` 语义更直接。
  - **`src/shared/lib/cache-manifest.ts:17` `CacheLifeTier` 范围偏窄**：只声明 `minutes/hours/days`，限制未来使用 Next.js 其他内置 profile。

  ## Verdict

  本轮 Saleor 融合 + skills 架构方向正确：cache-manifest、paper-doctor 均只借鉴模式，未绑定 Saleor DTO/GraphQL，且坚守了 Hard Rules（价格/库存/cart/checkout/payment 不进缓存）。但存在一个必须立即修复的 blocker（`CONFLICTS.md` 缺失）和多个影响安全/正确性的 major 缺陷。建议修复 blocker 与 major 后再合并，并补充 SEO 回归测试。

