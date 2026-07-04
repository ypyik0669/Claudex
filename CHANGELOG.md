# 变更记录

## v0.1.3 - Provider 和 Claude Code 参数完善

### 新增

- 直接 API 模式新增 OpenRouter、DeepSeek、MiniMax、Xiaomi MiMo 和 LM Studio 预设。
- Provider 兼容层支持 OpenAI Chat Completions、Anthropic Messages、Ollama、本地无密钥端点，以及 MiMo 的 `api-key` 请求头。
- 高级 Claude Code 设置新增 `--effort`、agent、工具白名单/黑名单、工具集、额外目录、MCP 配置、插件目录/URL、settings、setting sources、fallback model、预算、会话名、safe mode、bare mode、IDE、Chrome、strict MCP、不保存会话、屏幕阅读器和 verbose 输出。
- 右侧 Claude Code 面板新增命令参考快捷入口，并保留自由命令框运行任意 `claude ...` 子命令。

### 说明

- `/model`、`/effort`、`/resume` 等 slash command 仍由真实交互式 Claude Code TUI 承接；Claudex 的非交互聊天使用对应 CLI flags。

## v0.1.2 - 中文化收尾

### 调整

- 移除主应用中保留的英文翻译表，界面只保留中文文案源。
- 插件、技能、工具和市场能力说明改为单语中文。
- 设置页权限模式、认证状态、截断提示、超时提示和桌面弹窗标题改为中文显示。
- 更新当前桌面 QA 脚本的中文断言。

## v0.1.1 - 中文化版本

### 新增和调整

- 默认语言改为中文。
- 首次启动的项目名、聊天标题、系统提示词和本地状态文案改为中文。
- 快捷键弹窗、命令面板、底部上下文面板、错误提示和设置页标签改为中文。
- README、发布说明、用户指南、开发说明和内部记录改为中文。
- GitHub 仓库描述改为中文。

### 修复

- 修复旧默认值在英文系统上回落到英文界面的问题。
- 修复 Electron 主进程创建新聊天时写入英文标题的问题。

## v0.1.0 - 初始公开预览

### 功能

- 接入真实 Claude Code CLI。
- 支持 Claude Code 模式和直接 API 模式。
- 支持 OpenAI 兼容接口、Anthropic 和 Ollama。
- 支持项目选择、聊天、本地历史和设置保存。
- 支持工作区文件浏览、编辑、保存前差异预览和命令运行。
- 支持 Claude Code 插件、MCP、诊断和交互式终端入口。
- 支持 Windows 和 macOS Release 自动构建。

### 安全

- `.env`、真实 API 密钥、构建产物和本地缓存不会进入仓库。
- API 密钥保存在本机，系统支持时使用 Electron safeStorage。
