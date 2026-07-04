# Pass 34 UX 审计和修复计划

## 已确认

- 默认右侧面板关闭。
- 字号紧凑。
- 底部上下文入口可展开。
- 设置、插件、市场页面可打开。
- 工作区和命令输出入口可用。

## 中文化修复

- 默认语言改为中文。
- 快捷键弹窗改为中文。
- Electron 默认会话和错误提示改为中文。
- README 和发布说明改为中文。

## 验证命令

```bash
npm run build
npx electron qa/capture-pass34-calm-shell.cjs
```
