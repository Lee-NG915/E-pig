# Proxy 在打包导入阶段读取 env

更新日期：2026-11-02

- 现象：Netlify Edge bundler 导入 Proxy 时尚无请求 MARKET，顶层 createEnv 抛错，打包失败。
- 首次观察：T04 部署，`logs/netlify-build-20261102.log:104–132`；发生于 `419990e` 集成提交前的 T03 Proxy 实现。
- 根因类：实现偏移 / 测试缺口；只验证请求行为，未覆盖托管 adapter 的模块导入生命周期。
- 修复：`419990e`。Proxy 改为 async，在 API bypass 后动态导入原 env，公共请求仍缺 MARKET 即失败；没有 AU fallback 或 skipValidation。
- 已落地防再发：`src/proxy.spec.ts` 4 项真实 env 回归覆盖无 MARKET 的 bundle 导入/API bypass/公共请求拒绝及 AU/SG/US 路由；修复后 Netlify adapter 构建 PASS。部署步骤记录于 deployment.md。
- 边界：构建通过不证明支付完成；真实托管交易另见 acceptance.md。
