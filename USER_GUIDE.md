# Claudex 用户指南

## 第一次打开

1. 打开 Claudex。
2. 左侧点击项目按钮，选择本机项目文件夹。
3. 中间输入框直接输入要 Claude Code 完成的任务。
4. 默认使用 Claude Code 模式，会调用你电脑上的 `claude` 命令。

## Claude Code 模式

Claude Code 模式适合已经安装并登录 Claude Code CLI 的用户。

```bash
claude --version
claude auth login
```

这个模式会继承本机 Claude Code 的登录、插件、技能、MCP、权限模式和项目目录。设置页可以配置 `--model`、`--effort`、agent、tools、MCP config、plugin dir/url、safe/bare、IDE、Chrome、fallback model、预算和额外 CLI 参数。

遇到需要原生权限确认或 slash command 的任务时，点击“交互式 Claude”打开真实 Claude Code TUI。`/model`、`/effort`、`/resume` 属于交互式行为；Claudex 非交互聊天使用对应 CLI flags。

## 直接 API 模式

如果不想依赖 Claude Code CLI，可以在设置里把执行方式切换为“直接 API”。支持：

- OpenAI-compatible
- OpenRouter
- DeepSeek
- MiniMax
- Xiaomi MiMo
- LM Studio 本地 OpenAI-compatible 服务
- Anthropic
- Ollama 本地模型

API 密钥只保存在本机。系统支持时会使用 Electron safeStorage 加密。

## 工作区

右侧“工作区”工具支持：

- 浏览当前项目文件。
- 打开文本文件。
- 编辑文件。
- 保存前查看差异。
- 在当前项目目录运行命令。

为了安全，文件读写限制在当前项目目录内；过大的文件和二进制文件不会在编辑器里打开。

## Claude Code 工具

右侧“Claude Code”工具支持：

- 查看登录状态。
- 查看插件列表。
- 查看 MCP 状态。
- 运行诊断。
- 安装、更新、禁用插件。
- 打开交互式 Claude 终端。

## 浏览器和终端

- “浏览器”可以在应用内预览文档、issue、本地服务或服务商控制台。
- “终端”会在当前项目目录打开系统终端。

## 快捷键

- `Ctrl/Cmd + K`：命令面板。
- `Ctrl/Cmd + N`：新聊天。
- `Ctrl/Cmd + ,`：设置。
- `Ctrl/Cmd + P`：选择项目。
- `Ctrl/Cmd + B`：打开或关闭左侧栏。
- `Ctrl/Cmd + \`：打开或关闭右侧面板。
- `Ctrl/Cmd + T`：打开或关闭浏览器工具。
- `Ctrl/Cmd + /`：显示快捷键。

## 本地数据

聊天记录、项目列表和设置保存在本机数据文件中。可在设置页打开数据文件位置。

Windows 默认路径类似：

```text
%APPDATA%\Claudex\desktop-data.json
```

## 常见问题

### Claude Code 没有检测到

确认 `claude --version` 可以在系统终端正常运行。如果不行，请先安装或修复 Claude Code CLI。

### API 返回 401

检查 API 密钥、基础 URL、模型名和服务商是否匹配。直接 API 模式不会影响 Claude Code 模式。

### macOS 打不开

当前 macOS 包暂未签名。第一次打开时可能需要在系统设置里手动允许。
