# Claudex 设计 QA

## 结论

final result: passed with improved UX and known native-TUI boundary

## 对照来源

- 主要参考：用户提供的 Codex desktop 深色界面截图。
- 用户明确反馈：白底太丑、右侧信息脏乱、不要 web app、不要 demo、必须做真实 exe、必须接 Claude Code 功能。

## 已修复 UI

- 去掉白色主工作区，整体改为 Codex 风格深色三栏。
- 左侧更接近 Codex 的紧凑导航、项目、聊天和账户布局。
- 中间输入框去掉多余快捷 chips 和 API key 警告条，减少噪音。
- 右侧从 Provider 卡片堆叠改成工具入口：Workspace、Claude Code、Browser、Terminal。
- Claude Code 状态和操作区收敛到右侧面板，不再像 demo 卡片。

## 已接真实功能

- 默认发送链路走本机 Claude Code CLI：`claude -p --output-format json`。
- 继承 Claude Code 登录、插件、skills、MCP、权限模式和项目目录。
- 运行时已确认本机 Claude Code：`2.1.199 (Claude Code)`。
- 设置页新增 Execution：`Claude Code` / `Direct API`。
- 设置页新增 Claude command、Permission mode、Model 控制。
- 右侧 Claude Code 面板可执行 `auth status`、`plugin list`、`mcp list`、`doctor` 和自定义 Claude 子命令。
- Workspace 可浏览/读取/编辑/保存文件，并在当前项目运行命令。

## 本轮 UX 完善

- Composer 在 `Claude Code` execution mode 下不再误提示缺 API key；只有 `Direct API` 模式才要求 provider key。
- 聊天流式输出会自动滚到底，并用 breathing status 显示模型仍在工作。
- Workspace 编辑器新增未保存状态、放弃改动、保存按钮禁用态和 diff preview，避免直接盲保存。
- Workspace command runner 改成实时 stdout/stderr 流式展示，完成后保留 exit code、cwd、耗时和最终输出。
- Claude Code 面板新增实时子命令输出，`auth/plugin/mcp/doctor` 不再只在结束后突然回显。
- Claude Code 面板新增插件 install/update/disable 快捷操作，以及 marketplace list 入口。
- 新增 `Interactive Claude` 入口，在需要原生 permission prompt、slash command 或完整 TUI 流程时直接打开真实 Claude Code 终端。
- 浏览器预览环境新增 desktop API guard，不再显示 `getClaudeStatus` undefined 的红色错误。

## 验证证据

- 静态检查：`node --check electron\main.cjs`，通过。
- 静态检查：`node --check electron\preload.cjs`，通过。
- 构建：`npm run build`，通过。
- 打包：`npx electron-builder --win dir`，通过。
- 本轮默认打包输出 `release\win-unpacked` 被正在运行的 `Claudex.exe` 锁住，报 `EPERM unlink dxil.dll`；未强杀用户进程，改用 `npx electron-builder --win dir --config.directories.output=release-ux` 干净输出目录验证通过。
- Claude 子命令验证：按应用的 `commandCandidates()` 解析到 `C:\nvm4w\nodejs\node_modules\@anthropic-ai\claude-code\bin\claude.exe`，`claude plugin list` exit 0，stdout 分段输出。
- Workspace 命令验证：`node --version` exit 0，返回 `v22.22.1`。
- 视觉截图：`qa\ux-desktop-render.png` 产出并目检；发现浏览器预览 API guard 问题后已修复并重新 `npm run build`。
- 最新 exe：`release\win-unpacked\Claudex.exe`，可打开。
- Runtime：无前端 Runtime exception。
- Claude Code status：`available: true`，`version: 2.1.199 (Claude Code)`，`loggedIn: true`。
- Claude 子命令：`plugin list` 从 app 内执行成功。
- Workspace：读取 `package.json` 成功；运行 `node --version` 返回 `v22.22.1`。
- 真实 Claude Code 聊天：app 内发送 `Reply with exactly: CLAUDEX_DESKTOP_BRIDGE_OK`，回复 `CLAUDEX_DESKTOP_BRIDGE_OK`，并保存 `claudeSessionId`。
- 流式验证：收到 status、delta、done 事件；delta 分段为 `CLAUDEX_STREAM_FINAL` 和 `_OK`，最终保存为 assistant 消息 `CLAUDEX_STREAM_FINAL_OK`。

## 运行截图

- `release\claudex-final-runtime.png`
- `release\claudex-real-claude-code.png`
- `release\claudex-ux-workspace.png`
- `release\claudex-stream-final.png`
- `release\claudex-final-after-stream.png`
- `qa\ux-desktop-render.png`

## 已知差距

这些不是 UI demo 问题，而是完整替代 Claude Code TUI 还缺的深层交互：

- Claude `-p` 非交互模式本身不能承载完整原生 permission prompt；已提供 `Interactive Claude` 终端入口作为真实 TUI escape hatch。
- 聊天输出和右侧 Claude 子命令均已支持实时文本流；但原生 Claude Code 的全屏 TUI 控件仍由外部终端承载。
- Workspace 已有文件级 diff preview；还没有 Claude Code 生成 patch 的逐块 accept/reject 视图。
- 插件已可在面板里 install/update/disable；还不是完整 marketplace catalog UI。

## 设计判断

当前版本已经从“只是 UI”推进到“真实 Claude Code 桌面壳”：聊天、项目、Claude Code 状态、插件/MCP 查询、插件操作、Workspace 文件/diff/命令都能从 exe 内运行。原生 TUI 才能做的 permission/slash-command 流程通过 `Interactive Claude` 直接打开真实 Claude Code。





