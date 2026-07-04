# Claudex 开发说明

## 环境

- Node.js 22 或更新版本。
- npm。
- Electron。
- 可选：Claude Code CLI，用于测试 Claude Code 模式。

## 常用命令

```bash
npm install
npm run dev
npm run build
npm run desktop
```

## 打包

```bash
npm run dist:win
npm run dist:mac
```

Windows 包只能在 Windows 上完整验证。macOS 包必须在 macOS 上构建。

## 发布

推送版本标签后，GitHub Actions 会自动构建并创建 Release：

```bash
git tag v0.1.1
git push origin v0.1.1
```

Release workflow 只上传 `release/` 顶层的安装包和压缩包，避免把内部运行文件误传为下载资产。

## 代码结构

```text
src/                 React 界面
electron/main.cjs    Electron 主进程、本地状态、Claude Code 桥接
electron/preload.cjs 安全暴露给前端的桌面 API
qa/                  本地界面和桌面桥接验证脚本
```

## 安全边界

- 不提交 `.env` 或真实 API 密钥。
- 不提交 `node_modules/`、`dist/`、`release/` 或本地截图。
- 文件读写必须限制在用户选择的项目目录内。
- 直接 API 密钥保存在本机，系统支持时使用 safeStorage。

## 验证

最少验证：

```bash
node --check electron/main.cjs
node --check electron/preload.cjs
npm run build
```

涉及主要界面变更时，运行：

```bash
npx electron qa/capture-pass34-calm-shell.cjs
```
