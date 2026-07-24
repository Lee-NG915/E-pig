// vitest 环境的 server-only 替身（见 vitest.config.ts 的 resolve.alias）。
// 真实包在 RSC 构建期把 client 引用变成编译错误；纯函数单测里不需要这个保护。
export {};
