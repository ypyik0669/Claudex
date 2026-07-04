# Claudex v0.1.3

这是 provider 和 Claude Code 参数完善版本。直接 API 模式现在内置更多大模型服务商预设，Claude Code 模式也把常用 CLI flags 做成了设置项。

## 下载

- Windows：使用 `.exe` 安装包，或使用 `.zip` 便携包。
- macOS Apple Silicon：使用 `arm64.dmg`，或使用 `arm64.zip`。
- macOS Intel：使用 `x64.dmg`，或使用 `x64.zip`。

## 新增

- 直接 API provider：OpenAI-compatible、OpenRouter、DeepSeek、MiniMax、Xiaomi MiMo、LM Studio、Anthropic、Ollama。
- MiMo 使用 `api-key` 请求头；其他 OpenAI-compatible provider 默认使用 `Authorization: Bearer`。
- 高级 Claude Code 设置支持 `--effort`、`--agent`、tools、MCP config、plugin dir/url、safe/bare、IDE、Chrome、fallback model、预算、settings、setting sources 和额外 CLI 参数。
- 右侧 Claude Code 面板可以快速查看 `--help`、agents、project、plugin、marketplace、MCP、doctor，也可以输入任意 `claude ...` 参数运行。

## 注意

- Claude Code 模式需要用户电脑上已安装并登录 Claude Code CLI。
- `/model`、`/effort`、`/resume` 等 slash command 属于真实 Claude Code TUI 交互；请点击“交互式 Claude”打开真实终端。Claudex 非交互聊天使用对应 `--model`、`--effort` 等 CLI 参数。
- 直接 API 模式可以在设置里配置，API 密钥只保存在本机，不会打包进 Release。
- macOS 包暂未签名，第一次打开可能需要手动允许。
