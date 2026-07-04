# Codex App 行为对齐计划

## 原则

- 接近 Codex App 的工作区行为，但不伪造 Claude Code 不支持的能力。
- 真实 Claude Code CLI 能做的事情，优先通过 CLI 接入。
- CLI 需要原生交互时，打开交互式 Claude 终端。
- 界面默认中文，技术品牌名保留英文。

## 对齐点

- 项目和聊天并列管理。
- 右侧工具面板可开关。
- 底部上下文面板承载输出、环境、变更、来源和子代理。
- 设置页集中管理运行时、语言、字号和 API 配置。
- 插件、技能、MCP 和市场入口可独立管理。

## 非目标

- 不伪造 Claude Code 的权限弹窗。
- 不伪造 marketplace 目录。
- 不把 Claude Code TUI 完全重写成静态页面。
