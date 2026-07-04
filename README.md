# Claudex

Claudex 是一个中文桌面编程助手。它把本机 Claude Code CLI 包进一个接近 Codex App 行为的桌面工作区里，支持项目、聊天、文件、命令、浏览器预览、插件、MCP、设置和本地历史。

## 下载

请打开最新 GitHub Release，按系统下载：

- Windows：下载 `Claudex-0.1.1.exe` 安装包，或下载 `Claudex-0.1.1.zip` 便携包。
- macOS Apple Silicon：下载 `Claudex-0.1.1-arm64.dmg`，或下载 `Claudex-0.1.1-arm64.zip`。
- macOS Intel：下载 `Claudex-0.1.1-x64.dmg`，或下载 `Claudex-0.1.1-x64.zip`。

macOS 预览包暂未签名，第一次打开时可能需要在系统设置里手动允许。

## 使用要求

- Windows 10/11 或 macOS。
- 推荐安装并登录 Claude Code CLI。
- 如果不用 Claude Code CLI，也可以在设置里切换到直接 API 模式。

Claude Code CLI 基本检查：

```bash
claude --version
claude auth login
```

## 主要功能

- 中文优先界面。
- 左侧项目和聊天导航。
- 中间聊天区和命令输入框。
- 右侧工具面板：工作区文件、Claude Code 命令、浏览器预览、终端、运行环境。
- 底部上下文面板：输出、环境、变更、来源、子代理。
- 设置页：Claude Code 模式、直接 API 模式、模型、基础 URL、权限、语言、字号。
- 插件、技能、MCP 和市场管理入口。
- 本地保存项目、聊天和设置。

## 本地开发

```bash
npm install
npm run dev
npm run build
npm run desktop
```

本地打包：

```bash
npm run dist:win
npm run dist:mac
```

macOS 打包命令必须在 macOS 上运行。GitHub Actions 会在 Windows runner 生成 Windows 包，在 macOS runner 生成 macOS 包。

## 发布

推送版本标签后会自动创建 Release：

```bash
git tag v0.1.1
git push origin v0.1.1
```

GitHub Actions 会构建 Windows 和 macOS 安装包，并上传到 GitHub Release。

## 安全说明

- 不要提交 `.env` 或真实 API 密钥。
- Release 包不会内置本机 API 密钥。
- 应用内输入的 API 密钥只保存在本机；系统支持时会使用 Electron safeStorage 加密。

## 目录结构

```text
src/                 React 界面
electron/            Electron 主进程和 preload
build/               应用图标和打包资源
docs/                设计、验证和发布记录
qa/                  本地冒烟测试脚本
.github/workflows/   Release 自动化
```

## 许可证

暂未选择许可证。
