---
name: dtc-privacy-redaction
description: 在公开分享或跨环境交接前擦除凭据、客户数据、内部路径、业务身份和可关联元数据，同时保留开发推理所需的结构。
---

# 隐私擦除

先处理再分享：截图、终端、日志、代码片段、字幕、音频转写和示例数据都必须经过本 skill。秘密（token、cookie、私钥、密码、签名 URL）直接删除；客户和个人信息使用合成数据或 `<CUSTOMER>`；仓库、业务站点、产品模块、分支、提交和绝对路径分别替换为 `<REPO>`、`<APP>`、`<TARGET>`、`<BRANCH>`、`<COMMIT>` 和 `<WORKSPACE>`。

公开内容只保留解释流程所需的关系、字段结构、相对变化和错误类别。示例域名使用 `example.invalid`，示例凭据不应看起来可用。不要用模糊、截断或哈希代替擦除，也不要把 `.gitignore` 当作隐私控制。

导出前检查地址栏、终端提示符、窗口标题、通知、剪贴板预览、调试 payload 和字幕。清理后重新检查文本和画面，记录删除/泛化的类别；原始文件留在受控位置，不复制到分享仓库。

完成后将脱敏素材交给 [dtc-requirements-analysis](../dtc-requirements-analysis/SKILL.md)、[dtc-evidence-log](../dtc-evidence-log/SKILL.md) 或 [dtc-recording-analysis](../dtc-recording-analysis/SKILL.md)。
