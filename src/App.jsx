import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Archive,
  Bot,
  Blocks,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Folder,
  FileText,
  GitBranch,
  GitCommit,
  GitFork,
  Globe2,
  HardDrive,
  History,
  KeyRound,
  Languages,
  Maximize2,
  MessageSquarePlus,
  Monitor,
  PanelRight,
  PanelBottom,
  Pencil,
  Pin,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  SquareTerminal,
  Store,
  Trash2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

const desktopApi = window.claudexDesktop || window.claudeDesktop;

const providers = [
  {
    id: "openai-compatible",
    name: "OpenAI-compatible",
    apiStyle: "openai-chat",
    authMode: "bearer",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
    note: "通用 OpenAI Chat Completions 兼容网关，使用 Authorization: Bearer。",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    apiStyle: "openai-chat",
    authMode: "bearer",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4.5",
    note: "OpenAI-compatible 多模型网关，模型 ID 可直接改成 OpenRouter 上的任意 slug。",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    apiStyle: "openai-chat",
    authMode: "bearer",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    note: "DeepSeek OpenAI Chat Completions 兼容端点，默认走 Bearer API Key。",
  },
  {
    id: "minimax",
    name: "MiniMax",
    apiStyle: "openai-chat",
    authMode: "bearer",
    baseUrl: "https://api.minimax.io/v1",
    model: "MiniMax-M3",
    note: "MiniMax M 系列 OpenAI-compatible 端点。",
  },
  {
    id: "xiaomi-mimo",
    name: "Xiaomi MiMo",
    apiStyle: "openai-chat",
    authMode: "api-key",
    baseUrl: "https://api.xiaomimimo.com/v1",
    model: "mimo-v2.5-pro",
    note: "MiMo OpenAI-compatible 端点，默认使用 api-key 请求头。",
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    apiStyle: "openai-chat",
    authMode: "none",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    note: "本地 LM Studio OpenAI-compatible 服务器，默认不需要 API 密钥。",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    apiStyle: "anthropic-messages",
    authMode: "x-api-key",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5-20250929",
    note: "通过 Electron 主进程直接调用 Anthropic Messages API。",
  },
  {
    id: "ollama",
    name: "Ollama / local",
    apiStyle: "ollama-chat",
    authMode: "none",
    baseUrl: "http://localhost:11434",
    model: "qwen2.5-coder:latest",
    note: "通过 Ollama 运行本地模型，不需要 API 密钥。",
  },
];

const capabilityCatalog = [
  {
    id: "project-context",
    type: "tool",
    defaultEnabled: true,
    name: "项目上下文",
    description: "每次请求都记住当前工作区。",
  },
  {
    id: "code-review",
    type: "skill",
    defaultEnabled: true,
    name: "代码审查",
    description: "优先找风险、回归和缺失测试。",
  },
  {
    id: "implementation-plan",
    type: "skill",
    defaultEnabled: true,
    name: "实现计划",
    description: "大改动前先形成可验证步骤。",
  },
  {
    id: "terminal-helper",
    type: "tool",
    defaultEnabled: true,
    name: "终端助手",
    description: "直接在当前项目文件夹里打开终端。",
  },
  {
    id: "mcp-runtime",
    type: "tool",
    defaultEnabled: true,
    name: "MCP 运行时",
    description: "在 Claudex 里显示 Claude Code MCP 状态和命令。",
  },
  {
    id: "plugin-router",
    type: "plugin",
    defaultEnabled: true,
    name: "插件路由",
    description: "启用一次后不用每次输入斜杠命令。",
  },
  {
    id: "marketplace-router",
    type: "plugin",
    defaultEnabled: true,
    name: "市场路由",
    description: "不用离开应用就能运行 Claude Code 插件市场命令。",
  },
  {
    id: "custom-marketplaces",
    type: "plugin",
    defaultEnabled: false,
    name: "自定义市场",
    description: "把额外插件市场 URL 保存成本地插件来源。",
  },
  {
    id: "debugger",
    type: "skill",
    defaultEnabled: false,
    name: "调试模式",
    description: "优先复现、假设验证和根因修复。",
  },
  {
    id: "docs-writer",
    type: "skill",
    defaultEnabled: false,
    name: "文档助手",
    description: "把完成的功能整理成使用说明。",
  },
  {
    id: "test-writer",
    type: "skill",
    defaultEnabled: false,
    name: "测试助手",
    description: "优先写覆盖真实行为的测试。",
  },
];

const copy = {
  zh: {
    appSubtitle: "桌面编程助手",
    newChat: "新聊天",
    search: "搜索",
    scheduled: "自动化",
    plugins: "插件",
    skills: "技能",
    mcps: "MCPs",
    marketplace: "市场",
    projects: "项目",
    chats: "聊天记录",
    showMore: "显示更多",
    more: "更多",
    accountPlan: "本地",
    promptTitle: "今天要做什么？",
    selectedEmptyTitle: "今天要做什么？",
    selectedEmptyHint: "",
    noSessionTitle: "没有选择聊天",
    noSessionHint: "新建聊天，或从左侧选择一个聊天。",
    placeholder: "输入任何任务",
    chooseProject: "选择项目",
    customMode: "自定义",
    defaultPermissions: "默认权限",
    defaultPermissionsShort: "默认",
    projectContext: "项目",
    browser: "浏览器",
    terminal: "终端",
    provider: "服务商",
    executionMode: "执行方式",
    claudeCodeMode: "Claude Code",
    apiMode: "直接 API",
    claudeCodeManagedTitle: "Claude Code 模式",
    claudeCodeManagedHint: "消息会通过本机 Claude Code CLI 运行。右侧显示当前 CLI 登录和环境状态；下面的直接 API 字段只有切换到直接 API 后才会生效。",
    directApiManagedHint: "直接 API 模式会使用这里保存的服务商、基础 URL、模型和 API 密钥。",
    cliEnvSource: "CLI 环境",
    storedDirectApi: "已保存的直接 API 设置",
    inactiveInClaudeCode: "Claude Code 模式下不生效",
    claudeCommand: "Claude 命令",
    permissionMode: "权限模式",
    permissionModeDefault: "默认",
    permissionModeAcceptEdits: "自动接受编辑",
    permissionModeAuto: "自动",
    permissionModePlan: "计划",
    permissionModeDontAsk: "不再询问",
    permissionModeBypassPermissions: "绕过权限",
    claudeStatus: "Claude Code 状态",
    auth: "登录",
    pluginsAndMcp: "插件和 MCP",
    refreshStatus: "刷新状态",
    model: "模型",
    settings: "设置",
    data: "数据",
    ready: "可用",
    needsKey: "需要密钥",
    sending: "发送中",
    send: "发送",
    cancel: "停止",
    assistant: "助手",
    you: "你",
    requestError: "请求错误",
    waiting: "正在等待模型回复...",
    composerShortcutHint: "Enter 发送 · Shift+Enter 换行 · Ctrl+/ 快捷键",
    desktopOnly: "请打开打包后的 .exe，真实模型调用和本地加密设置只在桌面端可用。",
    settingsTitle: "设置",
    settingsSubtitle: "运行方式、登录状态和本地偏好",
    backToApp: "返回应用",
    searchSettings: "搜索设置...",
    settingsGeneral: "通用",
    settingsProfile: "个人",
    settingsAppearance: "外观",
    settingsConfiguration: "配置",
    settingsPersonalization: "个性化",
    settingsMcpServers: "MCP 服务器",
    settingsBrowser: "浏览器",
    settingsComputerUse: "电脑操作",
    settingsHooks: "钩子",
    settingsConnections: "连接",
    settingsGit: "Git",
    settingsEnvironments: "环境",
    settingsWorktrees: "工作树",
    settingsArchivedChats: "归档聊天",
    notImplementedYet: "尚未实现",
    notImplementedHint: "这个分类为了对齐 Codex App 先展示出来；Claudex 只会启用有真实本地状态支撑的控件。",
    backedLocalState: "本地状态支撑",
    localRuntime: "本地运行时",
    toggleSidebar: "打开/关闭左侧栏",
    toggleRightPanel: "打开/关闭右侧面板",
    toggleBrowser: "打开/关闭浏览器",
    showShortcuts: "显示快捷键",
    closeModal: "关闭弹窗",
    sendMessageShortcut: "在输入框中发送消息",
    newLineShortcut: "在输入框中换行",
    shortcutsTitle: "键盘快捷键",
    shortcutsSubtitle: "快速操作和导航",
    cliStatus: "CLI 状态",
    refreshCliStatus: "刷新 CLI 状态",
    cliPluginOutput: "Claude Code 插件输出",
    cliMcpOutput: "Claude Code MCP 输出",
    marketplaceOutput: "市场输出",
    fetchMarketplace: "获取市场列表",
    customMarketplaces: "自定义市场",
    marketplaceUrl: "市场 URL",
    addMarketplace: "添加市场",
    remove: "移除",
    noCustomMarketplaces: "还没有添加自定义市场。",
    customMarketplaceLocalOnly: "本地记录",
    customMarketplaceNotInjected: "未注入 Claude CLI",
    customMarketplaceLocalHint: "这些 URL 只保存到 Claudex 本地设置；当前不会修改 Claude Code 的 marketplace 配置。",
    customMarketplaceCliHelpHint: "先查看当前 Claude Code 支持的 marketplace 命令，再到 Claude 面板执行真实 CLI 操作。",
    copyMarketplaceUrl: "复制 URL",
    copiedMarketplaceUrl: "已复制 URL",
    checkMarketplaceCliSupport: "查看 CLI 支持",
    localCapability: "本地能力",
    installedCliState: "已安装 CLI 状态",
    settingsStatusHint: "这个页面显示 Claudex 本地状态和 Claude Code CLI 输出。",
    settingsQuickLinks: "关联入口",
    openMcpWorkbench: "打开插件 / MCP 工作台",
    openClaudeTool: "打开 Claude Code 工具",
    openBrowserTool: "打开浏览器工具",
    openBrowserEvidence: "打开浏览器证据",
    openChangesPanel: "打开变更面板",
    openEnvironmentPanel: "打开环境面板",
    openWorkspaceTool: "打开工作区工具",
    openTerminalTool: "打开终端工具",
    openProjectSurface: "打开项目管理",
    settingsRouteThroughCli: "这个流程会通过 Claude Code CLI，遇到原生权限弹窗时会转到交互式 Claude 终端。",
    noCliOutputYet: "还没有 CLI 输出。",
    noGitProject: "选择一个 Git 项目后会显示分支和改动。",
    defaultFileOpenDestination: "默认文件打开方式",
    agentEnvironment: "Agent 环境",
    integratedShell: "集成终端 Shell",
    settingsRuntime: "运行环境",
    activeRuntime: "当前运行方式",
    settingsDirectApi: "直接 API",
    settingsDirectApiHint: "只有执行方式切换为直接 API 时才会使用。Claude Code 模式继续使用右侧上下文里显示的 CLI 环境。",
    settingsDirectApiInactive: "切换到直接 API 后才会生效",
    settingsDirectApiInactiveHint: "在 Claude Code CLI 模式下，修改这些字段不会影响当前运行；只有执行方式切换到直接 API 后才使用。",
    settingsAdvancedClaude: "高级 Claude Code",
    settingsAdvancedApi: "高级 API 选项",
    claudeModel: "Claude 模型",
    providerPresetHint: "该预设使用 {style}，认证方式：{auth}。{note}",
    providerAuthBearer: "Bearer",
    providerAuthApiKey: "api-key 请求头",
    providerAuthNone: "无密钥",
    effort: "推理强度",
    effortDefault: "默认",
    effortLow: "低",
    effortMedium: "中",
    effortHigh: "高",
    effortXhigh: "很高",
    effortMax: "最高",
    claudeAgent: "Agent",
    claudeAgentPlaceholder: "例如 reviewer / planner",
    allowedTools: "允许工具",
    disallowedTools: "禁止工具",
    toolsList: "可用工具",
    toolsListPlaceholder: "例如 Bash,Edit,Read 或 default",
    toolsPlaceholder: "逗号分隔或保持为空",
    addDirs: "额外目录",
    addDirsPlaceholder: "每行一个 --add-dir 路径",
    mcpConfig: "MCP 配置",
    mcpConfigPlaceholder: "每行一个 JSON 文件路径或 JSON 字符串",
    pluginDir: "插件目录",
    pluginDirPlaceholder: "每行一个插件目录或 zip",
    pluginUrl: "插件 URL",
    pluginUrlPlaceholder: "每行一个插件 zip URL",
    settingsFile: "设置文件",
    settingsFilePlaceholder: "settings JSON 路径或 JSON 字符串",
    settingSources: "设置来源",
    settingSourcesPlaceholder: "user,project,local",
    fallbackModel: "备用模型",
    fallbackModelPlaceholder: "只在 -p 模式生效，例如 sonnet,opus",
    maxBudgetUsd: "预算上限 USD",
    sessionName: "会话名称",
    sessionNamePlaceholder: "显示在 Claude Code 会话里",
    extraClaudeArgs: "额外 Claude 参数",
    extraClaudeArgsPlaceholder: "例如 --betas beta-a --debug api",
    cliFlagsHint: "这些选项会自动追加到 Claudex 的非交互 Claude Code 调用；没有一等控件的 CLI flag 也可以放在额外参数里。",
    slashCommandHint: "/model、/effort、/resume 等交互式 slash commands 需要打开真实 Claude Code TUI；非交互聊天会使用这里对应的 --model、--effort 等 CLI 参数。",
    safeMode: "安全模式",
    bareMode: "极简模式",
    autoIde: "自动连接 IDE",
    chromeMode: "Chrome 集成",
    chromeDefault: "默认",
    chromeOn: "开启",
    chromeOff: "关闭",
    strictMcpConfig: "仅使用指定 MCP",
    noSessionPersistence: "不保存会话",
    axScreenReader: "屏幕阅读器输出",
    verboseOutput: "详细输出",
    settingsPrompt: "提示词",
    settingsStorage: "存储",
    close: "关闭",
    save: "保存",
    saving: "保存中",
    saved: "已保存",
    unsavedChanges: "未保存",
    unsavedChangesHint: "您有尚未保存的更改。",
    unsavedChangesWarning: "您有未保存的更改。要放弃更改还是继续编辑？",
    keepEditing: "继续编辑",
    discardChanges: "放弃更改",
    workingHint: "正在处理，请等待当前任务完成。",
    noChangesToSave: "暂无更改可保存。",
    pluginNameRequired: "请先输入插件名称。",
    baseUrl: "基础 URL",
    apiKey: "API 密钥",
    apiKeyPlaceholder: "粘贴密钥",
    apiKeySaved: "已保存，留空则保持不变",
    apiKeyNone: "不需要",
    claudeCodeDefaultEnv: "Claude Code 默认环境",
    temperature: "温度",
    timeout: "超时毫秒",
    systemPrompt: "系统提示词",
    language: "语言",
    interfaceLanguage: "界面语言",
    fontSize: "字号",
    fontSizeCompact: "紧凑",
    fontSizeDefault: "默认",
    fontSizeLarge: "大",
    density: "密度",
    densityCompact: "紧凑",
    densityComfortable: "舒适",
    followSystem: "跟随系统",
    english: "英文",
    chinese: "中文",
    encryption: "加密",
    dataFile: "数据文件",
    env: ".env 备用",
    openData: "打开数据文件",
    savedKey: "已保存",
    missingKey: "缺失",
    noMessages: "还没有消息。",
    quickReview: "审查这段代码，找出最大的风险。",
    quickPlan: "写一个包含验证步骤的实现计划。",
    quickExplain: "解释下一步具体应该怎么改代码。",
    activeThread: "当前对话",
    localWorkspace: "本地工作区",
    providerNote: "当前服务商",
    localHistory: "本地历史",
    tools: "工具",
    contextPanel: "上下文",
    environment: "环境",
    outputs: "输出",
    bottomPanel: "底部面板",
    openSidePanel: "打开侧边面板",
    outputsPanelHint: "命令输出、Claude 进度和环境摘要会显示在这里，同时可以继续聊天。",
    terminalPanelHint: "需要交互式命令时，使用当前项目的真实终端。",
    browserPanelHint: "需要边聊天边看页面时，在侧边面板里预览 URL。",
    noActiveRun: "当前没有运行中的任务。",
    changes: "变更",
    local: "本地",
    branch: "分支",
    upstream: "Upstream",
    remote: "远端",
    noGitUpstream: "无 upstream",
    noGitRemote: "无远端",
    gitAhead: "未推送",
    gitBehind: "落后",
    gitSynced: "已同步",
    gitSyncStatus: "同步状态",
    commitOrPush: "提交或推送",
    sources: "来源",
    subagents: "子代理",
    taskCenter: "任务中心",
    taskCenterHint: "自动化和子代理来自主进程本地状态与 Claude Code CLI，运行、失败和产物都会写入 evidence。",
    taskCenterSummary: "自动化 {automations} 个 · 子代理 {subagents} 条",
    taskCenterTotal: "总计",
    taskCenterActive: "活动",
    taskCenterFailed: "失败",
    automationTasks: "自动化任务",
    noAutomationTasks: "还没有自动化任务",
    automationLastRun: "最近运行",
    notices: "通知",
    noticeCenter: "通知/错误中心",
    noticeCount: "{count} 条未处理",
    noticeNoActive: "没有未处理通知",
    noticeNoHistory: "还没有通知或错误记录。",
    noticeBackedByLocalState: "来自本地状态、CLI 和 webview 事件。",
    noticeDismiss: "标记已处理",
    noticeClearAll: "全部标记已处理",
    noticeOpenAction: "打开对应工作台",
    noticeSource: "来源",
    noticeLevelError: "错误",
    errorActions: "错误处理动作",
    noticeLevelWarning: "警告",
    noticeLevelInfo: "信息",
    noSourcesYet: "暂无来源",
    sourceCount: "{count} 个来源",
    sourceLastOpened: "最近读取",
    sourceBackedByWorkspace: "来自真实 Workspace 文件读取记录",
    noSubagentsYet: "还没有子代理运行记录",
    subagentTask: "子任务",
    subagentTaskPlaceholder: "让一个子代理独立检查什么？",
    subagentNickname: "昵称",
    subagentNicknamePlaceholder: "例如 Reviewer / QA",
    runSubagent: "运行子代理",
    cancelSubagent: "停止子代理",
    subagentWorkbenchHint: "使用当前 Claude Code CLI 在项目里执行子任务，结果会写入本地 evidence。",
    subagentCount: "{count} 条子代理记录",
    subagentStatusRunning: "运行中",
    subagentStatusDone: "已完成",
    subagentStatusError: "失败",
    subagentStatusCancelled: "已停止",
    subagentArtifacts: "产物",
    subagentArtifactPath: "路径",
    copySubagentArtifact: "复制产物",
    openSubagentArtifact: "打开文件",
    noSubagentArtifacts: "暂无产物",
    subagentEvidence: "证据",
    subagentStdout: "标准输出",
    subagentStderr: "标准错误",
    subagentExitCode: "退出码",
    subagentCommand: "命令",
    subagentSession: "会话",
    copySubagentEvidence: "复制证据",
    copiedSubagentEvidence: "证据已复制",
    openRunTimeline: "查看 timeline",
    retrySubagent: "重试子代理",
    continueSubagent: "续写到聊天",
    subagentContinued: "子代理结果已续写到聊天",
    subagentContinuedShort: "已续写",
    archiveSubagent: "关闭记录",
    restoreSubagent: "恢复记录",
    subagentArchived: "子代理记录已关闭",
    subagentRestored: "子代理记录已恢复",
    showArchivedSubagents: "查看已关闭",
    hideArchivedSubagents: "隐藏已关闭",
    subagentStarted: "子代理已启动",
    subagentFinished: "子代理已完成",
    subagentFailed: "子代理失败",
    files: "文件",
    openInIde: "用 IDE 打开",
    openIde: "打开 IDE",
    ideUnavailable: "没有找到可用 IDE 命令",
    gitUnavailable: "Git 不可用",
    runtimeDetails: "运行详情",
    primaryActions: "主要操作",
    diagnostics: "诊断",
    workspaceTool: "工作区",
    claudeCodeTool: "Claude Code",
    claudeCodeHelp: "在当前项目里运行真实 Claude Code 命令。",
    interactiveClaude: "交互式 Claude",
    interactiveClaudeHelp: "遇到原生权限确认、/model、/effort、/resume 等 slash command 流程时，打开真正的 Claude Code TUI；非交互聊天会使用设置里的 CLI 参数。",
    permissionDeniedNotice: "当前模式下，有一部分任务因权限确认而未能完成。",
    openInteractiveClaude: "打开交互式 Claude",
    claudeArgs: "Claude 参数",
    claudeArgsPlaceholder: "输入 Claude Code 命令",
    quickClaudeCommands: "常用命令",
    runClaude: "运行 Claude",
    installPlugin: "安装插件",
    updatePlugin: "更新",
    disablePlugin: "禁用",
    pluginName: "插件名",
    pluginNamePlaceholder: "github@openai 或 plugin@marketplace",
    pluginActions: "插件操作",
    pluginActionEvidence: "最近 CLI 操作证据",
    pluginRowActionEvidence: "最近执行",
    copyEvidence: "复制证据",
    openOutputs: "打开输出",
    confirmDisableTitle: "要禁用这个插件吗？",
    confirmDisableWarning: "这会禁用「{name}」。之后可以通过重新安装或更新来重新启用它。",
    confirmDisableButton: "确认禁用",
    confirmCliActionTitle: "确认执行本机 CLI 操作",
    confirmCliActionWarning: "这会通过 Claude Code CLI 修改本机插件或市场状态：{command}",
    confirmCliActionButton: "确认执行",
    dismissAction: "取消",
    installedPlugins: "已安装的插件",
    pluginRefresh: "刷新",
    pluginsLoading: "正在加载插件...",
    pluginsEmpty: "尚未安装任何插件。",
    pluginsLoadError: "无法加载插件列表。",
    pluginStatusEnabled: "已启用",
    pluginStatusDisabled: "已禁用",
    enablePlugin: "启用",
    uninstallPlugin: "卸载",
    installedCliPlugins: "CLI 已安装插件",
    marketplaceCatalog: "市场插件目录",
    marketplaceSources: "已配置市场",
    marketplacePluginCount: "{count} 个可安装插件",
    noMarketplacePlugins: "本地市场目录里没有找到可安装插件。",
    noMcpServers: "没有配置 MCP 服务器。",
    mcpServers: "MCP 服务器",
    recordMcpStatus: "记录 MCP 状态",
    copyRawMcpStatus: "复制原始输出",
    mcpTransport: "传输",
    mcpError: "错误",
    mcpStatusOk: "可用",
    mcpStatusPending: "待确认",
    mcpStatusError: "异常",
    mcpStatusUnknown: "未知",
    installFromMarketplace: "从市场安装",
    openHomepage: "主页",
    source: "来源",
    repository: "仓库",
    status: "状态",
    description: "描述",
    category: "分类",
    author: "作者",
    scope: "范围",
    version: "版本",
    installPath: "安装路径",
    rawOutput: "原始输出",
    runStreaming: "正在运行，输出会实时显示在下面。",
    doctor: "诊断",
    help: "帮助",
    agents: "Agents",
    projectCommand: "项目命令",
    pluginHelp: "插件帮助",
    mcpHelp: "MCP 帮助",
    marketplaceHelp: "市场帮助",
    commandReference: "命令参考",
    commandPalette: "命令面板",
    commandHint: "搜索操作、工具、技能和提示词...",
    noCommands: "没有匹配的命令。",
    selectProject: "选择项目文件夹",
    openProject: "打开项目文件夹",
    openFolderShort: "打开文件夹",
    openTerminal: "打开终端",
    openBrowser: "打开网址",
    capabilities: "插件、技能、工具",
    capabilitiesSubtitle: "启用一次后，Claudex 会在每次聊天里自动记住。",
    capabilitySearch: "搜索能力",
    searchPlugins: "搜索插件",
    searchSkills: "搜索技能",
    searchMarketplace: "搜索市场",
    capabilityAll: "全部",
    capabilityEnabled: "已启用",
    capabilityDisabled: "已关闭",
    capabilitySummary: "已启用 {enabled} 个 · 总共 {total} 个",
    installed: "已安装",
    installedLocal: "本地已安装",
    localSkillRegistry: "本地 Skills registry",
    localSkillRegistryHint: "来自本机 SKILL.md 扫描，不是静态演示目录。",
    localSkillRegistryFallback: "未发现本机 SKILL.md，下面仅显示本地能力设置 fallback。",
    skillRegistryEvidence: "Skills registry 证据",
    skillRegistryRoots: "扫描根目录",
    skillRegistryComplete: "完整扫描",
    skillRegistryTruncated: "已截断",
    openSkillFile: "打开 SKILL.md",
    openSkillFileCommand: "打开技能文件",
    pinSkillEvidence: "固定证据",
    skillPath: "技能路径",
    skillRoot: "技能根目录",
    marketplaceHint: "市场命令由 Claude Code CLI 支撑。安装前请在 Claude Code 面板获取实时市场输出。",
    marketplaceSourceClaude: "Claude Code 市场",
    marketplaceSourceCustom: "自定义市场",
    marketplaceInstallReview: "安装前核对",
    marketplaceInstallRisk: "安装会通过 Claude Code CLI 写入本机插件，并运行来自该市场来源的本地插件代码。",
    marketplaceUpdateRisk: "更新会通过 Claude Code CLI 刷新本机市场索引，并影响后续可安装插件目录。",
    marketplaceRisk: "风险",
    managePlugins: "管理",
    openClaudePanel: "打开 Claude 面板",
    capabilityStatusIssues: "CLI 状态告警",
    capabilityStatusIssueCount: "{count} 个后台状态命令失败",
    capabilityStatusBackedByStatus: "来自 Claude Code 状态刷新；只展示真实 CLI 失败，不写入 commandRuns。",
    retryCliStatus: "重试状态",
    runtimeHealth: "运行健康",
    runtimeHealthOk: "本地运行时正常",
    runtimeHealthUnknown: "等待状态刷新",
    runtimeHealthIssueCount: "{count} 项需要处理",
    runtimeHealthBackedByCli: "来自 Claude Code CLI 状态刷新 + Claudex 本地设置；不写入 commandRuns。",
    runtimeHealthLocalSetting: "来自 Claudex 本地设置",
    runtimeHealthPluginCount: "{count} 个插件",
    runtimeHealthSkillCount: "{count} 个技能",
    runtimeHealthMcpCount: "{count} 个 MCP",
    runtimeHealthMarketplaceCount: "{count} 个市场",
    runtimeHealthEvidence: "运行健康证据",
    runtimeHealthOpenTarget: "打开对应工作台",
    copyRuntimeHealthEvidence: "复制健康证据",
    pinRuntimeHealthEvidence: "固定到证据",
    runtimeHealthNoticeTitle: "Runtime 健康需要处理",
    noCapabilities: "没有匹配的能力。",
    enabled: "已启用",
    disabled: "已关闭",
    activeProject: "当前项目",
    noProjectPath: "还没有选择文件夹。",
    projectPathMissing: "路径失效",
    projectPathMissingHint: "所选项目文件夹不存在；本地命令暂时回退到用户目录。重新选择项目或恢复路径。",
    urlPlaceholder: "输入网址",
    openSettings: "打开设置",
    setupProvider: "配置服务商",
    setupProviderHint: "发送前请保存 API 密钥，或者切换到 Ollama。",
    copy: "复制",
    copied: "已复制",
    copyPath: "复制路径",
    copiedPath: "路径已复制",
    retry: "重试",
    projectSelected: "项目已选择",
    terminalOpened: "终端已打开",
    browserOpened: "网址已打开",
    dataOpened: "数据文件已打开",
    scheduledTitle: "计划任务",
    scheduledSubtitle: "保存到主进程本地队列，按项目/聊天绑定，并由 Claude Code CLI 执行。",
    schedulePrompt: "提示词",
    schedulePromptPlaceholder: "稍后要让 Claude Code 做什么？",
    scheduleTime: "时间",
    scheduleRepeat: "重复",
    scheduleRepeatOnce: "一次",
    scheduleRepeatDaily: "每天",
    scheduleRepeatWeekly: "每周",
    addSchedule: "添加任务",
    scheduleQueue: "队列",
    scheduleCount: "已保存 {count} 个",
    scheduleAnytime: "任何时间",
    scheduleProject: "项目",
    scheduleThread: "聊天",
    scheduleStatus: "状态",
    scheduleNextRun: "下次运行",
    scheduleLastRun: "上次运行",
    scheduleHistory: "运行历史",
    scheduleBackedByLocalStore: "主进程本地状态 · Claude Code CLI 承接运行",
    automationStatusIdle: "手动",
    automationStatusScheduled: "已计划",
    automationStatusPaused: "已暂停",
    automationStatusRunning: "运行中",
    automationStatusSucceeded: "已完成",
    automationStatusFailed: "失败",
    automationTriggerManual: "手动触发",
    automationTriggerScheduled: "计划触发",
    automationEvidence: "运行证据",
    copyAutomationEvidence: "复制证据",
    automationRawEvidence: "原始证据",
    automationStdout: "标准输出",
    automationStderr: "标准错误",
    automationSession: "会话",
    timelineEvidence: "Timeline 证据",
    timelineEvidenceEmpty: "这个事件只有状态摘要，还没有关联到原始输出。",
    timelineEventType: "事件类型",
    timelineEventRawType: "Raw 类型",
    timelineAutomationAction: "自动化操作",
    timelineSubagentAction: "子代理操作",
    timelineThreadAction: "聊天操作",
    timelineSkillRegistry: "技能 registry",
    selectedRunEvidence: "选中证据",
    selectedRunEvidenceHint: "点击 timeline 行后，这里固定显示关联到本地 store/CLI 的完整证据。",
    automationRunHistoryShort: "最近 3 次",
    automationCreated: "自动化已保存",
    automationDeleted: "自动化已删除",
    automationPaused: "自动化已暂停",
    automationResumed: "自动化已恢复",
    automationRunning: "自动化正在运行",
    automationSucceeded: "自动化已完成",
    automationFailed: "自动化失败",
    pauseAutomation: "暂停",
    resumeAutomation: "恢复",
    noAutomationHistory: "还没有运行记录",
    runNow: "立即运行",
    delete: "删除",
    renameThread: "重命名",
    pinThread: "置顶",
    unpinThread: "取消置顶",
    archiveThread: "归档",
    restoreThread: "恢复",
    forkThread: "Fork",
    resumeThread: "继续",
    deleteThread: "删除",
    renameThreadPrompt: "新的聊天标题",
    threadArchived: "聊天已归档",
    threadDeleted: "聊天已删除",
    threadForked: "聊天已 Fork",
    threadPinned: "聊天已置顶",
    threadUnpinned: "已取消置顶",
    threadResumed: "已继续这个聊天",
    deleteThreadConfirm: "确定要永久删除这个聊天吗？",
    projectFilteredChats: "当前项目",
    allProjectChats: "全部项目",
    showArchivedChats: "查看归档",
    threadScopeEvidence: "历史范围",
    threadScopeMatch: "匹配 {shown}/{total}",
    threadScopeCount: "{count} 条",
    emptySchedule: "还没有计划任务。",
    emptyScheduleHint: "有任务想先放着但不想新开聊天时，可以先保存到这里。",
    copiedPrompt: "提示词已填入",
    browserHelp: "不用离开工作区，直接预览文档、服务商控制台或项目网址。",
    browserPreview: "预览",
    browserBack: "后退",
    browserForward: "前进",
    browserReload: "刷新",
    browserLoading: "页面加载中...",
    browserReady: "预览已加载",
    browserIdle: "还没有预览页面",
    browserEmptyTitle: "未打开页面",
    browserEmptyHint: "输入文档、issue、本地应用或服务商网址后，在这里预览。登录、下载或阻止嵌入的页面请用外部打开。",
    browserFailed: "该页面无法在内嵌浏览器中加载。",
    browserExternalHint: "登录页、下载和阻止嵌入的网站，请用外部打开。",
    openExternal: "外部打开",
    browserHistory: "浏览记录",
    browserEvidence: "浏览器证据",
    browserVisitCount: "{count} 条记录",
    browserStatusReady: "已加载",
    browserStatusLoading: "加载中",
    browserStatusError: "失败",
    browserStatusExternal: "外部打开",
    browserNoHistory: "还没有浏览器证据。",
    browserBackedByWebview: "来自真实 Electron webview 加载/失败事件",
    browserErrorCode: "错误码",
    browserFinalUrl: "最终 URL",
    browserPageTitle: "标题",
    browserCapturedAt: "捕获时间",
    browserValidatedUrl: "验证 URL",
    browserHttpStatus: "HTTP",
    browserExcerpt: "摘录",
    copyBrowserEvidence: "复制证据",
    copiedBrowserEvidence: "证据已复制",
    browserMainFrame: "主框架",
    reopenBrowserVisit: "重新打开",
    commandRunning: "运行中",
    cancelCommand: "停止命令",
    commandCancelled: "命令已停止",
    commandSucceeded: "已完成",
    commandFailed: "失败",
    commandHistory: "最近运行",
    workspaceCommandEvidence: "Workspace 命令证据",
    workspaceCommandBackedByStore: "来自主进程本地 commandRuns",
    claudeCommandEvidence: "Claude CLI 证据",
    claudeCommandBackedByStore: "来自主进程本地 commandRuns · Claude Code panel 真实 CLI 操作",
    capabilityCommandEvidence: "Plugin/MCP CLI 证据",
    capabilityCommandBackedByTimeline: "来自主进程本地 commandRuns · Capability workbench 真实 Claude Code CLI 操作",
    clearHistory: "清空",
    runningNow: "正在运行",
    completedRuns: "{count} 条记录",
    commandLine: "命令",
    commandCwd: "工作目录",
    commandExit: "退出码",
    commandDuration: "耗时",
    commandStdout: "标准输出",
    commandStderr: "标准错误",
    liveOutput: "实时输出",
    noOutput: "没有输出",
    copyOutput: "复制输出",
    outputCopied: "输出已复制",
    terminalHelp: "直接在当前项目文件夹里启动终端。",
    opensExternalTerminal: "会打开系统终端，并把当前项目作为工作目录。",
    path: "路径",
    workspaceHelp: "浏览源码、安全编辑；只有你输入命令后才会运行。",
    refresh: "刷新",
    saveFile: "保存文件",
    saveChanges: "保存改动",
    savedChanges: "改动已保存",
    editFile: "编辑",
    reviewFile: "审查",
    fileSize: "大小",
    fileUpdatedAt: "更新",
    changedLines: "改动行",
    reviewUnsavedChanges: "保存前先审查未保存改动。",
    reviewRequiredTitle: "需要先审查",
    reviewRequiredHint: "先打开审查视图确认差异，再保存。",
    reviewingChanges: "正在审查改动",
    readyToSave: "可以保存",
    reviewFirstToSave: "保存前请先查看改动。",
    noFileChanges: "这个文件没有改动。",
    noChangesToReview: "先编辑文件，这里会显示差异。",
    revertChanges: "撤销",
    reviewChanges: "查看改动",
    diffPreview: "差异预览",
    diffPreviewSkippedLarge: "文件超过 1MB，已禁用差异预览以保持输入流畅。",
    fileConflictReload: "重新读取文件",
    gitDiffStat: "Diff 统计",
    gitDiffPreview: "Git Diff",
    gitDiffTruncated: "Diff 已截断，仅显示前面的部分。",
    gitRawStatus: "Raw Status",
    noGitDiff: "当前没有可显示的 diff 统计。",
    allChanges: "全部变更",
    allHunks: "全部 hunks",
    gitHunks: "Diff hunks",
    gitHunkReview: "Hunk review",
    selectedHunk: "选中 hunk",
    focusHunk: "聚焦 hunk",
    gitSummary: "Git 变更摘要",
    stagedChanges: "已暂存",
    unstagedChanges: "未暂存",
    untrackedChanges: "未跟踪",
    mixedChanges: "混合",
    renamedChanges: "重命名",
    deletedChanges: "删除",
    conflictedChanges: "冲突",
    gitSummaryBackedByCli: "来自 git status --short --branch 与 git diff",
    gitRoot: "Git 根目录",
    gitRelativePath: "项目相对路径",
    focusFileDiff: "聚焦文件 diff",
    focusedFileDiff: "已聚焦文件",
    gitEvidence: "Git 证据",
    gitEvidenceHint: "点击文件后固定显示真实 git status / diff 证据。",
    gitFileEvidence: "文件证据",
    copyGitEvidence: "复制 Git 证据",
    stageFile: "暂存文件",
    unstageFile: "取消暂存",
    commitStaged: "提交已暂存",
    pushBranch: "推送分支",
    gitCommitMessage: "提交消息",
    gitCommitPlaceholder: "简短说明",
    gitCommandHint: "通过真实 Git CLI 执行，结果写入 run timeline 和命令 evidence。",
    gitNoStagedChanges: "没有已暂存文件",
    gitPushHint: "推送当前分支到已配置的 upstream/remote。",
    gitPushUnavailableNoUpstream: "无 upstream，先在终端设置远端。",
    gitActionRunning: "Git 操作中",
    recentGitAction: "最近 Git 操作",
    gitActionEvidenceHint: "来自 run timeline / workspace command 的本地证据",
    gitCommitHash: "Commit",
    gitPushResult: "Push",
    confirmGitActionTitle: "确认执行 Git 操作",
    confirmGitStageWarning: "这会在当前项目暂存文件：{path}",
    confirmGitUnstageWarning: "这会从 index 取消暂存文件，但保留工作区内容：{path}",
    confirmGitCommitWarning: "这会提交当前已暂存改动：{message}",
    confirmGitPushWarning: "这会执行 git push，把当前分支推送到远端。",
    runCommand: "运行命令",
    runCommandShort: "运行",
    commandPlaceholder: "输入 shell 命令",
    noFileSelected: "从文件树里选择一个源码文件。",
    noFileOpenTitle: "还没有打开文件",
    noFileOpenHint: "选择文件后可以编辑，并在保存前先查看改动。",
    noProjectSelected: "请先选择项目。",
    fileSaved: "文件已保存",
    commandFinished: "命令已完成",
    loading: "加载中",
    uxReady: "可以开始工作",
    savedAt: "已保存",
    draftThread: "草稿",
    threadNoMessages: "还没有消息",
    threadMessageCount: "{count} 条消息",
    threadRunning: "运行中",
    loadingChats: "正在加载聊天记录...",
    chatsLoadError: "无法加载聊天记录。",
    noChatsYet: "还没有聊天记录，点击上方开始一个。",
    noChatsMatch: "没有匹配的聊天记录。",
    threadNeedsPermission: "该对话需要在交互式 Claude 中确认权限。",
    voiceInputUnavailable: "此版本暂不支持语音输入。",
    messageSent: "已发送",
    permissionErrorHint: "权限不足——该文件或文件夹可能是只读或受限的。",
    openingFile: "正在打开文件...",
  },
};

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useFocusTrap(containerRef, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyFocused = document.activeElement;
    const getFocusable = () =>
      Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null);

    const first = getFocusable()[0];
    (first || container).focus?.();

    function handleKeyDown(event) {
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, active]);
}

function isEditableTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return tagName === "INPUT"
    || tagName === "TEXTAREA"
    || tagName === "SELECT"
    || target.isContentEditable
    || Boolean(target.closest?.("[contenteditable='true']"));
}

function isPrimaryShortcut(event, key) {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === key;
}

function isShortcutHelpKey(event) {
  return (event.ctrlKey || event.metaKey) && (event.key === "/" || event.code === "Slash");
}

function isEditableNavigationShortcut(event) {
  return ["k", "p", "t"].some((key) => isPrimaryShortcut(event, key));
}

function providerDefaults(providerId) {
  return providers.find((provider) => provider.id === providerId) || providers[0];
}

function providerAuthLabel(provider, t) {
  if (provider?.authMode === "api-key") return t.providerAuthApiKey;
  if (provider?.authMode === "none") return t.providerAuthNone;
  return t.providerAuthBearer;
}

function capabilityEnabled(settings, id) {
  const item = capabilityCatalog.find((capability) => capability.id === id);
  if (Object.prototype.hasOwnProperty.call(settings.capabilities || {}, id)) {
    return Boolean(settings.capabilities[id]);
  }
  return Boolean(item?.defaultEnabled);
}

function projectLabel(project, t) {
  return project?.name || project?.path || t.localWorkspace;
}

function sessionMessages(session) {
  return Array.isArray(session?.messages) ? session.messages : [];
}

function messageExcerpt(value, max = 78) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}

function cliActionEvidenceFromResult(args, result, fallback = {}) {
  const resolvedCode = typeof result?.code === "number" ? result.code : Number.isFinite(fallback.code) ? fallback.code : 1;
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    args: String(args || "").trim(),
    code: resolvedCode,
    durationMs: typeof result?.durationMs === "number" ? result.durationMs : typeof fallback.durationMs === "number" ? fallback.durationMs : 0,
    stdout: String(result?.stdout || fallback.stdout || ""),
    stderr: String(result?.stderr || fallback.stderr || ""),
    status: resolvedCode === 0 ? "ok" : "error",
    endedAt: new Date().toISOString(),
  };
}

function cliActionEvidenceDetail(evidence, t) {
  if (!evidence) return "";
  const parts = [`${t.commandExit}: ${evidence.code}`];
  if (typeof evidence.durationMs === "number") parts.push(`${t.commandDuration}: ${evidence.durationMs}ms`);
  if (evidence.stderr) parts.push(messageExcerpt(evidence.stderr, 120));
  return parts.join(" · ");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capabilityCommandLine(run) {
  return String(run?.command || run?.commandLine || "").trim();
}

function commandRunTime(run) {
  const value = run?.endedAt || run?.startedAt || "";
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function capabilityRunsNewestFirst(runs = []) {
  return (runs || [])
    .filter((run) => (run?.kind || "workspace") === "capability" && capabilityCommandLine(run))
    .slice()
    .sort((a, b) => commandRunTime(b) - commandRunTime(a));
}

function pluginActionRegex(identifier, actions = ["install", "update", "disable", "enable"]) {
  const id = String(identifier || "").trim();
  if (!id) return null;
  const suffix = id.includes("@") ? "" : "(?:@[^\\s]+)?";
  return new RegExp(`(?:^|\\s)plugin\\s+(?:${actions.join("|")})\\s+${escapeRegExp(id)}${suffix}(?=\\s|$)`, "i");
}

function findRecentPluginActionRun(runs, identifiers, actions) {
  const patterns = [...new Set((identifiers || []).map((item) => String(item || "").trim()).filter(Boolean))]
    .map((item) => pluginActionRegex(item, actions))
    .filter(Boolean);
  if (!patterns.length) return null;
  return runs.find((run) => patterns.some((pattern) => pattern.test(capabilityCommandLine(run)))) || null;
}

function findRecentMarketplaceActionRun(runs) {
  return runs.find((run) => /(?:^|\s)plugin\s+marketplace\s+(?:list|update|--help)(?=\s|$)/i.test(capabilityCommandLine(run))) || null;
}

function findRecentMcpActionRun(runs) {
  return runs.find((run) => /(?:^|\s)mcp\s+list(?=\s|$)/i.test(capabilityCommandLine(run))) || null;
}

function pluginActionArgsFromRun(run, fallbackIdentifier = "") {
  const commandLine = capabilityCommandLine(run);
  const match = commandLine.match(/(?:^|\s)plugin\s+(enable|disable|update|install)\s+([^\s]+)/i);
  const action = String(match?.[1] || "").trim().toLowerCase();
  const identifier = String(match?.[2] || fallbackIdentifier || "").trim();
  if (!action || !identifier) return "";
  return `plugin ${action} ${identifier}`;
}

function claudeArgsFromRun(run) {
  return String(run?.commandLine || run?.command || "")
    .replace(/^claude\s+/i, "")
    .trim();
}

function workspaceCommandFromRun(run) {
  return String(run?.commandLine || run?.command || "").trim();
}

function safeCapabilityRetryArgsFromRun(run) {
  const args = claudeArgsFromRun(run);
  if (!args) return "";
  const safePatterns = [
    /^mcp\s+(?:list|--help)$/i,
    /^plugin\s+list(?:\s+--json)?$/i,
    /^plugin\s+--help$/i,
    /^plugin\s+marketplace\s+(?:list(?:\s+--json)?|--help)$/i,
  ];
  return safePatterns.some((pattern) => pattern.test(args)) ? args : "";
}

function mutatingCapabilityRetryArgsFromRun(run) {
  const args = claudeArgsFromRun(run);
  if (!args) return "";
  const mutatingPatterns = [
    /^plugin\s+(?:install|update|enable|disable)\s+\S+/i,
    /^plugin\s+marketplace\s+update$/i,
  ];
  return mutatingPatterns.some((pattern) => pattern.test(args)) ? args : "";
}

function capabilityRetryArgsFromRun(run) {
  return safeCapabilityRetryArgsFromRun(run) || mutatingCapabilityRetryArgsFromRun(run);
}

function capabilityRetryFocusForArgs(args) {
  const actionFocus = capabilityActionFocusForCommand(args);
  if (actionFocus) return actionFocus;
  const parts = String(args || "").trim().split(/\s+/).filter(Boolean);
  if (parts[0] === "plugin" && parts[1] === "marketplace" && parts[2] === "update") {
    return { tab: "marketplace", kind: "marketplace-source", id: "", query: "" };
  }
  if (parts[0] === "plugin" && ["install", "update", "enable", "disable"].includes(String(parts[1] || "").toLowerCase())) {
    const identifier = parts[2] || "";
    return {
      tab: parts[1] === "install" ? "marketplace" : "plugins",
      kind: parts[1] === "install" ? "marketplace-plugin" : "plugin",
      id: identifier,
      query: parts[1] === "install" ? panelPluginNameFromId(identifier) : identifier,
    };
  }
  return { tab: "plugins", kind: "", id: "", query: "" };
}

function capabilityActionFocusForCommand(args, context = {}) {
  const parts = String(args || "").trim().split(/\s+/).filter(Boolean);
  if (parts[0] !== "plugin" || !parts[1]) return null;
  if (parts[1] === "marketplace" && parts[2] === "update") {
    const source = (context.marketplaces || []).find((item) => item?.name) || null;
    const idText = String(source?.name || "").trim();
    if (!idText) return null;
    return {
      tab: "marketplace",
      kind: "marketplace-source",
      id: idText,
      query: idText,
    };
  }
  const action = parts[1].toLowerCase();
  const identifier = parts[2] || "";
  if (!identifier) return null;
  if (action === "install") {
    return {
      tab: "marketplace",
      kind: "marketplace-plugin",
      id: identifier,
      query: panelPluginNameFromId(identifier),
    };
  }
  if (["enable", "disable", "update"].includes(action)) {
    return {
      tab: "plugins",
      kind: "plugin",
      id: identifier,
      query: panelPluginNameFromId(identifier),
    };
  }
  return null;
}

function cliStatusIssue(label, commandLine, commandState, t, jsonCommandLine = "") {
  if (!commandState) return null;
  const plainCode = typeof commandState.code === "number" ? commandState.code : null;
  const jsonCode = typeof commandState.jsonCode === "number" ? commandState.jsonCode : null;
  const jsonFailed = jsonCode !== null && jsonCode !== 0;
  const plainFailed = plainCode !== null && plainCode !== 0;
  if (!plainFailed && !jsonFailed) return null;
  const code = jsonFailed ? jsonCode : plainCode;
  const command = jsonFailed && jsonCommandLine ? jsonCommandLine : commandLine;
  const error = String(commandState.error || "").trim();
  return {
    id: `${label}:${command}`,
    label,
    commandLine: command,
    code,
    error,
    stdout: String(commandState.stdout || commandState.jsonStdout || ""),
    stderr: String(commandState.stderr || commandState.jsonStderr || error || ""),
  };
}

function commandIssueForHealth(label, commandLine, commandState, t, jsonCommandLine = "") {
  const issue = cliStatusIssue(label, commandLine, commandState, t, jsonCommandLine);
  return issue ? { ...issue, kind: "command" } : null;
}

function authNeedsAttention(claudeStatus, settings) {
  if (!claudeStatus) return false;
  if (settings?.env?.anthropicApiKey || settings?.env?.anthropicAuthToken) return false;
  if (!claudeStatus.auth) return true;
  return claudeStatus.auth.loggedIn === false;
}

function runtimeHealthSummary(claudeStatus, settings, activeProject, t) {
  const known = Boolean(claudeStatus);
  const commandIssues = [
    commandIssueForHealth("CLI", "--version", claudeStatus?.versionCommand, t),
    commandIssueForHealth(t.auth, "auth status", claudeStatus?.authCommand, t),
    commandIssueForHealth(t.plugins, "plugin list", claudeStatus?.pluginCommand, t, "plugin list --json"),
    commandIssueForHealth(t.mcps, "mcp list", claudeStatus?.mcpCommand, t),
    commandIssueForHealth(t.marketplace, "plugin marketplace list", claudeStatus?.marketplaceCommand, t, "plugin marketplace list --json"),
  ].filter(Boolean);
  const authIssue = authNeedsAttention(claudeStatus, settings)
    ? {
      id: "auth:login",
      label: t.auth,
      commandLine: "auth status",
      code: claudeStatus?.auth?.code ?? 0,
      error: claudeStatus?.auth?.raw || t.needsKey,
      kind: "auth",
    }
    : null;
  const issues = [...commandIssues, authIssue].filter(Boolean);
  const pluginIssue = cliStatusIssue(t.plugins, "plugin list", claudeStatus?.pluginCommand, t, "plugin list --json");
  const mcpIssue = cliStatusIssue(t.mcps, "mcp list", claudeStatus?.mcpCommand, t);
  const marketplaceIssue = cliStatusIssue(t.marketplace, "plugin marketplace list", claudeStatus?.marketplaceCommand, t, "plugin marketplace list --json");
  const runtimeIssue = cliStatusIssue("CLI", "--version", claudeStatus?.versionCommand, t);
  const authCommandIssue = cliStatusIssue(t.auth, "auth status", claudeStatus?.authCommand, t);
  const stateStatus = !known ? "pending" : issues.length ? "error" : "ok";
  const headline = !known
    ? t.runtimeHealthUnknown
    : issues.length
      ? t.runtimeHealthIssueCount.replace("{count}", issues.length)
      : t.runtimeHealthOk;
  const rows = [
    {
      id: "runtime",
      label: t.localRuntime,
      value: known ? claudeStatus.version || "Claude Code" : t.runtimeHealthUnknown,
      detail: "claude --version",
      status: runtimeIssue ? "error" : known ? "ok" : "pending",
      issue: runtimeIssue,
    },
    {
      id: "auth",
      label: t.auth,
      value: authLabel(claudeStatus?.auth, settings),
      detail: "claude auth status",
      status: authCommandIssue || authIssue ? "error" : known ? "ok" : "pending",
      issue: authCommandIssue || authIssue,
    },
    {
      id: "model",
      label: t.model,
      value: displayModelLabel(settings?.model),
      detail: t.runtimeHealthLocalSetting,
      status: "ok",
    },
    {
      id: "permission",
      label: t.permissionMode,
      value: permissionModeLabel(settings?.claudeCode?.permissionMode, t),
      detail: t.runtimeHealthLocalSetting,
      status: "ok",
    },
    {
      id: "plugins",
      label: t.plugins,
      value: known ? t.runtimeHealthPluginCount.replace("{count}", Array.isArray(claudeStatus.pluginItems) ? claudeStatus.pluginItems.length : 0) : t.runtimeHealthUnknown,
      detail: "claude plugin list --json",
      status: pluginIssue ? "error" : known ? "ok" : "pending",
      issue: pluginIssue,
    },
    {
      id: "skills",
      label: t.skills,
      value: known ? t.runtimeHealthSkillCount.replace("{count}", Array.isArray(claudeStatus.skillItems) ? claudeStatus.skillItems.length : 0) : t.runtimeHealthUnknown,
      detail: "SKILL.md registry",
      status: known ? "ok" : "pending",
    },
    {
      id: "mcp",
      label: t.mcps,
      value: known ? t.runtimeHealthMcpCount.replace("{count}", Array.isArray(claudeStatus.mcpServers) ? claudeStatus.mcpServers.length : 0) : t.runtimeHealthUnknown,
      detail: "claude mcp list",
      status: mcpIssue ? "error" : known ? "ok" : "pending",
      issue: mcpIssue,
    },
    {
      id: "marketplace",
      label: t.marketplace,
      value: known ? t.runtimeHealthMarketplaceCount.replace("{count}", Array.isArray(claudeStatus.marketplaces) ? claudeStatus.marketplaces.length : 0) : t.runtimeHealthUnknown,
      detail: "claude plugin marketplace list --json",
      status: marketplaceIssue ? "error" : known ? "ok" : "pending",
      issue: marketplaceIssue,
    },
    {
      id: "project",
      label: t.activeProject,
      value: projectLabel(activeProject, t),
      detail: activeProject?.path || t.noProjectPath,
      status: activeProject?.path ? "ok" : "pending",
    },
  ];
  return { known, status: stateStatus, headline, issues, rows };
}

function runtimeHealthEvidenceText(summary, t) {
  const lines = [
    `${t.runtimeHealth}: ${summary?.headline || ""}`,
    `${t.scheduleStatus}: ${summary?.status || ""}`,
    "",
    ...(summary?.rows || []).map((row) => `${row.label}: ${row.value || "-"} · ${row.status || "-"} · ${row.detail || "-"}`),
  ];
  if (summary?.issues?.length) {
    lines.push("", t.capabilityStatusIssues);
    for (const issue of summary.issues) {
      lines.push(`- ${issue.label}: claude ${issue.commandLine} · ${t.commandExit}: ${issue.kind === "auth" ? t.needsKey : issue.code}`);
      if (issue.error) lines.push(`  ${issue.error}`);
      if (issue.stdout) lines.push(`  stdout: ${messageExcerpt(issue.stdout, 240)}`);
      if (issue.stderr && issue.stderr !== issue.error) lines.push(`  stderr: ${messageExcerpt(issue.stderr, 240)}`);
    }
  }
  return lines.filter((line, index) => index < 2 || String(line || "").trim()).join("\n");
}

function runtimeHealthTargetForRow(row) {
  if (!row?.id) return "";
  if (row.id === "plugins") return "plugins";
  if (row.id === "skills") return "skills";
  if (row.id === "mcp") return "mcp";
  if (row.id === "marketplace") return "marketplace";
  if (row.id === "runtime" || row.id === "auth") return "claude";
  return "";
}

function runtimeHealthTargetForIssue(issue) {
  const commandLine = String(issue?.commandLine || "");
  if (/plugin\s+marketplace/i.test(commandLine)) return "marketplace";
  if (/\bmcp\b/i.test(commandLine)) return "mcp";
  if (/\bplugin\b/i.test(commandLine)) return "plugins";
  return "claude";
}

function runtimeHealthIssueSignature(summary) {
  return (summary?.issues || [])
    .map((issue) => [
      issue.commandLine,
      issue.code,
      messageExcerpt(issue.error || issue.stderr || issue.stdout || "", 96),
    ].filter((item) => item !== undefined && item !== null).join(":"))
    .join("|");
}

function runtimeHealthNoticePayload(summary, activeProject, t) {
  if (!summary?.issues?.length) return null;
  const signature = runtimeHealthIssueSignature(summary);
  const target = runtimeHealthTargetForIssue(summary.issues[0]);
  return {
    level: "error",
    source: "runtime-health",
    title: t.runtimeHealthNoticeTitle,
    detail: runtimeHealthEvidenceText(summary, t),
    key: `runtime-health:${projectKey(activeProject) || "workspace"}:${signature}`,
    action: `runtime-health:${target}`,
    projectPath: activeProject?.path || "",
  };
}

function RuntimeHealthCard({
  claudeStatus,
  settings,
  activeProject,
  t,
  onRetry,
  onOpenClaudePanel,
  onOpenRow,
  onOpenIssue,
  onRecordEvidence,
  busy = false,
  compact = false,
}) {
  const [copied, setCopied] = useState(false);
  const summary = runtimeHealthSummary(claudeStatus, settings, activeProject, t);
  const HeadIcon = summary.status === "error" ? AlertTriangle : summary.status === "pending" ? Clock3 : Shield;

  async function copyEvidence() {
    const text = runtimeHealthEvidenceText(summary, t);
    try {
      await navigator.clipboard?.writeText(text);
    } catch (_error) {
      // Clipboard permissions vary; visible feedback still records the copy intent.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }

  return (
    <section className={cx("runtime-health-card", summary.status, compact && "compact")} aria-label={t.runtimeHealth}>
      <div className="runtime-health-head">
        <HeadIcon size={15} />
        <div>
          <span>{t.runtimeHealth}</span>
          <strong>{summary.headline}</strong>
          <small>{t.runtimeHealthBackedByCli}</small>
        </div>
        {(onRetry || onOpenClaudePanel) && (
          <div className="runtime-health-actions">
            {onRetry && (
              <button type="button" className="plain-action subtle-action" onClick={onRetry} disabled={busy} title={busy ? t.workingHint : t.refreshCliStatus}>
                <RefreshCw size={13} className={busy ? "spin" : undefined} />
                {t.retryCliStatus}
              </button>
            )}
            {onOpenClaudePanel && (
              <button type="button" className="plain-action subtle-action" onClick={onOpenClaudePanel}>
                <Bot size={13} />
                {t.openClaudePanel}
              </button>
            )}
            <button type="button" className="plain-action subtle-action" data-runtime-health-action="copy" onClick={copyEvidence}>
              <Copy size={13} />
              {copied ? t.copied : t.copyRuntimeHealthEvidence}
            </button>
            {onRecordEvidence && (
              <button type="button" className="plain-action subtle-action" data-runtime-health-action="pin" onClick={() => onRecordEvidence(summary, runtimeHealthEvidenceText(summary, t))}>
                <Pin size={13} />
                {t.pinRuntimeHealthEvidence}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="runtime-health-grid">
        {summary.rows.map((row) => {
          const RowIcon = row.status === "error" ? AlertTriangle : row.status === "pending" ? Clock3 : Check;
          const target = runtimeHealthTargetForRow(row);
          const actionable = Boolean(target && onOpenRow);
          const RowTag = actionable ? "button" : "article";
          return (
            <RowTag
              className={cx("runtime-health-row", row.status, actionable && "actionable")}
              key={row.id}
              title={[row.detail, row.issue?.error, actionable ? t.runtimeHealthOpenTarget : ""].filter(Boolean).join("\n")}
              data-health-row={row.id}
              type={actionable ? "button" : undefined}
              onClick={actionable ? () => onOpenRow(row, summary) : undefined}
            >
              <RowIcon size={12} />
              <div>
                <span>{row.label}</span>
                <strong>{messageExcerpt(row.value, compact ? 36 : 64)}</strong>
              </div>
            </RowTag>
          );
        })}
      </div>
      {summary.issues.length > 0 && (
        <details className="runtime-health-issues" open={!compact}>
          <summary>{t.capabilityStatusIssueCount.replace("{count}", summary.issues.length)}</summary>
          <div className="runtime-health-issue-list">
            {summary.issues.map((issue) => {
              const target = runtimeHealthTargetForIssue(issue);
              const actionable = Boolean(target && onOpenIssue);
              return (
                <article
                  className={cx("runtime-health-issue", actionable && "actionable")}
                  key={issue.id}
                  data-runtime-health-issue-id={issue.id}
                  data-runtime-health-issue-target={target}
                  data-runtime-health-issue-command={issue.commandLine}
                >
                  <div>
                    <strong>{issue.label}</strong>
                    <span>claude {issue.commandLine}</span>
                  </div>
                  <em>{issue.kind === "auth" ? t.needsKey : `${t.commandExit}: ${issue.code}`}</em>
                  {actionable && (
                    <button
                      type="button"
                      className="plain-action subtle-action runtime-health-issue-action"
                      data-runtime-health-issue-action="open"
                      data-runtime-health-issue-target={target}
                      title={[issue.error, t.runtimeHealthOpenTarget].filter(Boolean).join("\n")}
                      onClick={() => onOpenIssue(issue, summary, target)}
                    >
                      <ExternalLink size={12} />
                      {t.runtimeHealthOpenTarget}
                    </button>
                  )}
                  {issue.error && <code title={issue.error}>{messageExcerpt(issue.error, 220)}</code>}
                </article>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}

function CliStatusDetail({ issue, t, onRetry, onOpenClaudePanel, disabled, spinning }) {
  if (!issue) return null;
  return (
    <section className="plugin-tab-status-detail error" aria-label={`${t.capabilityStatusIssues}: ${issue.label}`}>
      <div className="plugin-tab-status-head">
        <AlertTriangle size={14} />
        <div>
          <span>{t.capabilityStatusIssues}</span>
          <strong>{issue.label}</strong>
        </div>
        <em>{t.commandExit}: {issue.code}</em>
      </div>
      <dl className="plugin-tab-status-meta">
        <div><dt>{t.commandLine}</dt><dd>claude {issue.commandLine}</dd></div>
        {issue.error && <div><dt>{t.commandStderr}</dt><dd title={issue.error}>{messageExcerpt(issue.error, 220)}</dd></div>}
      </dl>
      {issue.error && (
        <pre className="plugin-tab-status-raw">{issue.error}</pre>
      )}
      <div className="plugin-tab-status-actions">
        <button type="button" className="plain-action subtle-action" onClick={onRetry} disabled={disabled} title={disabled ? t.workingHint : t.refreshCliStatus}>
          <RefreshCw size={13} className={spinning ? "spin" : undefined} />
          {t.retryCliStatus}
        </button>
        <button type="button" className="plain-action subtle-action" onClick={onOpenClaudePanel}>
          <Bot size={13} />
          {t.openClaudePanel}
        </button>
      </div>
    </section>
  );
}

function rowCliActionEvidenceText(run, t) {
  const commandLine = capabilityCommandLine(run);
  const code = typeof run?.code === "number" ? run.code : null;
  const duration = typeof run?.durationMs === "number" ? `${run.durationMs}ms` : "";
  const stdout = String(run?.stdout || "");
  const stderr = String(run?.stderr || "");
  return [
    `$ ${commandLine}`,
    run?.cwd ? `${t.commandCwd}: ${run.cwd}` : "",
    `${t.commandExit}: ${code ?? "-"}${duration ? ` (${duration})` : ""}`,
    stdout ? `\n${t.commandStdout}\n${stdout}` : "",
    stderr ? `\n${t.commandStderr}\n${stderr}` : "",
  ].filter(Boolean).join("\n");
}

function pluginEvidenceText(plugin = {}, t) {
  const status = plugin.enabled ? t.pluginStatusEnabled : t.pluginStatusDisabled;
  const rows = [
    [t.pluginName, plugin.id || plugin.name],
    plugin.name && plugin.name !== plugin.id ? [t.pluginName, plugin.name] : null,
    plugin.version && plugin.version !== "unknown" ? [t.version, plugin.version] : null,
    plugin.scope ? [t.scope, plugin.scope] : null,
    plugin.marketplace ? [t.marketplace, plugin.marketplace] : null,
    [t.status, status],
    plugin.source ? [t.source, summarizePanelPluginField(plugin.source)] : null,
    plugin.installPath ? [t.installPath, plugin.installPath] : null,
    plugin.tools ? [t.tools, summarizePanelPluginField(plugin.tools)] : null,
    plugin.permissions ? [t.allowedTools, summarizePanelPluginField(plugin.permissions)] : null,
    plugin.error ? [t.mcpError, plugin.error] : null,
  ].filter(Boolean);
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function marketplacePluginEvidenceText(plugin = {}, t) {
  const rows = [
    [t.pluginName, plugin.id || plugin.name],
    plugin.name && plugin.name !== plugin.id ? [t.pluginName, plugin.name] : null,
    plugin.marketplace ? [t.marketplace, plugin.marketplace] : null,
    plugin.version && plugin.version !== "unknown" ? [t.version, plugin.version] : null,
    plugin.category ? [t.category, plugin.category] : null,
    plugin.author ? [t.author, plugin.author] : null,
    plugin.installed ? [t.status, t.installedLocal] : [t.status, t.installFromMarketplace],
    plugin.description ? [t.description, plugin.description] : null,
    plugin.source ? [t.source, summarizePanelPluginField(plugin.source)] : null,
    plugin.homepage ? [t.openHomepage, plugin.homepage] : null,
    plugin.permissions ? [t.allowedTools, summarizePanelPluginField(plugin.permissions)] : null,
    plugin.risk ? [t.marketplaceRisk, plugin.risk] : null,
  ].filter(Boolean);
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function marketplaceSourceEvidenceText(source = {}, t) {
  const rows = [
    [t.marketplaceSources, source.name || source.repo || source.source],
    source.source ? [t.source, summarizePanelPluginField(source.source)] : null,
    source.repo ? [t.repository, summarizePanelPluginField(source.repo)] : null,
    source.installLocation ? [t.installPath, source.installLocation] : null,
    source.version ? [t.version, source.version] : null,
    source.status ? [t.status, source.status] : null,
    source.description ? [t.description, source.description] : null,
    source.permissions ? [t.allowedTools, summarizePanelPluginField(source.permissions)] : null,
    source.tools ? [t.tools, summarizePanelPluginField(source.tools)] : null,
    source.error ? [t.mcpError, summarizePanelPluginField(source.error)] : null,
  ].filter(Boolean);
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function mcpServerEvidenceText(server = {}, t) {
  const rows = [
    [t.mcpServers, server.name],
    server.status ? [t.status, `${mcpStatusLabel(server.status, t)} (${server.status})`] : null,
    server.detail ? [t.description, server.detail] : null,
    typeof server.tools === "number" ? [t.tools, String(server.tools)] : null,
    server.transport ? [t.mcpTransport, server.transport] : null,
    server.source ? [t.source, server.source] : null,
    server.error ? [t.mcpError, server.error] : null,
    server.raw ? [t.rawOutput, server.raw] : null,
  ].filter(Boolean);
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function skillEvidenceText(skill = {}, t) {
  const rows = [
    [t.skills, skill.name || skill.id],
    skill.id && skill.id !== skill.name ? ["ID", skill.id] : null,
    skill.description ? [t.description, skill.description] : null,
    skill.status ? [t.status, skill.status] : null,
    skill.source ? [t.source, skill.source] : null,
    skill.path ? [t.skillPath, skill.path] : null,
    skill.root ? [t.skillRoot, skill.root] : null,
    skill.relativePath ? [t.path, skill.relativePath] : null,
    skill.updatedAt ? [t.fileUpdatedAt, skill.updatedAt] : null,
  ].filter(Boolean);
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function RowCliActionEvidence({ run, t, onOpenOutputs, onRetry }) {
  const [copied, setCopied] = useState(false);
  if (!run) return null;
  const commandLine = capabilityCommandLine(run);
  const code = typeof run.code === "number" ? run.code : null;
  const output = String(run.stderr || run.stdout || "");
  const status = code === 0 ? "ok" : "error";
  const duration = typeof run.durationMs === "number" ? `${run.durationMs}ms` : "";
  const outputSummary = output ? messageExcerpt(output, 180) : "";
  const evidenceText = rowCliActionEvidenceText(run, t);

  async function copyEvidence() {
    try {
      await navigator.clipboard?.writeText(evidenceText);
    } catch (_error) {
      // Clipboard permissions vary by shell; visible feedback still records the copy intent.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className={cx("row-cli-action-evidence", status)} aria-label={t.pluginRowActionEvidence}>
      <div className="row-cli-action-evidence-head">
        <span>{t.pluginRowActionEvidence}</span>
        <code title={commandLine}>{messageExcerpt(commandLine.replace(/^claude\s+/i, ""), 96)}</code>
        <em>{t.commandExit}: {code ?? "-"}{duration ? ` · ${duration}` : ""}</em>
        <div className="row-cli-action-evidence-actions">
          <button type="button" className="plain-action subtle-action" onClick={copyEvidence} title={copied ? t.copied : t.copyEvidence}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? t.copied : t.copyEvidence}
          </button>
          {onOpenOutputs && (
            <button type="button" className="plain-action subtle-action" onClick={onOpenOutputs} title={t.openOutputs}>
              <PanelBottom size={12} />
              {t.openOutputs}
            </button>
          )}
          {onRetry && status === "error" && (
            <button type="button" className="plain-action subtle-action" onClick={onRetry} title={t.retry}>
              <RefreshCw size={12} />
              {t.retry}
            </button>
          )}
        </div>
      </div>
      {outputSummary && <p className="row-cli-action-message">{outputSummary}</p>}
      {output && (
        <details className="row-cli-action-output">
          <summary>{t.rawOutput}</summary>
          <pre>{messageExcerpt(output, 900)}</pre>
        </details>
      )}
    </section>
  );
}

function isGenericSessionTitle(title, t) {
  const normalized = String(title || "").trim().toLowerCase();
  return ["", "claudex", "new chat", "new coding session", "新聊天", String(t.newChat || "").toLowerCase()].includes(normalized);
}

function sessionProjectLabel(session, t) {
  const projectName = String(session?.project || "").trim();
  if (projectName && projectName.toLowerCase() !== String(t.localWorkspace).toLowerCase()) return projectName;
  const projectPath = String(session?.projectPath || "").replace(/\//g, "\\");
  const tail = projectPath.split("\\").filter(Boolean).pop();
  return tail || projectName || t.localWorkspace;
}

function sessionProjectKeyForUi(session) {
  return String(session?.projectPath || session?.project || "").trim().toLowerCase();
}

function sessionDisplayTitle(session, t) {
  const rawTitle = String(session?.title || "").trim();
  const messages = sessionMessages(session);
  const firstUser = messages.find((message) => message.role === "user" && message.content);
  if (rawTitle && !isGenericSessionTitle(rawTitle, t)) return messageExcerpt(rawTitle, 64);
  if (firstUser) return messageExcerpt(firstUser.content, 64);
  return t.newChat;
}

function sessionSubtitle(session, t) {
  const messages = sessionMessages(session);
  if (!messages.length) return sessionProjectLabel(session, t);
  const lastMessage = [...messages].reverse().find((message) => message.content);
  return messageExcerpt(lastMessage?.content || "", 82) || sessionProjectLabel(session, t);
}

function sessionMetaLabel(session, t, isStreaming) {
  if (isStreaming) return t.threadRunning;
  const count = sessionMessages(session).length;
  if (!count) return t.draftThread;
  return t.threadMessageCount.replace("{count}", count);
}

function sidebarThreadItems(sessions, t, activeProject, projectScope = "current") {
  const seenEmptyDrafts = new Set();
  const items = [];
  const activeProjectKey = String(activeProject?.path || activeProject?.name || "").trim().toLowerCase();
  for (const session of sessions || []) {
    const archivedScope = projectScope === "archived";
    if (archivedScope !== Boolean(session?.archived)) continue;
    if (projectScope !== "all" && activeProjectKey && sessionProjectKeyForUi(session) !== activeProjectKey) continue;
    const messages = sessionMessages(session);
    const genericEmpty = messages.length === 0 && isGenericSessionTitle(session?.title, t);
    const draftKey = sessionProjectKeyForUi(session) || "default";
    if (genericEmpty && seenEmptyDrafts.has(draftKey)) continue;
    if (genericEmpty) seenEmptyDrafts.add(draftKey);
    items.push({
      session,
      title: sessionDisplayTitle(session, t),
      subtitle: sessionSubtitle(session, t),
      project: sessionProjectLabel(session, t),
      messageCount: messages.length,
      pinned: Boolean(session?.pinned),
      rawSearchText: [
        session?.title,
        session?.project,
        session?.projectPath,
        ...messages.map((message) => message.content),
      ].join(" "),
    });
  }
  return items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.session.updatedAt || 0) - new Date(a.session.updatedAt || 0));
}

function sessionMatchesProjectForUi(session, activeProject) {
  const activeProjectKey = String(activeProject?.path || activeProject?.name || "").trim().toLowerCase();
  return !activeProjectKey || sessionProjectKeyForUi(session) === activeProjectKey;
}

function selectSessionIdForProject(nextState, t, activeProject, preferredId = "", projectScope = "current") {
  const items = sidebarThreadItems(nextState?.sessions || [], t, activeProject || nextState?.activeProject, projectScope);
  if (preferredId && items.some((item) => item.session.id === preferredId)) return preferredId;
  if (projectScope === "archived") return items[0]?.session.id || "";
  return items[0]?.session.id || (nextState?.sessions || []).find((session) => !session.archived)?.id || nextState?.sessions?.[0]?.id || "";
}

function commandIdSegment(value) {
  return encodeURIComponent(String(value || "").trim()).slice(0, 120) || "item";
}

function settingsSectionCommandSpecs(t) {
  return [
    { id: "general", label: t.settingsGeneral, keywords: "general runtime provider model language 通用 运行时 服务商 模型 语言" },
    { id: "profile", label: t.settingsProfile, keywords: "profile project workspace local state 项目 工作区 本地状态" },
    { id: "appearance", label: t.settingsAppearance, keywords: "appearance font density theme 外观 字体 密度 主题" },
    { id: "configuration", label: t.settingsConfiguration, keywords: "configuration claude code cli args permissions 配置 claude code 命令 参数 权限" },
    { id: "personalization", label: t.settingsPersonalization, keywords: "personalization instructions prompt hooks 个性化 指令 提示词" },
    { id: "mcp", label: t.settingsMcpServers, keywords: "mcp servers tools plugins capability MCP 服务器 工具 插件 能力" },
    { id: "browser", label: t.settingsBrowser, keywords: "browser preview web external 浏览器 预览 网页" },
    { id: "computer", label: t.settingsComputerUse, keywords: "computer use desktop control claude 电脑操作 computer use 桌面控制" },
    { id: "hooks", label: t.settingsHooks, keywords: "hooks claude code commands automation 钩子 命令 自动化" },
    { id: "connections", label: t.settingsConnections, keywords: "connections marketplace provider api env 连接 市场 服务商 环境" },
    { id: "git", label: t.settingsGit, keywords: "git changes diff branch status 变更 差异 分支" },
    { id: "environments", label: t.settingsEnvironments, keywords: "environment cwd ide terminal shell 环境 终端 IDE" },
    { id: "worktrees", label: t.settingsWorktrees, keywords: "worktrees git branch workspace 工作树 git 分支 工作区" },
    { id: "archived", label: t.settingsArchivedChats, keywords: "archived chats history data file 归档 聊天 历史 数据文件" },
  ];
}

function sidebarScopeCounts(sessions, t, activeProject) {
  return {
    current: sidebarThreadItems(sessions, t, activeProject, "current").length,
    all: sidebarThreadItems(sessions, t, activeProject, "all").length,
    archived: sidebarThreadItems(sessions, t, activeProject, "archived").length,
  };
}

function threadScopeLabel(scope, t) {
  if (scope === "all") return t.allProjectChats;
  if (scope === "archived") return t.showArchivedChats;
  return t.projectFilteredChats;
}

function threadScopeSummaryText({ scope, counts, activeProject, visibleCount, totalCount, query, t }) {
  const base = `${threadScopeLabel(scope, t)} ${t.threadScopeCount.replace("{count}", totalCount)}`;
  const project = scope === "all" ? t.allProjectChats : projectLabel(activeProject, t);
  const match = query.trim() && visibleCount !== totalCount
    ? ` · ${t.threadScopeMatch.replace("{shown}", visibleCount).replace("{total}", totalCount)}`
    : "";
  const archive = scope !== "archived" ? ` · ${t.showArchivedChats} ${counts.archived}` : "";
  return `${project} · ${base}${archive}${match}`;
}

function projectKey(project) {
  return project?.path || project?.name || "";
}

function isPlaceholderProject(project, t) {
  const name = String(project?.name || "").trim().toLowerCase();
  return !project?.path && (!name || name === String(t.localWorkspace).toLowerCase());
}

function visibleProjectsForUi(state, t) {
  const activeProject = state.activeProject || { name: t.localWorkspace, path: "" };
  const rawProjects = Array.isArray(state.projects) && state.projects.length ? state.projects : [activeProject];
  const hasRealProject = Boolean(activeProject?.path) || rawProjects.some((project) => project?.path);
  const projects = [activeProject, ...rawProjects].filter((project) => !(hasRealProject && isPlaceholderProject(project, t)));
  const seen = new Set();
  const unique = [];
  for (const project of projects) {
    const key = projectKey(project);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(project);
  }
  return unique.length ? unique : [{ name: t.localWorkspace, path: "" }];
}

function displayModelLabel(model) {
  const text = String(model || "").trim();
  if (!text) return "Sonnet 4.5";
  if (/claude-sonnet-4-5/i.test(text)) return "Sonnet 4.5";
  if (/gpt-4\.1/i.test(text)) return "GPT-4.1";
  return text;
}

function compactPath(value, max = 54) {
  const text = String(value || "");
  if (!text || text.length <= max) return text;
  const normalized = text.replace(/\//g, "\\");
  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length <= 2) return `${text.slice(0, max - 1)}…`;
  const tail = parts.slice(-2).join("\\");
  const head = normalized.slice(0, Math.max(12, max - tail.length - 3));
  return `${head}…\\${tail}`;
}

function structuredQueryMatch(item, query) {
  const tokens = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = [
    item?.id,
    item?.name,
    item?.marketplace,
    item?.description,
    item?.category,
    item?.author,
    item?.source,
    item?.version,
    item?.permissions,
    item?.risk,
    item?.repo,
    item?.scope,
    item?.status,
    item?.path,
    item?.root,
    item?.relativePath,
    item?.installPath,
    item?.installLocation,
    item?.detail,
    item?.tools,
    item?.transport,
    item?.error,
  ].filter(Boolean).join(" ").toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function summarizePanelPluginField(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, itemValue]) => itemValue !== false && itemValue !== null && itemValue !== undefined && itemValue !== "")
      .map(([key, itemValue]) => itemValue === true ? key : `${key}:${itemValue}`)
      .join(", ");
  }
  return String(value || "").trim();
}

function panelPluginNameFromId(idValue) {
  const idText = String(idValue || "").trim();
  return idText.split("@")[0] || idText;
}

function panelPluginMarketplaceFromId(idValue) {
  const idText = String(idValue || "").trim();
  return idText.includes("@") ? idText.split("@").slice(1).join("@") : "";
}

function panelPluginItemsFromJsonText(output) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(output || "[]"));
  } catch {
    return [];
  }
  const sourceItems = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.plugins)
      ? parsed.plugins
      : Array.isArray(parsed?.installedPlugins)
        ? parsed.installedPlugins
        : Array.isArray(parsed?.items)
          ? parsed.items
          : [];
  return sourceItems.map((plugin) => {
    const idText = String(plugin?.id || plugin?.name || "").trim();
    const statusText = String(plugin?.status || plugin?.state || "").trim();
    const enabled = typeof plugin?.enabled === "boolean"
      ? plugin.enabled
      : typeof plugin?.disabled === "boolean"
        ? !plugin.disabled
        : /enabled|active|ready|ok|connected/i.test(statusText);
    return {
      id: idText,
      name: String(plugin?.name || panelPluginNameFromId(idText)).trim() || idText,
      marketplace: String(plugin?.marketplace || panelPluginMarketplaceFromId(idText)).trim(),
      version: String(plugin?.version || "unknown"),
      scope: String(plugin?.scope || ""),
      enabled,
      status: statusText || (enabled ? "enabled" : "disabled"),
      installPath: String(plugin?.installPath || plugin?.path || plugin?.location || ""),
      source: summarizePanelPluginField(plugin?.source || plugin?.installSource || plugin?.registry || plugin?.repository || plugin?.repo || plugin?.url),
      tools: summarizePanelPluginField(plugin?.tools || plugin?.toolNames || plugin?.commands || plugin?.slashCommands || plugin?.mcpTools),
      permissions: summarizePanelPluginField(plugin?.permissions || plugin?.allowedTools || plugin?.capabilities || plugin?.permissionSummary),
    };
  }).filter((plugin) => plugin.id);
}

function mcpStatusLabel(status, t) {
  if (status === "ok") return t.mcpStatusOk;
  if (status === "pending") return t.mcpStatusPending;
  if (status === "error") return t.mcpStatusError;
  return t.mcpStatusUnknown;
}

function mcpPanelDisplay(server, t) {
  const rawName = String(server?.name || "").trim();
  const detailText = String(server?.detail || "").trim();
  const detailPair = detailText.match(/^(?![A-Za-z]:)([^:]{1,80}):\s*(.+)$/);
  const rawNameLooksLikeStatus = /^(?:ok|connected|running|enabled|error|failed|pending|paused|waiting|unknown)$/i.test(rawName);
  const name = rawNameLooksLikeStatus && detailPair
    ? detailPair[1].trim()
    : rawName || detailPair?.[1]?.trim() || t.mcpServers;
  const detail = rawNameLooksLikeStatus && detailPair ? detailPair[2].trim() : detailText;
  return { name, detail };
}

function automationStatusLabel(status, t) {
  if (status === "scheduled") return t.automationStatusScheduled;
  if (status === "paused") return t.automationStatusPaused;
  if (status === "running") return t.automationStatusRunning;
  if (status === "succeeded") return t.automationStatusSucceeded;
  if (status === "failed") return t.automationStatusFailed;
  return t.automationStatusIdle;
}

function automationScheduleTypeLabel(type, t) {
  if (type === "daily") return t.scheduleRepeatDaily;
  if (type === "weekly") return t.scheduleRepeatWeekly;
  return t.scheduleRepeatOnce;
}

function automationProjectLabel(automation, t) {
  return projectLabel(automation?.project, t);
}

function automationThreadLabel(automation, sessions = [], t) {
  const session = sessions.find((item) => item.id === automation?.threadId);
  return session ? sessionDisplayTitle(session, t) : automation?.threadId || t.newChat;
}

function subagentStatusLabel(status, t) {
  if (status === "running") return t.subagentStatusRunning;
  if (status === "error") return t.subagentStatusError;
  if (status === "cancelled") return t.subagentStatusCancelled;
  return t.subagentStatusDone;
}

function subagentCommandLine(run) {
  return [run?.command, ...(Array.isArray(run?.args) ? run.args : [])].filter(Boolean).join(" ");
}

function subagentArtifactLabel(artifact, index, t) {
  return artifact?.label || artifact?.path || artifact?.type || `${t.subagentArtifacts} ${index + 1}`;
}

function subagentArtifactContent(artifact) {
  return String(artifact?.content || artifact?.text || artifact?.summary || artifact?.value || "");
}

function subagentArtifactPathValue(artifact) {
  return String(artifact?.path || "").trim();
}

function isOpenableSubagentArtifact(artifact) {
  const artifactPath = subagentArtifactPathValue(artifact);
  return Boolean(artifactPath && !/^[a-z][a-z0-9+.-]*:\/\//i.test(artifactPath));
}

function subagentArtifactEvidenceText(artifact, index, t) {
  const label = subagentArtifactLabel(artifact, index, t);
  return [
    `${t.subagentArtifacts}: ${label}`,
    artifact?.type ? `${t.timelineEventType}: ${artifact.type}` : "",
    artifact?.path ? `${t.subagentArtifactPath}: ${artifact.path}` : "",
    "",
    subagentArtifactContent(artifact),
  ].filter((line, lineIndex) => lineIndex === 0 || String(line || "").trim()).join("\n");
}

function subagentArtifactsEvidenceText(artifacts = [], t) {
  return (artifacts || [])
    .map((artifact, index) => subagentArtifactEvidenceText(artifact, index, t))
    .filter(Boolean)
    .join("\n\n");
}

function upsertSubagentRunForUi(runs = [], run) {
  if (!run?.id) return runs;
  return [run, ...runs.filter((item) => item.id !== run.id)].slice(0, 40);
}

function appendSubagentChunkForUi(runs = [], event = {}) {
  const text = String(event.text || "");
  if (!text) return runs;
  let matched = false;
  const nextRuns = runs.map((run) => {
    if (run?.id !== event.runId && run?.requestId !== event.requestId) return run;
    matched = true;
    return appendStreamChunk({ ...run, status: run.status || "running" }, event.stream, text);
  });
  return matched ? nextRuns : runs;
}

function appendSubagentChunkToRunEvents(events = [], event = {}) {
  const text = String(event.text || "");
  if (!text) return events;
  const stream = event.stream === "stderr" ? "stderr" : "stdout";
  return events.map((runEvent) => {
    if (runEvent?.id !== event.requestId && runEvent?.id !== event.runId) return runEvent;
    return appendStreamChunk(runEvent, stream, text);
  });
}

function browserStatusLabel(status, t) {
  if (status === "loading") return t.browserStatusLoading;
  if (status === "error") return t.browserStatusError;
  if (status === "external") return t.browserStatusExternal;
  if (status === "ready") return t.browserStatusReady;
  return t.browserIdle;
}

function browserVisitFinalUrl(visit = {}) {
  return visit.finalUrl || visit.validatedUrl || visit.url || "";
}

function sourceRefKey(source = {}) {
  return source.id || [source.project?.path, source.project?.name, source.path].filter(Boolean).join(":") || source.path || "";
}

function browserVisitKey(visit = {}) {
  return visit.id || visit.url || browserVisitFinalUrl(visit);
}

function browserVisitCapturedAt(visit = {}) {
  return visit.snapshotCapturedAt || visit.endedAt || visit.lastEventAt || visit.startedAt || "";
}

function browserVisitMetadataRows(visit = {}, t) {
  const rows = [
    [t.browserFinalUrl, browserVisitFinalUrl(visit)],
    [t.scheduleStatus, browserStatusLabel(visit.status, t)],
    [t.browserCapturedAt, browserVisitCapturedAt(visit)],
    [t.browserPageTitle, visit.title],
    [t.browserHttpStatus, Number.isFinite(Number(visit.httpStatus)) ? String(Number(visit.httpStatus)) : ""],
    [t.browserErrorCode, Number.isFinite(Number(visit.errorCode)) ? String(Number(visit.errorCode)) : ""],
    [t.browserValidatedUrl, visit.validatedUrl],
    [t.activeProject, visit.project?.path || visit.project?.name || ""],
  ];
  return rows
    .map(([label, value]) => [label, String(value || "").trim()])
    .filter(([, value]) => value);
}

function browserVisitEvidenceText(visit = {}, t) {
  const lines = browserVisitMetadataRows(visit, t).map(([label, value]) => `${label}: ${value}`);
  if (visit.error) lines.push(`${t.requestError}: ${visit.error}`);
  if (visit.isMainFrame) lines.push(`${t.browserMainFrame}: true`);
  if (visit.excerpt) lines.push(`${t.browserExcerpt}: ${visit.excerpt}`);
  return lines.join("\n");
}

function noticeLevelLabel(level, t) {
  if (level === "error") return t.noticeLevelError;
  if (level === "warning") return t.noticeLevelWarning;
  return t.noticeLevelInfo;
}

function decodeActionSuffix(action, prefix) {
  const encoded = String(action || "").slice(prefix.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function encodeActionPart(value) {
  return encodeURIComponent(String(value || "").trim());
}

function decodeActionPart(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function capabilityActionFromFocus(focus = {}) {
  const tab = String(focus?.tab || "").trim();
  if (!tab) return "";
  const kind = String(focus?.kind || "").trim();
  const idValue = String(focus?.id || "").trim();
  const query = String(focus?.query || idValue || "").trim();
  const parts = [tab];
  if (kind || idValue || query) parts.push(kind, idValue, query);
  return `capability:${parts.map(encodeActionPart).join(":")}`;
}

function capabilityFocusFromAction(action) {
  const rawParts = String(action || "")
    .slice("capability:".length)
    .split(":");
  const [tab, kind = "", idValue = "", query = ""] = rawParts.map(decodeActionPart);
  return {
    tab: tab || "plugins",
    kind,
    id: idValue,
    query: query || idValue,
  };
}

function authLabel(auth, settings) {
  if (settings?.env?.anthropicApiKey) return "第一方 / API 密钥";
  if (settings?.env?.anthropicAuthToken) return "第一方 / 授权令牌";
  if (!auth) return "检查中";
  if (!auth.loggedIn) return "未登录";
  return `${auth.apiProvider || "Claude"} / ${auth.authMethod || "已登录"}`;
}

function permissionModeLabel(mode, t) {
  const labels = {
    default: t.permissionModeDefault,
    acceptEdits: t.permissionModeAcceptEdits,
    auto: t.permissionModeAuto,
    plan: t.permissionModePlan,
    dontAsk: t.permissionModeDontAsk,
    bypassPermissions: t.permissionModeBypassPermissions,
  };
  return labels[mode] || mode || t.permissionModeDefault;
}

function cliBaseUrl(settings) {
  return settings?.env?.anthropicBaseUrl || settings?.env?.openaiBaseUrl || "";
}

function normalizeBrowserUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function resolveLanguage() {
  return "zh";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);
  if (diffSec < 60) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 7) return `${diffDay} 天前`;
  if (diffWeek < 5) return `${diffWeek} 周前`;
  if (diffMonth < 12) return `${diffMonth} 个月前`;
  return `${diffYear} 年前`;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDurationMs(value) {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60 * 1000) return `${(ms / 1000).toFixed(ms < 10 * 1000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function automationTriggerLabel(trigger, t) {
  return trigger === "scheduled" ? t.automationTriggerScheduled : t.automationTriggerManual;
}

function automationRunOutput(entry = {}) {
  return [
    entry.stdout ? `${entry.stdout}` : "",
    entry.stderr ? `[stderr]\n${entry.stderr}` : "",
  ].filter(Boolean).join("\n\n");
}

function automationEvidenceText(automation, entry, t, sessions = []) {
  const run = entry || automation?.lastRun || {};
  const lines = [
    `${t.automationTasks}: ${automation?.prompt || ""}`,
    `${t.scheduleStatus}: ${automationStatusLabel(run.status || automation?.status, t)}`,
    `${t.scheduleHistory}: ${automationTriggerLabel(run.trigger, t)}`,
    `${t.activeProject}: ${automationProjectLabel(automation, t)}`,
    `${t.scheduleThread}: ${automationThreadLabel(automation, sessions, t)}`,
    `${t.automationSession}: ${run.sessionId || automation?.threadId || "-"}`,
    `${t.commandExit}: ${typeof run.code === "number" ? run.code : "-"}`,
    `${t.commandDuration}: ${formatDurationMs(run.durationMs)}`,
    "",
    run.error || run.detail || run.summary || "",
    automationRunOutput(run),
  ];
  return lines.filter((line, index) => index < 8 || String(line || "").trim()).join("\n");
}

function automationRunEntries(automation = {}) {
  const entries = [];
  const seen = new Set();
  for (const entry of Array.isArray(automation?.history) ? automation.history : []) {
    if (!entry?.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  const lastRun = automation?.lastRun;
  if (lastRun?.id && !seen.has(lastRun.id)) entries.push(lastRun);
  return entries;
}

function findCommandRunForEvent(event, commandRuns = []) {
  const eventId = String(event?.id || "");
  const commandLine = String(event?.commandLine || "").trim();
  const cwd = String(event?.cwd || "").trim();
  return (commandRuns || []).find((run) => run?.id === eventId || run?.requestId === eventId)
    || (commandLine
      ? (commandRuns || []).find((run) => {
          const runCommand = String(run?.command || run?.commandLine || "").trim();
          const runCwd = String(run?.cwd || run?.project?.path || "").trim();
          return runCommand === commandLine && (!cwd || !runCwd || runCwd === cwd);
        })
      : null);
}

function commandRunTimelineStatus(run = {}) {
  if (run.cancelled) return "cancelled";
  return run.code === 0 ? "ok" : "error";
}

function commandRunTimelineType(run = {}) {
  if ((run.requestId || run.id || "").startsWith("git_command_")) return "git-command";
  if (run.kind === "claude") return "claude-command";
  if (run.kind === "capability") return "capability-command";
  return "workspace-command";
}

function commandRunTimelineEvent(run = {}, t) {
  const eventId = String(run.requestId || run.id || "").trim();
  const commandLine = String(run.command || run.commandLine || "").trim();
  if (!eventId || !commandLine) return null;
  const type = commandRunTimelineType(run);
  const titlePrefix = type === "git-command"
    ? "Git"
    : run.kind === "claude"
      ? "Claude"
      : run.kind === "capability"
        ? t.capabilities
        : "Workspace";
  return {
    id: eventId,
    type,
    status: commandRunTimelineStatus(run),
    title: `${titlePrefix}: ${messageExcerpt(commandLine, 88)}`,
    detail: run.cancelled ? t.commandCancelled : `${t.commandExit}: ${typeof run.code === "number" ? run.code : "-"}`,
    createdAt: run.endedAt || run.startedAt || new Date().toISOString(),
    project: run.project,
    sessionId: run.requestId || run.id || "",
    commandLine,
    cwd: run.cwd || run.project?.path || "",
    code: typeof run.code === "number" ? run.code : null,
    durationMs: typeof run.durationMs === "number" ? run.durationMs : null,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
  };
}

function findAutomationRunForEvent(event, automations = []) {
  const eventId = String(event?.id || "");
  if (!eventId) return null;
  for (const automation of automations || []) {
    const history = Array.isArray(automation?.history) ? automation.history : [];
    const entry = history.find((item) => item?.id === eventId)
      || (automation?.lastRun?.id === eventId ? automation.lastRun : null);
    if (entry) return { automation, entry };
  }
  return null;
}

function findSubagentRunForEvent(event, runs = []) {
  const eventId = String(event?.id || "");
  if (!eventId) return null;
  return (runs || []).find((run) => run?.id === eventId || run?.requestId === eventId) || null;
}

function findBrowserVisitForEvent(event, visits = []) {
  const eventId = String(event?.id || "");
  const eventUrl = normalizeBrowserUrl(event?.url || event?.finalUrl || event?.validatedUrl || "");
  const eventTitle = String(event?.title || "");
  return (visits || []).find((visit) => {
    const finalUrl = browserVisitFinalUrl(visit);
    return (
      (eventId && [visit?.id, visit?.url, finalUrl].filter(Boolean).includes(eventId))
      || (eventUrl && [visit?.url, finalUrl, visit?.validatedUrl].filter(Boolean).includes(eventUrl))
      || (finalUrl && eventTitle.includes(finalUrl))
      || (visit?.url && eventTitle.includes(visit.url))
    );
  }) || null;
}

function automationRunTimelineStatus(entry = {}) {
  if (entry.status === "failed") return "error";
  if (entry.status === "running") return "running";
  if (entry.status === "cancelled") return "cancelled";
  return "ok";
}

function subagentRunTimelineStatus(run = {}) {
  if (run.status === "done") return "ok";
  if (run.status === "cancelled") return "cancelled";
  if (run.status === "running") return "running";
  return "error";
}

function browserVisitTimelineStatus(visit = {}) {
  if (visit.status === "error") return "error";
  if (visit.status === "loading") return "running";
  return "ok";
}

function browserVisitRunEvent(visit = {}, t) {
  const visitId = browserVisitKey(visit);
  if (!visitId) return null;
  const finalUrl = browserVisitFinalUrl(visit);
  return {
    id: visitId,
    type: "browser",
    status: browserVisitTimelineStatus(visit),
    title: `${t.browser}: ${visit.title || finalUrl || visit.url}`,
    detail: visit.error || visit.excerpt || browserStatusLabel(visit.status, t),
    createdAt: browserVisitCapturedAt(visit) || new Date().toISOString(),
    project: visit.project,
    sessionId: "",
    commandLine: "",
    cwd: visit.project?.path || "",
    code: null,
    durationMs: null,
  };
}

function fallbackRunEventForId(eventId, { commandRuns = [], automations = [], subagentRuns = [], browserVisits = [], t } = {}) {
  const id = String(eventId || "").trim();
  if (!id) return null;
  const commandRun = findCommandRunForEvent({ id }, commandRuns);
  if (commandRun) return commandRunTimelineEvent(commandRun, t);
  const automationMatch = findAutomationRunForEvent({ id }, automations);
  if (automationMatch) {
    const { automation, entry } = automationMatch;
    return {
      id,
      type: "automation",
      status: automationRunTimelineStatus(entry),
      title: `${t.scheduled}: ${messageExcerpt(automation?.prompt || t.automationTasks, 60)}`,
      detail: entry.error || entry.detail || entry.summary || automationProjectLabel(automation, t),
      createdAt: entry.endedAt || entry.startedAt || automation?.updatedAt || automation?.createdAt || new Date().toISOString(),
      project: automation?.project,
      sessionId: entry.sessionId || automation?.threadId || "",
      code: typeof entry.code === "number" ? entry.code : null,
      durationMs: typeof entry.durationMs === "number" ? entry.durationMs : null,
    };
  }
  const subagentRun = findSubagentRunForEvent({ id }, subagentRuns);
  if (subagentRun) {
    return {
      id,
      type: "subagent",
      status: subagentRunTimelineStatus(subagentRun),
      title: `${t.subagents}: ${subagentRun.nickname || "Subagent"}`,
      detail: subagentRun.summary || subagentRun.stderr || messageExcerpt(subagentRun.task, 120),
      createdAt: subagentRun.endedAt || subagentRun.startedAt || new Date().toISOString(),
      project: subagentRun.project,
      sessionId: subagentRun.sessionId || "",
      code: typeof subagentRun.code === "number" ? subagentRun.code : null,
      durationMs: typeof subagentRun.durationMs === "number" ? subagentRun.durationMs : null,
    };
  }
  const browserVisit = findBrowserVisitForEvent({ id }, browserVisits);
  if (browserVisit) return browserVisitRunEvent(browserVisit, t);
  return null;
}

function runEventTimestamp(event = {}) {
  const value = event.createdAt || event.endedAt || event.startedAt || "";
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function localEvidenceRunEvents({ commandRuns = [], automations = [], subagentRuns = [], browserVisits = [], t } = {}) {
  const events = [];
  for (const run of commandRuns || []) {
    const event = commandRunTimelineEvent(run, t);
    if (event) events.push(event);
  }
  for (const automation of automations || []) {
    for (const entry of automationRunEntries(automation)) {
      const event = fallbackRunEventForId(entry.id, { commandRuns, automations, subagentRuns, browserVisits, t });
      if (event) events.push(event);
    }
  }
  for (const run of subagentRuns || []) {
    const id = String(run?.requestId || run?.id || "").trim();
    const event = fallbackRunEventForId(id, { commandRuns, automations, subagentRuns, browserVisits, t });
    if (event) events.push(event);
  }
  for (const visit of browserVisits || []) {
    const event = browserVisitRunEvent(visit, t);
    if (event) events.push(event);
  }
  return events;
}

function timelineEventsForUi(runEvents = [], { commandRuns = [], automations = [], subagentRuns = [], browserVisits = [], t } = {}) {
  const byId = new Map();
  const add = (event) => {
    const id = String(event?.id || "").trim();
    if (!id || byId.has(id)) return;
    byId.set(id, event);
  };
  (runEvents || []).forEach(add);
  localEvidenceRunEvents({ commandRuns, automations, subagentRuns, browserVisits, t }).forEach(add);
  return [...byId.values()]
    .sort((a, b) => runEventTimestamp(b) - runEventTimestamp(a))
    .slice(0, 14);
}

function runTimelineStatusLabel(status, t) {
  if (status === "running") return t.commandRunning;
  if (status === "cancelled") return t.commandCancelled;
  if (status === "error") return t.commandFailed;
  return t.commandSucceeded;
}

function runTimelineTypeRaw(event, evidence) {
  return String(evidence?.type || event?.type || "run");
}

function runTimelineTypeLabel(event, evidence, t) {
  const raw = runTimelineTypeRaw(event, evidence);
  if (raw === "automation-action") return t.timelineAutomationAction;
  if (raw === "subagent-action") return t.timelineSubagentAction;
  if (raw === "thread-action") return t.timelineThreadAction;
  if (raw === "skill-registry") return t.timelineSkillRegistry;
  if (raw === "browser") return t.browser;
  return raw;
}

function runTimelineEvidenceForEvent(event, { commandRuns = [], automations = [], subagentRuns = [], browserVisits = [], sessions = [], t } = {}) {
  const commandRun = findCommandRunForEvent(event, commandRuns);
  if (commandRun) {
    return {
      source: "command",
      commandRunId: commandRun.id || event?.id || "",
      commandKind: commandRun.kind || event?.type || "command",
      title: event?.title || commandRun.command || commandRun.commandLine || "",
      detail: event?.detail || "",
      type: event?.type || commandRun.kind || "command",
      status: event?.status || (commandRun.cancelled ? "cancelled" : commandRun.code === 0 ? "ok" : "error"),
      project: projectLabel(commandRun.project, t),
      sessionId: event?.sessionId || "",
      commandLine: commandRun.command || commandRun.commandLine || event?.commandLine || "",
      cwd: commandRun.cwd || commandRun.project?.path || event?.cwd || "",
      code: typeof commandRun.code === "number" ? commandRun.code : event?.code,
      durationMs: typeof commandRun.durationMs === "number" ? commandRun.durationMs : event?.durationMs,
      stdout: commandRun.stdout || "",
      stderr: commandRun.stderr || "",
      summary: "",
    };
  }

  const automationMatch = findAutomationRunForEvent(event, automations);
  if (automationMatch) {
    const { automation, entry } = automationMatch;
    return {
      source: "automation",
      automationId: automation?.id || "",
      automationPrompt: automation?.prompt || "",
      title: event?.title || automation?.prompt || "",
      detail: entry.error || entry.detail || entry.summary || event?.detail || "",
      type: event?.type || "automation",
      status: automationRunTimelineStatus(entry),
      project: automationProjectLabel(automation, t),
      sessionId: entry.sessionId || automation?.threadId || "",
      thread: automationThreadLabel(automation, sessions, t),
      commandLine: "",
      cwd: automation?.project?.path || event?.cwd || "",
      code: typeof entry.code === "number" ? entry.code : event?.code,
      durationMs: typeof entry.durationMs === "number" ? entry.durationMs : event?.durationMs,
      stdout: entry.stdout || "",
      stderr: entry.stderr || "",
      summary: entry.error || entry.detail || entry.summary || "",
    };
  }

  const subagentRun = findSubagentRunForEvent(event, subagentRuns);
  if (subagentRun) {
    return {
      source: "subagent",
      subagentRunId: subagentRun.id || "",
      subagentRequestId: subagentRun.requestId || "",
      subagentTask: subagentRun.task || "",
      subagentNickname: subagentRun.nickname || "",
      subagentContinuedAt: subagentRun.continuedAt || "",
      title: event?.title || subagentRun.nickname || "Subagent",
      detail: subagentRun.summary || subagentRun.stderr || event?.detail || subagentRun.task || "",
      type: event?.type || "subagent",
      status: subagentRunTimelineStatus(subagentRun),
      project: projectLabel(subagentRun.project, t),
      sessionId: subagentRun.sessionId || event?.sessionId || "",
      commandLine: subagentCommandLine(subagentRun),
      cwd: subagentRun.cwd || subagentRun.project?.path || event?.cwd || "",
      code: typeof subagentRun.code === "number" ? subagentRun.code : event?.code,
      durationMs: typeof subagentRun.durationMs === "number" ? subagentRun.durationMs : event?.durationMs,
      stdout: subagentRun.stdout || "",
      stderr: subagentRun.stderr || "",
      summary: subagentRun.summary || "",
      artifacts: Array.isArray(subagentRun.artifacts) ? subagentRun.artifacts : [],
    };
  }

  const browserVisit = findBrowserVisitForEvent(event, browserVisits);
  if (browserVisit) {
    const finalUrl = browserVisitFinalUrl(browserVisit);
    const evidenceText = browserVisitEvidenceText(browserVisit, t);
    return {
      source: "browser",
      browserVisitId: browserVisit.id || "",
      browserUrl: browserVisit.url || "",
      browserFinalUrl: finalUrl,
      title: event?.title || browserVisit.title || finalUrl || browserVisit.url,
      detail: browserVisit.error || browserVisit.excerpt || event?.detail || "",
      type: "browser",
      status: browserVisitTimelineStatus(browserVisit),
      project: projectLabel(browserVisit.project, t),
      sessionId: event?.sessionId || "",
      commandLine: "",
      cwd: browserVisit.project?.path || event?.cwd || "",
      code: null,
      durationMs: typeof event?.durationMs === "number" ? event.durationMs : null,
      stdout: evidenceText,
      stderr: browserVisit.error || "",
      summary: browserVisit.error || browserVisit.excerpt || "",
    };
  }

  return {
    source: "event",
    title: event?.title || "",
    detail: event?.detail || "",
    type: event?.type || "run",
    status: event?.status || "ok",
    project: projectLabel(event?.project, t),
    sessionId: event?.sessionId || "",
    commandLine: event?.commandLine || "",
    cwd: event?.cwd || event?.project?.path || "",
    code: typeof event?.code === "number" ? event.code : null,
    durationMs: typeof event?.durationMs === "number" ? event.durationMs : null,
    stdout: event?.stdout || "",
    stderr: event?.stderr || "",
    summary: event?.detail || "",
  };
}

function runTimelineEvidenceText(event, evidence, t) {
  const artifactLabels = Array.isArray(evidence?.artifacts)
    ? evidence.artifacts
      .map((artifact, index) => subagentArtifactLabel(artifact, index, t))
      .filter(Boolean)
    : [];
  const typeRaw = runTimelineTypeRaw(event, evidence);
  const typeLabel = runTimelineTypeLabel(event, evidence, t);
  const lines = [
    `${t.outputs}: ${event?.title || evidence?.title || ""}`,
    `${t.timelineEventType}: ${typeLabel}`,
    typeRaw !== typeLabel ? `${t.timelineEventRawType}: ${typeRaw}` : "",
    `${t.scheduleStatus}: ${runTimelineStatusLabel(event?.status || evidence?.status, t)}`,
    `${t.activeProject}: ${evidence?.project || ""}`,
    `${t.automationSession}: ${evidence?.sessionId || "-"}`,
    `${t.commandLine}: ${evidence?.commandLine || "-"}`,
    `${t.commandCwd}: ${evidence?.cwd || "-"}`,
    `${t.commandExit}: ${typeof evidence?.code === "number" ? evidence.code : "-"}`,
    `${t.commandDuration}: ${formatDurationMs(evidence?.durationMs)}`,
    `${t.subagentArtifacts}: ${artifactLabels.length ? artifactLabels.join(", ") : "-"}`,
    "",
    evidence?.summary || evidence?.detail || "",
    automationRunOutput(evidence || {}),
    subagentArtifactsEvidenceText(evidence?.artifacts || [], t),
  ];
  return lines.filter((line, index) => index < 10 || String(line || "").trim()).join("\n");
}

function runTimelineHasEvidence(evidence) {
  return Boolean(
    evidence?.stdout
    || evidence?.stderr
    || evidence?.commandLine
    || evidence?.cwd
    || evidence?.sessionId
    || typeof evidence?.code === "number"
    || typeof evidence?.durationMs === "number"
    || evidence?.summary
    || evidence?.detail
    || (Array.isArray(evidence?.artifacts) && evidence.artifacts.length > 0)
  );
}

function formatFileTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function trimLog(value, limit = 30000) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(text.length - limit)}\n\n[前面的输出已截断]`;
}

function appendStreamChunk(current, stream, text) {
  const key = stream === "stderr" ? "stderr" : "stdout";
  return {
    ...current,
    [key]: trimLog(`${current?.[key] || ""}${text || ""}`),
  };
}

const COMMAND_HISTORY_LIMIT = 6;

function prependCommandHistory(current, entry) {
  return [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, COMMAND_HISTORY_LIMIT);
}

function commandRunToHistoryEntry(run) {
  if (!run) return null;
  return {
    id: run.id || run.requestId || `${run.kind || "command"}_${run.endedAt || run.startedAt || Date.now()}`,
    commandLine: run.command || run.commandLine || "",
    cwd: run.cwd || run.project?.path || "",
    code: run.code,
    durationMs: run.durationMs,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
    cancelled: Boolean(run.cancelled),
  };
}

function commandRunsToHistory(runs = [], kind = "workspace") {
  return (runs || [])
    .filter((run) => (run.kind || "workspace") === kind)
    .map(commandRunToHistoryEntry)
    .filter(Boolean)
    .slice(0, COMMAND_HISTORY_LIMIT);
}

function prependRunEvent(current, entry) {
  const eventId = entry?.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const existing = current.find((item) => item.id === eventId);
  const createdAt = existing?.createdAt || entry?.createdAt || new Date().toISOString();
  const incomingIsStaleStart = existing && existing.status !== "running" && entry?.status === "running";
  const next = {
    ...existing,
    ...entry,
    ...(incomingIsStaleStart ? existing : {}),
    id: eventId,
    createdAt,
  };
  return [next, ...current.filter((item) => item.id !== eventId)].slice(0, 14);
}

function mergeRunEvents(current, incoming) {
  if (!Array.isArray(incoming)) return current;
  return [...incoming]
    .reverse()
    .reduce((events, event) => prependRunEvent(events, event), current)
    .slice(0, 14);
}

function isPermissionDeniedError(message) {
  return /\bEACCES\b|\bEPERM\b/.test(String(message || ""));
}

function isFileConflictError(message) {
  return /外部修改|WORKSPACE_FILE_CONFLICT/i.test(String(message || ""));
}

const LARGE_FILE_DIFF_LIMIT_BYTES = 1024 * 1024;
const FILE_CACHE_LIMIT = 30;

function cacheFileRead(cacheRef, key, value) {
  const cache = cacheRef.current;
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > FILE_CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
}

function buildLineDiff(before = "", after = "") {
  const oldLines = String(before).split(/\r?\n/);
  const newLines = String(after).split(/\r?\n/);
  const max = Math.max(oldLines.length, newLines.length);
  const rows = [];
  let additions = 0;
  let deletions = 0;

  for (let index = 0; index < max; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine === newLine) {
      if (newLine !== undefined) rows.push({ type: "same", text: newLine });
      continue;
    }
    if (oldLine !== undefined) {
      deletions += 1;
      rows.push({ type: "delete", text: oldLine });
    }
    if (newLine !== undefined) {
      additions += 1;
      rows.push({ type: "add", text: newLine });
    }
  }

  return {
    additions,
    deletions,
    rows: rows.filter((row, index, allRows) => {
      if (row.type !== "same") return true;
      const nearbyChange = allRows.slice(Math.max(0, index - 2), index + 3).some((item) => item.type !== "same");
      return nearbyChange;
    }).slice(0, 240),
  };
}

function buildGitDiffRows(diffText = "") {
  return String(diffText || "").split(/\r?\n/).slice(0, 900).map((line, index) => {
    let type = "context";
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("# ")) {
      type = "meta";
    } else if (line.startsWith("@@")) {
      type = "hunk";
    } else if (line.startsWith("+")) {
      type = "add";
    } else if (line.startsWith("-")) {
      type = "delete";
    }
    return { id: `${index}-${type}`, type, text: line || " " };
  });
}

function gitDiffPathFromHeader(line = "") {
  const match = /^diff --git\s+(.+?)\s+(.+)$/.exec(String(line || ""));
  if (!match) return "";
  return String(match[2] || match[1] || "").trim().replace(/^"|"$/g, "").replace(/^[ab]\//, "");
}

function buildGitHunks(diffText = "") {
  const hunks = [];
  const lines = String(diffText || "").split(/\r?\n/).slice(0, 1200);
  let section = "";
  let filePath = "";
  let current = null;
  const finish = () => {
    if (!current) return;
    const text = current.lines.join("\n").trim();
    if (text) {
      hunks.push({
        ...current,
        text,
      });
    }
    current = null;
  };
  for (const [index, line] of lines.entries()) {
    if (line.startsWith("# ")) {
      finish();
      section = line.slice(2).trim();
      continue;
    }
    if (line.startsWith("diff --git")) {
      finish();
      filePath = gitDiffPathFromHeader(line) || filePath;
      continue;
    }
    if (line.startsWith("@@")) {
      finish();
      current = {
        id: `${section || "diff"}:${filePath || "repo"}:${index}`,
        section,
        filePath,
        header: line,
        additions: 0,
        deletions: 0,
        lines: [line],
      };
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    if (line.startsWith("+") && !line.startsWith("+++ ")) current.additions += 1;
    if (line.startsWith("-") && !line.startsWith("--- ")) current.deletions += 1;
  }
  finish();
  return hunks.slice(0, 80);
}

function gitChangeKindLabel(kind, t) {
  if (kind === "staged") return t.stagedChanges;
  if (kind === "unstaged") return t.unstagedChanges;
  if (kind === "untracked") return t.untrackedChanges;
  if (kind === "mixed") return t.mixedChanges;
  if (kind === "renamed") return t.renamedChanges;
  if (kind === "deleted") return t.deletedChanges;
  if (kind === "conflict") return t.conflictedChanges;
  return t.changes;
}

function quoteWorkspaceCommandPath(pathValue) {
  const raw = String(pathValue || "").replace(/[\r\n]/g, "");
  if (typeof navigator !== "undefined" && /win/i.test(navigator.platform || "")) {
    return `"${raw.replace(/"/g, "")}"`;
  }
  return `'${raw.replace(/'/g, "'\\''")}'`;
}

function gitFileCanStage(file) {
  return Boolean(file && !file.conflict && (file.untracked || file.unstaged || file.kind === "untracked" || file.kind === "unstaged" || file.kind === "mixed"));
}

function gitFileCanUnstage(file) {
  return Boolean(file && !file.conflict && (file.staged || file.kind === "staged" || file.kind === "mixed"));
}

function gitBranchCanPush(branchLabel, t) {
  const value = String(branchLabel || "").trim();
  return Boolean(value && value !== t.gitUnavailable && value !== "-");
}

function gitAheadBehindLabel(git, t) {
  const ahead = Number(git?.ahead || 0);
  const behind = Number(git?.behind || 0);
  const parts = [];
  if (ahead > 0) parts.push(`${t.gitAhead} ${ahead}`);
  if (behind > 0) parts.push(`${t.gitBehind} ${behind}`);
  if (parts.length) return parts.join(" · ");
  return git?.upstream ? t.gitSynced : t.noGitUpstream;
}

function gitCommandOutput(result = {}) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

function gitCommitHashFromOutput(output = "") {
  const text = String(output || "");
  return (text.match(/\[[^\]]+\s+([0-9a-f]{7,40})\]/i) || text.match(/\b([0-9a-f]{7,40})\b/i) || [])[1] || "";
}

function gitPushSummaryFromOutput(output = "") {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = lines.find((line) => /\s->\s/.test(line) || /^To\s+/.test(line)) || lines[0] || "";
  return summary.replace(/\s+/g, " ");
}

function gitActionHandoffDetail({ action, result, message = "", branchLabel = "", beforeSync = "", afterSync = "", t }) {
  const code = typeof result?.code === "number" ? result.code : "-";
  const output = gitCommandOutput(result);
  const parts = [`${t.commandExit}: ${code}`];
  if (action === "commit") {
    const hash = gitCommitHashFromOutput(output);
    parts.push(hash ? `${t.gitCommitHash}: ${hash}` : message);
  } else {
    const pushSummary = gitPushSummaryFromOutput(output);
    parts.push(pushSummary ? `${t.gitPushResult}: ${pushSummary}` : branchLabel);
  }
  if (beforeSync || afterSync) parts.push(`${t.gitSyncStatus}: ${beforeSync || "-"} → ${afterSync || "-"}`);
  return parts.filter(Boolean).join(" · ");
}

function gitEvidenceText({
  t,
  activeProject,
  branchLabel,
  upstreamLabel,
  remoteLabel,
  aheadBehindLabel,
  selectedFile,
  selectedPath,
  selectedDiffText,
  gitStat,
  rawGitStatus,
  gitRoot,
  gitRelativePath,
  gitSummaryItems = [],
  selectedHunk,
  hunkCount = 0,
}) {
  const summary = gitSummaryItems.length
    ? gitSummaryItems.map(([label, count]) => `${label}: ${count}`).join(" · ")
    : "";
  const lines = [
    `${t.gitEvidence}: ${selectedPath || t.allChanges}`,
    `${t.activeProject}: ${projectLabel(activeProject, t)}`,
    `${t.path}: ${activeProject?.path || "-"}`,
    `${t.gitRoot}: ${gitRoot || "-"}`,
    gitRelativePath ? `${t.gitRelativePath}: ${gitRelativePath}` : "",
    `${t.branch}: ${branchLabel || "-"}`,
    `${t.upstream}: ${upstreamLabel || "-"}`,
    `${t.remote}: ${remoteLabel || "-"}`,
    `${t.gitSyncStatus}: ${aheadBehindLabel || "-"}`,
    `${t.scheduleStatus}: ${selectedFile ? gitChangeKindLabel(selectedFile.kind, t) : t.allChanges}`,
    `${t.gitSummary}: ${summary || "-"}`,
    `${t.gitHunks}: ${hunkCount || 0}`,
    selectedHunk ? `${t.selectedHunk}: ${selectedHunk.filePath || "-"} ${selectedHunk.header || ""} +${selectedHunk.additions || 0} -${selectedHunk.deletions || 0}` : "",
    selectedFile ? `${t.changedLines}: +${selectedFile.additions || 0} -${selectedFile.deletions || 0}` : "",
    selectedFile?.status ? `status: ${selectedFile.status}` : "",
    "",
    "$ git status --short --branch",
    rawGitStatus || "-",
    "",
    "$ git diff --stat",
    gitStat || "-",
    "",
    "$ git diff",
    selectedDiffText || "-",
  ];
  return lines.filter((line, index) => index < 8 || String(line || "").trim()).join("\n");
}

function fallbackState() {
  const createdAt = new Date().toISOString();
  const activeProject = { name: "本地工作区", path: "" };
  return {
    version: 1,
    settings: {
      provider: "openai-compatible",
      model: "gpt-4.1",
      baseUrl: "https://api.openai.com/v1",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: {
        fontSize: "compact",
        density: "compact",
      },
      systemPrompt:
        "你是一名务实的资深编程助手。回答要简洁、准确，并专注于可执行的实现。",
      apiKeys: {},
      claudeCode: {
        executionMode: "claude-code",
        claudeCommand: "claude",
        permissionMode: "default",
        effort: "",
        agent: "",
        allowedTools: "",
        disallowedTools: "",
        tools: "",
        addDirs: "",
        mcpConfig: "",
        pluginDir: "",
        pluginUrl: "",
        settings: "",
        settingSources: "",
        fallbackModel: "",
        maxBudgetUsd: "",
        sessionName: "",
        extraArgs: "",
        safeMode: false,
        bareMode: false,
        ide: false,
        chromeMode: "default",
        strictMcpConfig: false,
        noSessionPersistence: false,
        axScreenReader: false,
        verbose: false,
      },
      capabilities: Object.fromEntries(capabilityCatalog.map((item) => [item.id, item.defaultEnabled])),
      customMarketplaces: [],
      appLocale: navigator.language,
      dataFile: "需要 Electron 应用",
      encryptionAvailable: false,
    },
    activeProject,
    projects: [activeProject],
    sessions: [
      {
        id: "browser-preview",
        title: "新聊天",
        project: activeProject.name,
        projectPath: activeProject.path,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  };
}
function Sidebar({
  state,
  activeProject,
  projectPathMissing = false,
  projectScope,
  onProjectScopeChange,
  activeSessionId,
  setActiveSessionId,
  query,
  setQuery,
  onNewChat,
  onSettings,
  onScheduled,
  onCapabilities,
  onSelectProject,
  onSetProject,
  onRenameThread,
  onTogglePinThread,
  onArchiveThread,
  onForkThread,
  onDeleteThread,
  onResumeThread,
  onToggleSidebar,
  loading,
  loadError,
  onRetryLoad,
  streamingSessionId,
  lang,
  t,
}) {
  const threadItems = useMemo(() => sidebarThreadItems(state.sessions, t, activeProject, projectScope), [state.sessions, t, activeProject, projectScope]);
  const scopeCounts = useMemo(() => sidebarScopeCounts(state.sessions, t, activeProject), [state.sessions, t, activeProject]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return threadItems;
    return threadItems.filter((item) =>
      [item.title, item.subtitle, item.project, item.rawSearchText]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, threadItems]);
  const scopeSummary = threadScopeSummaryText({
    scope: projectScope,
    counts: scopeCounts,
    activeProject,
    visibleCount: filtered.length,
    totalCount: threadItems.length,
    query,
    t,
  });

  const projects = visibleProjectsForUi(state, t);

  return (
    <aside className="sidebar">
      <div className="sidebar-content">
        <nav className="nav-stack" aria-label="主导航">
          <div className="sidebar-top-row">
            <button type="button" className="nav-primary" onClick={onNewChat} disabled={loading} title={loading ? t.loadingChats : t.newChat}>
              <MessageSquarePlus size={17} />
              <span>{t.newChat}</span>
              <kbd>Ctrl+N</kbd>
            </button>
            <button type="button" className="sidebar-collapse-button" onClick={onToggleSidebar} title={t.toggleSidebar} aria-label={t.toggleSidebar}>
              <PanelRight size={16} />
            </button>
          </div>
          <label className="nav-search">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} />
          </label>
          <button type="button" onClick={onScheduled} title={t.scheduled} aria-label={t.scheduled}>
            <Clock3 size={17} />
            <span>{t.scheduled}</span>
          </button>
          <button type="button" onClick={onCapabilities} title={t.plugins} aria-label={t.plugins}>
            <Plug size={17} />
            <span>{t.plugins}</span>
          </button>
        </nav>

        <section className="sidebar-section">
          <div className="section-head">
            <span>{t.projects}</span>
            <button type="button" onClick={onSelectProject} title={t.selectProject} aria-label={t.selectProject}>
              <Plus size={14} />
            </button>
          </div>
          <div className="project-list">
            {projects.map((project) => {
              const active = (state.activeProject?.path || state.activeProject?.name) === (project.path || project.name);
              const missing = active && projectPathMissing;
              return (
                <button
                  type="button"
                  key={project.path || project.name}
                  className={cx(active && "active", missing && "project-missing")}
                  onClick={() => onSetProject(project)}
                  title={missing ? `${t.projectPathMissing}: ${project.path || project.name}` : project.path || project.name}
                  aria-label={`${t.projects}: ${projectLabel(project, t)}${missing ? ` · ${t.projectPathMissing}` : ""}`}
                  data-project-name={project.name || ""}
                  data-project-path={project.path || ""}
                  data-project-active={active ? "true" : "false"}
                >
                  <Folder size={15} />
                  <span>{projectLabel(project, t)}</span>
                  {missing && <em className="project-missing-badge">{t.projectPathMissing}</em>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="sidebar-section chat-section">
          <div className="section-head chat-section-head">
            <span>{t.chats}</span>
            <div className="chat-scope-toggle" aria-label={t.chats}>
              <button
                type="button"
                className={cx(projectScope === "current" && "active")}
                onClick={() => onProjectScopeChange?.("current")}
                title={activeProject?.path || activeProject?.name || t.projectFilteredChats}
                data-thread-scope="current"
              >
                <span>{t.projectFilteredChats}</span>
                <em>{scopeCounts.current}</em>
              </button>
              <button
                type="button"
                className={cx(projectScope === "all" && "active")}
                onClick={() => onProjectScopeChange?.("all")}
                title={t.allProjectChats}
                data-thread-scope="all"
              >
                <span>{t.allProjectChats}</span>
                <em>{scopeCounts.all}</em>
              </button>
              <button
                type="button"
                className={cx(projectScope === "archived" && "active")}
                onClick={() => onProjectScopeChange?.("archived")}
                title={t.showArchivedChats}
                data-thread-scope="archived"
              >
                <span>{t.showArchivedChats}</span>
                <em>{scopeCounts.archived}</em>
              </button>
            </div>
          </div>
          <div className="thread-scope-summary" aria-label={t.threadScopeEvidence} title={activeProject?.path || projectLabel(activeProject, t)}>
            <span>{t.threadScopeEvidence}</span>
            <strong>{scopeSummary}</strong>
          </div>
          <div className="thread-list">
            {loading ? (
              <div className="thread-skeleton" aria-busy="true" aria-label={t.loadingChats}>
                <div className="thread-skeleton-row" />
                <div className="thread-skeleton-row" />
                <div className="thread-skeleton-row" />
              </div>
            ) : loadError ? (
              <div className="thread-list-error">
                <span>{t.chatsLoadError}</span>
                <button type="button" className="plain-action subtle-action" onClick={onRetryLoad}>
                  <RefreshCw size={13} />
                  {t.retry}
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="empty-list">{query.trim() ? t.noChatsMatch : t.noChatsYet}</p>
            ) : (
              filtered.map((item) => {
                const session = item.session;
                const needsPermission = (session.messages || []).some((message) => message.permissionDenials?.length > 0);
                const isStreaming = streamingSessionId === session.id;
                const isDraft = item.messageCount === 0;
                const meta = sessionMetaLabel(session, t, isStreaming);
                return (
                  <article
                    key={session.id}
                    className={cx("thread-item", isDraft && "draft-thread", activeSessionId === session.id && "active", session.pinned && "pinned-thread")}
                    title={`${item.title}\n${item.subtitle}`}
                    data-thread-id={session.id}
                    data-thread-project={session.project || ""}
                    data-thread-project-path={session.projectPath || ""}
                    data-thread-pinned={session.pinned ? "true" : "false"}
                    data-thread-archived={session.archived ? "true" : "false"}
                    data-thread-message-count={item.messageCount}
                  >
                    <button type="button" className="thread-open-button" onClick={() => setActiveSessionId(session.id)}>
                      <span className="thread-main">
                      <strong>
                        {session.pinned && <Pin size={12} className="thread-pin-badge" title={t.pinThread} />}
                        {isStreaming && <span className="thread-stream-dot" aria-hidden="true" />}
                        {item.title}
                      </strong>
                      {!isDraft && <span className="thread-subtitle">{item.subtitle}</span>}
                      </span>
                      <span className="thread-meta">
                        <small>
                          {needsPermission && <AlertTriangle size={12} className="thread-permission-badge" title={t.threadNeedsPermission} />}
                          {meta}
                        </small>
                        {!isDraft && <time>{formatRelativeTime(session.updatedAt, lang)}</time>}
                      </span>
                    </button>
                    <span className="thread-actions" aria-label={t.commandPalette}>
                      <button type="button" data-thread-action="rename" onClick={() => onRenameThread(session)} title={t.renameThread} aria-label={t.renameThread}>
                        <Pencil size={12} />
                      </button>
                      <button type="button" data-thread-action={session.pinned ? "unpin" : "pin"} onClick={() => onTogglePinThread(session)} title={session.pinned ? t.unpinThread : t.pinThread} aria-label={session.pinned ? t.unpinThread : t.pinThread}>
                        <Pin size={12} />
                      </button>
                      <button type="button" data-thread-action="fork" onClick={() => onForkThread(session)} title={t.forkThread} aria-label={t.forkThread}>
                        <GitFork size={12} />
                      </button>
                      <button type="button" data-thread-action={session.archived ? "restore" : "archive"} onClick={() => onArchiveThread(session)} title={session.archived ? t.restoreThread : t.archiveThread} aria-label={session.archived ? t.restoreThread : t.archiveThread}>
                        <Archive size={12} />
                      </button>
                      <button type="button" data-thread-action="delete" onClick={() => onDeleteThread(session)} title={t.deleteThread} aria-label={t.deleteThread}>
                        <Trash2 size={12} />
                      </button>
                      <button type="button" data-thread-action="resume" onClick={() => onResumeThread?.(session)} title={t.resumeThread} aria-label={t.resumeThread}>
                        <History size={12} />
                      </button>
                    </span>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <div className="account-row runtime-row">
          <div className="account-avatar"><SquareTerminal size={14} /></div>
          <div>
            <strong>{t.localRuntime}</strong>
            <span>{displayModelLabel(state.settings?.model)}</span>
          </div>
          <button type="button" onClick={onSettings} title={t.settings} aria-label={t.settings}>
            <Settings size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function WelcomeComposer({
  onSend,
  onCancel,
  busy,
  settings,
  activeProject,
  projectPathMissing = false,
  hasKey,
  onSelectProject,
  onSettings,
  onCapabilities,
  draft,
  setDraft,
  justSent,
  focusToken,
  t,
}) {
  const [localValue, setLocalValue] = useState("");
  const value = draft ?? localValue;
  const updateValue = setDraft ?? setLocalValue;
  const textareaRef = useRef(null);
  const submit = (event) => {
    event.preventDefault();
    if (!busy && value.trim()) {
      onSend(value);
      updateValue("");
    }
  };
  const usesClaudeCode = settings.claudeCode?.executionMode !== "api";
  const needsProviderSetup = !usesClaudeCode && settings.provider !== "ollama" && !hasKey;
  const projectName = projectLabel(activeProject, t);
  const projectTitle = projectPathMissing
    ? `${t.projectPathMissing}: ${activeProject?.path || t.chooseProject}`
    : activeProject?.path || t.chooseProject;
  const modelTitle = needsProviderSetup ? t.setupProviderHint : settings.model;
  const modelLabel = usesClaudeCode ? displayModelLabel(settings.model) : displayModelLabel(settings.model) || settings.model;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (!focusToken) return;
    textareaRef.current?.focus();
  }, [focusToken]);

  return (
    <form className="prompt-box" onSubmit={submit}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => updateValue(event.target.value)}
        placeholder={t.placeholder}
        rows={1}
        autoFocus
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            submit(event);
            return;
          }
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            submit(event);
          }
        }}
      />
      <div className="prompt-actions">
        <div className="prompt-left">
          <button type="button" className={cx("composer-icon-button project-pill", projectPathMissing && "project-missing")} title={projectTitle} aria-label={`${t.projectContext}: ${projectName}${projectPathMissing ? ` · ${t.projectPathMissing}` : ""}`} onClick={onSelectProject}>
            <Folder size={15} />
            <span>{compactPath(projectName, 22)}</span>
            {projectPathMissing && <AlertTriangle size={13} />}
          </button>
          <button type="button" className="permissions-pill" onClick={onCapabilities} title={t.capabilities} aria-label={t.capabilities}>
            <Settings size={16} />
            <span>{t.defaultPermissionsShort}</span>
            <ChevronDown size={14} />
          </button>
          <span className="composer-hint">{t.composerShortcutHint}</span>
        </div>
        <div className="prompt-right">
          <button type="button" className={cx("model-pill", needsProviderSetup && "needs-setup")} onClick={onSettings} title={modelTitle} aria-label={`${t.model}: ${modelTitle}`}>
            <span>{usesClaudeCode ? t.claudeCodeMode : t.model}</span>
            <strong>{modelLabel}</strong>
          </button>
          <button
            type={busy ? "button" : "submit"}
            className={cx("send-button", justSent && "send-success")}
            onClick={busy ? onCancel : undefined}
            disabled={!busy && !value.trim()}
            title={busy ? t.cancel : justSent ? t.messageSent : t.send}
            aria-label={busy ? t.cancel : t.send}
          >
            {busy ? <X size={18} /> : justSent ? <Check size={18} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </form>
  );
}

function Conversation({
  session,
  sessions = [],
  settings,
  activeProject,
  hasKey,
  onSend,
  onCancel,
  onSelectProject,
  onSettings,
  onCapabilities,
  onRunEvent,
  onCopy,
  onRetry,
  onOpenInteractiveClaude,
  sidebarVisible,
  onToggleSidebar,
  rightPanelVisible,
  onToggleTools,
  bottomPanel,
  setBottomPanel,
  onActivateTool,
  onOpenAutomation,
  onOpenTaskCenterFocus,
  onOpenTerminal,
  onOpenProject,
  busy,
  streamingAssistant,
  optimisticUser,
  runEvents,
  automations,
  subagentRuns,
  commandRuns,
  onCommandRuns,
  sourceRefs,
  browserVisits,
  onOpenBrowserVisit,
  onOpenExternalBrowserVisit,
  notices,
  onDismissNotice,
  onClearNotices,
  onRunAutomationNow,
  onToggleAutomationEnabled,
  onDeleteAutomation,
  onRunSubagent,
  onCancelSubagent,
  onArchiveSubagent,
  onContinueSubagent,
  onRetryWorkspaceCommand,
  onRetryClaudeCommand,
  onRetryCapabilityCommand,
  onConfirmCapabilityCommand,
  onOpenRunTimeline,
  onOpenWorkspaceFile,
  runTimelineFocus,
  gitPanelFocus,
  sourcePanelFocus,
  browserPanelFocus,
  taskCenterFocus,
  draft,
  setDraft,
  composerFocusToken,
  environment,
  projectPathMissing = false,
  onRefreshEnvironment,
  ideOptions,
  selectedIdeId,
  setSelectedIdeId,
  onOpenIde,
  lang,
  t,
}) {
  const messagesRef = useRef(null);
  const messages = useMemo(() => {
    const base = session?.messages || [];
    if (!optimisticUser) return base;
    const exists = base.some((message) => message.role === "user" && message.content === optimisticUser.content && message.createdAt === optimisticUser.createdAt);
    return exists ? base : [...base, { role: "user", content: optimisticUser.content, createdAt: optimisticUser.createdAt }];
  }, [session?.messages, optimisticUser]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, streamingAssistant?.content, streamingAssistant?.status]);

  const [justSent, setJustSent] = useState(false);
  const prevBusyRef = useRef(busy);
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (wasBusy && !busy) {
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== "error") {
        setJustSent(true);
        const timer = setTimeout(() => setJustSent(false), 1200);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const emptyTitle = session ? t.selectedEmptyTitle : t.noSessionTitle;
  const emptyHint = session ? t.selectedEmptyHint : t.noSessionHint;
  const [selectedGitDiffPath, setSelectedGitDiffPath] = useState("");
  const [selectedGitHunkId, setSelectedGitHunkId] = useState("");
  const [gitActionWorkingPath, setGitActionWorkingPath] = useState("");
  const [gitCommitMessage, setGitCommitMessage] = useState("");
  const git = environment?.git;
  const gitAvailable = Boolean(git?.available);
  const gitChangesLabel = gitAvailable ? String(git.changes || 0) : t.gitUnavailable;
  const branchLabel = git?.branch || t.gitUnavailable;
  const upstreamLabel = git?.upstream || t.noGitUpstream;
  const remoteLabel = git?.remote || t.noGitRemote;
  const aheadBehindLabel = gitAheadBehindLabel(git, t);
  const gitRootPath = String(git?.root || "").trim();
  const gitRelativePath = String(git?.relativePath || "").trim();
  const gitRootLabel = gitRootPath ? compactPath(gitRootPath, 78) : t.gitUnavailable;
  const gitRelativeLabel = gitRelativePath && gitRelativePath !== "." ? gitRelativePath : t.activeProject;
  const rawGitStatus = String(git?.raw || "").trim();
  const gitFiles = Array.isArray(git?.files) ? git.files : [];
  const gitSummary = git?.summary || {};
  const gitSummaryItems = [
    [t.stagedChanges, gitSummary.staged || 0, "staged"],
    [t.unstagedChanges, gitSummary.unstaged || 0, "unstaged"],
    [t.untrackedChanges, gitSummary.untracked || 0, "untracked"],
    [t.mixedChanges, gitSummary.mixed || 0, "mixed"],
    [t.renamedChanges, gitSummary.renamed || 0, "renamed"],
    [t.deletedChanges, gitSummary.deleted || 0, "deleted"],
    [t.conflictedChanges, gitSummary.conflicted || 0, "conflicted"],
  ].filter(([, count]) => Number(count) > 0);
  const gitStat = String(git?.stat || "").trim();
  const gitDiffText = String(git?.diff?.text || "").trim();
  const gitFileDiffs = Array.isArray(git?.diff?.fileDiffs) ? git.diff.fileDiffs : [];
  const selectedGitFile = selectedGitDiffPath
    ? gitFiles.find((item) => item.path === selectedGitDiffPath || item.previousPath === selectedGitDiffPath)
    : null;
  const selectedGitCanStage = gitAvailable && gitFileCanStage(selectedGitFile);
  const selectedGitCanUnstage = gitAvailable && gitFileCanUnstage(selectedGitFile);
  const selectedGitActionBusy = Boolean(selectedGitFile?.path && gitActionWorkingPath === selectedGitFile.path);
  const gitActionWorking = Boolean(gitActionWorkingPath);
  const gitStagedCount = Number(gitSummary.staged || 0);
  const gitCommitMessageValue = gitCommitMessage.trim();
  const gitCanCommit = gitAvailable && gitStagedCount > 0 && Boolean(gitCommitMessageValue) && !gitActionWorking;
  const gitCanPush = gitAvailable && gitBranchCanPush(branchLabel, t) && Boolean(git?.upstream) && !gitActionWorking;
  const gitPushTitle = git?.upstream ? t.gitPushHint : t.gitPushUnavailableNoUpstream;
  const selectedGitFileDiff = selectedGitDiffPath
    ? gitFileDiffs.find((item) => item.path === selectedGitDiffPath || item.previousPath === selectedGitDiffPath)
    : null;
  const displayedGitDiffText = selectedGitDiffPath ? selectedGitFileDiff?.text || "" : gitDiffText;
  const gitHunks = useMemo(() => buildGitHunks(displayedGitDiffText), [displayedGitDiffText]);
  const selectedGitHunk = selectedGitHunkId ? gitHunks.find((item) => item.id === selectedGitHunkId) : null;
  const focusedGitDiffText = selectedGitHunk ? selectedGitHunk.text : displayedGitDiffText;
  const [copiedGitEvidence, setCopiedGitEvidence] = useState(false);
  const copiedGitEvidenceTimer = useRef(null);
  const gitEvidenceCopyText = useMemo(() => gitEvidenceText({
    t,
    activeProject,
    branchLabel,
    upstreamLabel,
    remoteLabel,
    aheadBehindLabel,
    selectedFile: selectedGitFile,
    selectedPath: selectedGitDiffPath,
    selectedDiffText: focusedGitDiffText,
    gitStat,
    rawGitStatus,
    gitRoot: gitRootPath,
    gitRelativePath,
    gitSummaryItems,
    selectedHunk: selectedGitHunk,
    hunkCount: gitHunks.length,
  }), [t, activeProject, branchLabel, upstreamLabel, remoteLabel, aheadBehindLabel, selectedGitFile, selectedGitDiffPath, focusedGitDiffText, gitStat, rawGitStatus, gitRootPath, gitRelativePath, gitSummaryItems, selectedGitHunk, gitHunks.length]);
  const gitDiffRows = useMemo(() => buildGitDiffRows(focusedGitDiffText), [focusedGitDiffText]);
  useEffect(() => () => {
    if (copiedGitEvidenceTimer.current) window.clearTimeout(copiedGitEvidenceTimer.current);
  }, []);
  useEffect(() => {
    setCopiedGitEvidence(false);
  }, [gitEvidenceCopyText]);
  async function copyGitEvidence() {
    await onCopy?.(gitEvidenceCopyText);
    setCopiedGitEvidence(true);
    if (copiedGitEvidenceTimer.current) window.clearTimeout(copiedGitEvidenceTimer.current);
    copiedGitEvidenceTimer.current = window.setTimeout(() => setCopiedGitEvidence(false), 1200);
  }
  useEffect(() => {
    if (!selectedGitDiffPath) return;
    const stillExists = gitFiles.some((item) => item.path === selectedGitDiffPath || item.previousPath === selectedGitDiffPath)
      || gitFileDiffs.some((item) => item.path === selectedGitDiffPath || item.previousPath === selectedGitDiffPath);
    if (!stillExists) setSelectedGitDiffPath("");
  }, [selectedGitDiffPath, gitFiles, gitFileDiffs]);
  useEffect(() => {
    if (selectedGitHunkId && !gitHunks.some((item) => item.id === selectedGitHunkId)) setSelectedGitHunkId("");
  }, [selectedGitHunkId, gitHunks]);
  useEffect(() => {
    const focusedPath = String(gitPanelFocus?.path || "").trim();
    const focusedHunkId = String(gitPanelFocus?.hunkId || "").trim();
    if (!focusedPath && !focusedHunkId && !gitPanelFocus?.all) return;
    setSelectedGitDiffPath(focusedPath);
    setSelectedGitHunkId(focusedHunkId);
  }, [gitPanelFocus?.path, gitPanelFocus?.hunkId, gitPanelFocus?.all, gitPanelFocus?.nonce]);
  async function runGitFileAction(action, file = selectedGitFile) {
    if (!file?.path || !activeProject?.path) return;
    if (!desktopApi?.runWorkspaceCommand) {
      window.alert?.(t.desktopOnly);
      return;
    }
    const command = action === "stage"
      ? `git add -- ${quoteWorkspaceCommandPath(file.path)}`
      : `git restore --staged -- ${quoteWorkspaceCommandPath(file.path)}`;
    const warning = action === "stage" ? t.confirmGitStageWarning : t.confirmGitUnstageWarning;
    const confirmed = window.confirm?.(`${t.confirmGitActionTitle}\n\n${warning.replace("{path}", file.path)}\n\n$ ${command}`);
    if (!confirmed) return;
    const requestId = `git_command_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const actionLabel = action === "stage" ? t.stageFile : t.unstageFile;
    setGitActionWorkingPath(file.path);
    onRunEvent?.({
      id: requestId,
      type: "git-command",
      status: "running",
      title: `Git: ${actionLabel}`,
      detail: file.path,
      commandLine: command,
      cwd: activeProject.path,
    });
    try {
      const result = await desktopApi.runWorkspaceCommand({ projectPath: activeProject.path, command, requestId });
      if (Array.isArray(result?.commandRuns)) onCommandRuns?.(result.commandRuns);
      const code = typeof result?.code === "number" ? result.code : null;
      onRunEvent?.({
        id: requestId,
        type: "git-command",
        status: result?.cancelled ? "cancelled" : code === 0 ? "ok" : "error",
        title: `Git: ${actionLabel}`,
        detail: `${t.commandExit}: ${code ?? "-"}`,
        commandLine: result?.command || command,
        cwd: result?.cwd || activeProject.path,
        code,
        durationMs: typeof result?.durationMs === "number" ? result.durationMs : null,
      });
      await onRefreshEnvironment?.();
    } catch (error) {
      onRunEvent?.({
        id: requestId,
        type: "git-command",
        status: "error",
        title: `Git: ${actionLabel}`,
        detail: error?.message || String(error),
        commandLine: command,
        cwd: activeProject.path,
      });
    } finally {
      setGitActionWorkingPath("");
    }
  }
  async function runGitRepoAction(action) {
    if (!activeProject?.path) return;
    if (!desktopApi?.runWorkspaceCommand) {
      window.alert?.(t.desktopOnly);
      return;
    }
    const isCommit = action === "commit";
    const message = gitCommitMessage.trim();
    if (isCommit && (!message || gitStagedCount <= 0)) return;
    if (!isCommit && !git?.upstream) return;
    const command = isCommit ? `git commit -m ${quoteWorkspaceCommandPath(message)}` : "git push";
    const actionLabel = isCommit ? t.commitStaged : t.pushBranch;
    const warning = isCommit ? t.confirmGitCommitWarning.replace("{message}", message) : t.confirmGitPushWarning;
    const confirmed = window.confirm?.(`${t.confirmGitActionTitle}\n\n${warning}\n\n$ ${command}`);
    if (!confirmed) return;
    const requestId = `git_command_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setGitActionWorkingPath(`repo:${action}`);
    onRunEvent?.({
      id: requestId,
      type: "git-command",
      status: "running",
      title: `Git: ${actionLabel}`,
      detail: isCommit ? message : branchLabel,
      commandLine: command,
      cwd: activeProject.path,
    });
    try {
      const result = await desktopApi.runWorkspaceCommand({ projectPath: activeProject.path, command, requestId });
      if (Array.isArray(result?.commandRuns)) onCommandRuns?.(result.commandRuns);
      const code = typeof result?.code === "number" ? result.code : null;
      if (isCommit && code === 0) setGitCommitMessage("");
      const nextEnvironment = await onRefreshEnvironment?.();
      const afterSync = gitAheadBehindLabel(nextEnvironment?.git, t);
      const handoffDetail = gitActionHandoffDetail({
        action,
        result,
        message,
        branchLabel,
        beforeSync: aheadBehindLabel,
        afterSync,
        t,
      });
      onRunEvent?.({
        id: requestId,
        type: "git-command",
        status: result?.cancelled ? "cancelled" : code === 0 ? "ok" : "error",
        title: `Git: ${actionLabel}`,
        detail: handoffDetail,
        commandLine: result?.command || command,
        cwd: result?.cwd || activeProject.path,
        code,
        durationMs: typeof result?.durationMs === "number" ? result.durationMs : null,
      });
    } catch (error) {
      onRunEvent?.({
        id: requestId,
        type: "git-command",
        status: "error",
        title: `Git: ${actionLabel}`,
        detail: error?.message || String(error),
        commandLine: command,
        cwd: activeProject.path,
      });
    } finally {
      setGitActionWorkingPath("");
    }
  }
  const activeNotices = useMemo(() => (notices || []).filter((notice) => !notice.dismissedAt), [notices]);
  const automationItemsForUi = useMemo(() => (Array.isArray(automations) ? automations : []), [automations]);
  const workspaceCommandRuns = useMemo(() => commandRunsToHistory(commandRuns, "workspace"), [commandRuns]);
  const claudeCommandRuns = useMemo(() => commandRunsToHistory(commandRuns, "claude"), [commandRuns]);
  const capabilityCommandRuns = useMemo(() => commandRunsToHistory(commandRuns, "capability"), [commandRuns]);
  const focusedSourceKey = String(sourcePanelFocus?.id || sourcePanelFocus?.path || "").trim();
  const focusedBrowserVisitKey = String(browserPanelFocus?.id || browserPanelFocus?.url || "").trim();
  const [bottomWorkspaceRetryingId, setBottomWorkspaceRetryingId] = useState("");
  const [bottomClaudeRetryingId, setBottomClaudeRetryingId] = useState("");
  const [bottomCapabilityRetryingId, setBottomCapabilityRetryingId] = useState("");
  const latestGitActionEvent = useMemo(() => (
    (runEvents || []).find((event) => event.type === "git-command" && event.status !== "running") || null
  ), [runEvents]);
  const latestGitActionRun = latestGitActionEvent ? findCommandRunForEvent(latestGitActionEvent, commandRuns) : null;
  const [selectedRunEventId, setSelectedRunEventId] = useState("");
  const fallbackSelectedRunEvent = useMemo(() => fallbackRunEventForId(selectedRunEventId, {
    commandRuns,
    automations: automationItemsForUi,
    subagentRuns,
    browserVisits,
    t,
  }), [selectedRunEventId, commandRuns, automationItemsForUi, subagentRuns, browserVisits, t]);
  const runTimelineEvents = useMemo(() => timelineEventsForUi(runEvents, {
    commandRuns,
    automations: automationItemsForUi,
    subagentRuns,
    browserVisits,
    t,
  }), [runEvents, commandRuns, automationItemsForUi, subagentRuns, browserVisits, t]);
  const selectedRunEvent = useMemo(() => {
    const existing = runTimelineEvents.find((event) => event.id === selectedRunEventId);
    if (existing) return existing;
    if (fallbackSelectedRunEvent) return fallbackSelectedRunEvent;
    if (!runTimelineEvents.length) return null;
    if (selectedRunEventId) return null;
    return runTimelineEvents[0];
  }, [runTimelineEvents, selectedRunEventId, fallbackSelectedRunEvent]);
  const selectedRunEvidence = useMemo(() => (
    selectedRunEvent
      ? runTimelineEvidenceForEvent(selectedRunEvent, {
          commandRuns,
          automations: automationItemsForUi,
          subagentRuns,
          browserVisits,
          sessions,
          t,
        })
      : null
  ), [selectedRunEvent, commandRuns, automationItemsForUi, subagentRuns, browserVisits, sessions, t]);
  const selectedRunAutomation = selectedRunEvidence?.automationId
    ? automationItemsForUi.find((automation) => automation?.id === selectedRunEvidence.automationId)
    : null;
  const selectedRunSubagent = selectedRunEvidence?.subagentRunId || selectedRunEvidence?.subagentRequestId
    ? (subagentRuns || []).find((run) => (
        run?.id === selectedRunEvidence.subagentRunId
        || run?.requestId === selectedRunEvidence.subagentRequestId
      ))
    : null;
  const selectedRunCommand = selectedRunEvent
    ? findCommandRunForEvent(selectedRunEvent, commandRuns)
    : null;
  const selectedRunBrowserVisit = selectedRunEvent && selectedRunEvidence?.source === "browser"
    ? findBrowserVisitForEvent(selectedRunEvent, browserVisits)
    : null;
  const selectedRunRecoveryActions = [];
  if (selectedRunAutomation) {
    selectedRunRecoveryActions.push({
      key: "task-center",
      label: t.taskCenter,
      icon: FileText,
      onClick: () => onOpenTaskCenterFocus?.("automation", selectedRunAutomation.id, {
        expandEvidence: true,
        expandHistory: true,
      }),
    });
    selectedRunRecoveryActions.push({
      key: "run-automation",
      label: selectedRunAutomation.status === "running" ? t.automationRunning : t.runNow,
      icon: Send,
      disabled: selectedRunAutomation.status === "running",
      onClick: () => onRunAutomationNow?.(selectedRunAutomation),
    });
  }
  if (selectedRunSubagent) {
    selectedRunRecoveryActions.push({
      key: "task-center",
      label: t.taskCenter,
      icon: FileText,
      onClick: () => onOpenTaskCenterFocus?.("subagent", selectedRunSubagent.id || selectedRunSubagent.requestId, {
        expandEvidence: true,
        expandArtifacts: Array.isArray(selectedRunSubagent.artifacts) && selectedRunSubagent.artifacts.length > 0,
      }),
    });
    if (selectedRunSubagent.status !== "running") {
      selectedRunRecoveryActions.push({
        key: "retry-subagent",
        label: t.retrySubagent,
        icon: RefreshCw,
        onClick: () => onRunSubagent?.(selectedRunSubagent.task || "", selectedRunSubagent.nickname || "Subagent", {
          projectPath: selectedRunSubagent.project?.path || selectedRunSubagent.cwd || selectedRunEvidence?.cwd || "",
          sessionId: selectedRunSubagent.sessionId || selectedRunEvidence?.sessionId || "",
        }),
      });
      selectedRunRecoveryActions.push({
        key: "continue-subagent",
        label: selectedRunSubagent.continuedAt ? t.subagentContinuedShort : t.continueSubagent,
        icon: MessageSquarePlus,
        disabled: Boolean(selectedRunSubagent.continuedAt),
        onClick: () => onContinueSubagent?.(selectedRunSubagent),
      });
    }
  }
  if (selectedRunEvidence?.source === "automation" || selectedRunEvidence?.source === "subagent") {
    selectedRunRecoveryActions.push({
      key: "terminal",
      label: t.openTerminal,
      icon: SquareTerminal,
      onClick: () => onOpenTerminal?.(selectedRunEvidence?.cwd || ""),
    });
    selectedRunRecoveryActions.push({
      key: "interactive-claude",
      label: t.openInteractiveClaude,
      icon: Bot,
      onClick: () => onOpenInteractiveClaude?.({
        projectPath: selectedRunEvidence?.cwd || "",
      }),
    });
  }
  if (selectedRunBrowserVisit) {
    selectedRunRecoveryActions.push({
      key: "retry-browser",
      label: selectedRunBrowserVisit.status === "error" ? t.retry : t.reopenBrowserVisit,
      icon: RefreshCw,
      onClick: () => onOpenBrowserVisit?.(selectedRunBrowserVisit),
    });
    selectedRunRecoveryActions.push({
      key: "external-browser",
      label: t.openExternal,
      icon: ExternalLink,
      onClick: () => onOpenExternalBrowserVisit?.(selectedRunBrowserVisit),
    });
    selectedRunRecoveryActions.push({
      key: "browser-tool",
      label: t.openBrowserTool,
      icon: Globe2,
      onClick: () => onActivateTool?.("browser"),
    });
  }
  if (selectedRunCommand) {
    const commandKind = selectedRunCommand.kind || selectedRunEvidence?.commandKind || "";
    const canRetryCommand = selectedRunCommand.code !== 0 && !selectedRunCommand.cancelled;
    if (commandKind === "workspace") {
      if (canRetryCommand) {
        selectedRunRecoveryActions.push({
          key: "retry-workspace",
          label: bottomWorkspaceRetryingId ? t.commandRunning : t.retry,
          icon: RefreshCw,
          disabled: Boolean(bottomWorkspaceRetryingId),
          onClick: () => retryBottomWorkspaceEntry(selectedRunCommand),
        });
      }
      selectedRunRecoveryActions.push({
        key: "terminal",
        label: t.openTerminalTool,
        icon: SquareTerminal,
        onClick: () => onActivateTool?.("terminal"),
      });
    }
    if (commandKind === "claude") {
      if (canRetryCommand && claudeArgsFromRun(selectedRunCommand)) {
        selectedRunRecoveryActions.push({
          key: "retry-claude",
          label: bottomClaudeRetryingId ? t.commandRunning : t.retry,
          icon: RefreshCw,
          disabled: Boolean(bottomClaudeRetryingId),
          onClick: () => retryBottomClaudeEntry(selectedRunCommand),
        });
      }
      selectedRunRecoveryActions.push({
        key: "interactive-claude",
        label: t.openInteractiveClaude,
        icon: Bot,
        onClick: () => onOpenInteractiveClaude?.({
          projectPath: selectedRunCommand.cwd || selectedRunEvidence?.cwd || "",
        }),
      });
    }
    if (commandKind === "capability") {
      const retryArgs = capabilityRetryArgsFromRun(selectedRunCommand);
      if (canRetryCommand && retryArgs) {
        selectedRunRecoveryActions.push({
          key: "retry-capability",
          label: bottomCapabilityRetryingId ? t.commandRunning : t.retry,
          icon: RefreshCw,
          disabled: Boolean(bottomCapabilityRetryingId),
          onClick: () => retryBottomCapabilityEntry(selectedRunCommand),
        });
      }
      selectedRunRecoveryActions.push({
        key: "open-claude-panel",
        label: t.openClaudePanel,
        icon: Bot,
        onClick: () => onActivateTool?.("claude"),
      });
    }
  }
  useEffect(() => {
    if (!runTimelineEvents.length) return;
    if (selectedRunEventId && runTimelineEvents.some((event) => event.id === selectedRunEventId)) return;
    if (fallbackRunEventForId(selectedRunEventId, { commandRuns, automations: automationItemsForUi, subagentRuns, browserVisits, t })) return;
    if (selectedRunEventId) return;
    setSelectedRunEventId(runTimelineEvents[0].id);
  }, [runTimelineEvents, selectedRunEventId, commandRuns, automationItemsForUi, subagentRuns, browserVisits, t]);
  useEffect(() => {
    const focusedId = String(runTimelineFocus?.id || "").trim();
    if (focusedId) setSelectedRunEventId(focusedId);
  }, [runTimelineFocus?.id, runTimelineFocus?.nonce]);
  const activeTaskCount = automationItemsForUi.filter((item) => ["running", "scheduled"].includes(item.status)).length
    + (subagentRuns || []).filter((run) => run.status === "running").length;
  const contextTabs = [
    { id: "environment", label: t.environment, icon: HardDrive, meta: projectPathMissing ? t.projectPathMissing : branchLabel },
    { id: "outputs", label: t.outputs, icon: FileText, meta: busy ? t.commandRunning : "" },
    { id: "notices", label: t.notices, icon: AlertTriangle, meta: activeNotices.length ? String(activeNotices.length) : "" },
    { id: "changes", label: t.changes, icon: GitBranch, meta: gitChangesLabel },
    { id: "sources", label: t.sources, icon: Folder, meta: activeProject?.path ? t.files : "" },
    { id: "subagents", label: t.subagents, icon: Bot, meta: activeTaskCount ? String(activeTaskCount) : "" },
  ];
  const utilityTabs = [
    { id: "terminal", label: t.terminal, icon: SquareTerminal },
    { id: "browser", label: t.browser, icon: Globe2 },
  ];
  function openConversationBottomPanel(id, options = {}) {
    if (id === "changes" && options.resetGitFocus !== false) {
      setSelectedGitDiffPath("");
      setSelectedGitHunkId("");
    }
    setBottomPanel(id);
  }
  const toggleBottomPanel = (id) => (bottomPanel === id ? setBottomPanel("") : openConversationBottomPanel(id));
  async function retryBottomWorkspaceEntry(entry) {
    const command = workspaceCommandFromRun(entry);
    if (!command || !onRetryWorkspaceCommand || bottomWorkspaceRetryingId) return;
    setBottomWorkspaceRetryingId(entry.id || command);
    try {
      await onRetryWorkspaceCommand({ command, projectPath: entry.cwd || activeProject?.path || "" });
    } finally {
      setBottomWorkspaceRetryingId("");
    }
  }
  async function retryBottomClaudeEntry(entry) {
    const args = claudeArgsFromRun(entry);
    if (!args || !onRetryClaudeCommand || bottomClaudeRetryingId) return;
    setBottomClaudeRetryingId(entry.id || args);
    try {
      await onRetryClaudeCommand(args);
    } finally {
      setBottomClaudeRetryingId("");
    }
  }
  async function retryBottomCapabilityEntry(entry) {
    const safeArgs = safeCapabilityRetryArgsFromRun(entry);
    if (safeArgs && onRetryCapabilityCommand && !bottomCapabilityRetryingId) {
      setBottomCapabilityRetryingId(entry.id || safeArgs);
      try {
        await onRetryCapabilityCommand(safeArgs);
      } finally {
        setBottomCapabilityRetryingId("");
      }
      return;
    }
    const mutatingArgs = mutatingCapabilityRetryArgsFromRun(entry);
    if (!mutatingArgs || !onConfirmCapabilityCommand) return;
    onConfirmCapabilityCommand(mutatingArgs);
  }

  function handleNoticeAction(notice) {
    const action = String(notice?.action || "");
    if (action.startsWith("git-run:")) {
      const eventId = decodeActionSuffix(action, "git-run:");
      if (eventId) setSelectedRunEventId(eventId);
      openConversationBottomPanel("changes");
      return;
    }
    if (action.startsWith("run:")) {
      const eventId = decodeActionSuffix(action, "run:");
      onOpenRunTimeline?.(eventId);
      return;
    }
    if (action.startsWith("capability:")) {
      const focus = capabilityFocusFromAction(action);
      onCapabilities?.(focus.tab, focus.kind || focus.id ? focus : null);
      return;
    }
    if (action.startsWith("runtime-health:")) {
      const target = action.split(":")[1] || "";
      if (["plugins", "skills", "mcp", "marketplace"].includes(target)) {
        onCapabilities?.(target);
        return;
      }
      if (target === "claude") {
        onActivateTool?.("claude");
      }
      return;
    }
    if (action.startsWith("automation:")) {
      const automationId = decodeActionSuffix(action, "automation:");
      if (automationId && onOpenTaskCenterFocus) {
        onOpenTaskCenterFocus("automation", automationId, {
          expandEvidence: true,
          expandHistory: true,
        });
        return;
      }
      onOpenAutomation?.();
      return;
    }
    if (action.startsWith("subagent:")) {
      const subagentId = decodeActionSuffix(action, "subagent:");
      if (subagentId && onOpenTaskCenterFocus) {
        onOpenTaskCenterFocus("subagent", subagentId, {
          expandEvidence: true,
          expandArtifacts: true,
        });
        return;
      }
    }
    if (action.startsWith("workspace:file:")) {
      const encodedPath = action.slice("workspace:file:".length);
      try {
        onOpenWorkspaceFile?.(decodeURIComponent(encodedPath), { force: true });
      } catch {
        onOpenWorkspaceFile?.(encodedPath, { force: true });
      }
    }
  }

  return (
    <main className="workspace">
      {!sidebarVisible && (
        <div className="workspace-left-actions">
          <button type="button" className="workspace-top-button" onClick={onToggleSidebar} title={t.toggleSidebar} aria-label={t.toggleSidebar}>
            <PanelRight size={15} />
            <span>{t.projects}</span>
          </button>
        </div>
      )}
      <div className="workspace-top-actions" aria-label={t.environment}>
        <div className="workspace-context-tabs" role="tablist" aria-label={t.bottomPanel}>
          {contextTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={cx("workspace-context-button", bottomPanel === item.id && "active")}
                onClick={() => toggleBottomPanel(item.id)}
                title={item.meta ? `${item.label} · ${item.meta}` : item.label}
                aria-label={item.meta ? `${item.label}: ${item.meta}` : item.label}
                aria-selected={bottomPanel === item.id}
              >
                <Icon size={14} />
                <span>{item.label}</span>
                {item.meta && <em>{item.meta}</em>}
              </button>
            );
          })}
        </div>
        {ideOptions?.length > 1 ? (
          <label className="ide-picker" title={t.openInIde}>
            <Monitor size={14} />
            <select value={selectedIdeId} onChange={(event) => setSelectedIdeId(event.target.value)} aria-label={t.openInIde}>
              {ideOptions.map((option) => (
                <option value={option.id} key={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <button type="button" className="workspace-top-button" onClick={onOpenIde} title={ideOptions?.[0]?.label || t.ideUnavailable} aria-label={t.openInIde}>
            <Code2 size={14} />
            <span>{ideOptions?.[0]?.label || t.openIde}</span>
          </button>
        )}
        <button type="button" className={cx("workspace-top-button side-panel-button", rightPanelVisible && "active")} onClick={onToggleTools} title={`${t.openSidePanel} Ctrl+\\`} aria-label={t.openSidePanel}>
          <PanelRight size={15} />
          <span>{rightPanelVisible ? t.close : t.tools}</span>
        </button>
        {bottomPanel && (
          <button type="button" className="workspace-top-button close-panel-button" onClick={() => setBottomPanel("")} title={t.close} aria-label={t.close}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className={cx("conversation-shell", messages.length === 0 && "is-empty")}>
        {messages.length === 0 ? (
          <section className="empty-state">
            <div className="empty-state-copy">
              <h1>{emptyTitle}</h1>
              {emptyHint && <p>{emptyHint}</p>}
            </div>
            <WelcomeComposer
              onSend={onSend}
              onCancel={onCancel}
              busy={busy}
              settings={settings}
              activeProject={activeProject}
              projectPathMissing={projectPathMissing}
              hasKey={hasKey}
              onSelectProject={onSelectProject}
              onSettings={onSettings}
              onCapabilities={onCapabilities}
              draft={draft}
              setDraft={setDraft}
              justSent={justSent}
              focusToken={composerFocusToken}
              t={t}
            />
          </section>
        ) : (
          <>
            <header className="thread-header">
              <div>
                <span>{t.activeThread}</span>
                <h1>{session?.title || "Claudex"}</h1>
              </div>
              <div className="model-chip">
                <Bot size={16} />
                <span>{settings.model}</span>
              </div>
            </header>
              <div className="messages" ref={messagesRef}>
              {messages.map((message, index) => (
                <article className={cx("message", message.role)} key={`${message.createdAt}-${index}`}>
                  <div className="message-avatar">
                    {message.role === "user" ? <UserRound size={15} /> : <Bot size={15} />}
                  </div>
                  <div className="message-content">
                    <div className="message-meta">
                      <strong>
                        {message.role === "user" ? t.you : message.role === "error" ? t.requestError : t.assistant}
                      </strong>
                      <time>{formatDate(message.createdAt, lang)}</time>
                      <button type="button" data-error-action={message.role === "error" ? "copy" : undefined} onClick={() => onCopy(message.content)} title={t.copy} aria-label={t.copy}>
                        <Copy size={13} />
                      </button>
                    </div>
                    <p>{message.content}</p>
                    {message.role === "error" && (
                      <div className="message-error-actions" role="group" aria-label={t.errorActions}>
                        <button type="button" data-error-action="retry" onClick={onRetry} disabled={busy} title={busy ? t.workingHint : t.retry}>
                          <RefreshCw size={13} />
                          {t.retry}
                        </button>
                        <button type="button" data-error-action="terminal" onClick={onOpenTerminal}>
                          <SquareTerminal size={13} />
                          {t.openTerminal}
                        </button>
                        <button type="button" data-error-action="interactive-claude" onClick={onOpenInteractiveClaude}>
                          <Bot size={13} />
                          {t.openInteractiveClaude}
                        </button>
                        <button type="button" data-error-action="settings" onClick={onSettings}>
                          <Settings size={13} />
                          {t.openSettings}
                        </button>
                      </div>
                    )}
                    {message.permissionDenials?.length > 0 && (
                      <div className="permission-notice">
                        <span>{t.permissionDeniedNotice}</span>
                        <button type="button" onClick={onOpenInteractiveClaude}>{t.openInteractiveClaude}</button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {busy && (
                <article className="message assistant">
                  <div className="message-avatar">
                    <Bot size={15} />
                  </div>
                  <div className="message-content">
                    <div className="message-meta">
                      <strong>{t.assistant}</strong>
                      <button type="button" onClick={onCancel}>{t.cancel}</button>
                    </div>
                    <p className={!streamingAssistant?.content ? "streaming-status" : ""}>
                      {streamingAssistant?.content || streamingAssistant?.status || t.waiting}
                    </p>
                    {streamingAssistant?.activities?.length > 0 && (
                      <ul className="activity-lines" aria-label={t.outputs}>
                        {streamingAssistant.activities.map((activity) => (
                          <li key={activity.id}>{activity.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              )}
            </div>
            <div className="composer-dock">
              <WelcomeComposer
                key={session?.id}
                onSend={onSend}
                onCancel={onCancel}
                busy={busy}
                settings={settings}
                activeProject={activeProject}
                projectPathMissing={projectPathMissing}
                hasKey={hasKey}
                onSelectProject={onSelectProject}
                onSettings={onSettings}
                onCapabilities={onCapabilities}
                draft={draft}
                setDraft={setDraft}
                justSent={justSent}
                focusToken={composerFocusToken}
                t={t}
              />
              {messages.some((message) => message.role === "error") && (
                <button type="button" className="retry-action" onClick={onRetry}>{t.retry}</button>
              )}
            </div>
          </>
        )}
      </div>
      {bottomPanel && (
        <section className="bottom-work-panel" aria-label={t.bottomPanel}>
          <div className="bottom-panel-tabs" role="tablist" aria-label={t.bottomPanel}>
            {[...contextTabs, ...utilityTabs].map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={cx(bottomPanel === id && "active")}
                onClick={() => openConversationBottomPanel(id)}
                role="tab"
                aria-selected={bottomPanel === id}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
            <button type="button" className="icon-only mini-icon" onClick={() => setBottomPanel("")} title={t.close} aria-label={t.close}>
              <X size={14} />
            </button>
          </div>
          <div className="bottom-panel-body">
            {bottomPanel === "outputs" && (
              <div className="bottom-panel-stack">
                <div className="bottom-panel-grid">
                  <div>
                    <span>{t.outputs}</span>
                    <strong>{busy ? streamingAssistant?.status || t.commandRunning : t.noActiveRun}</strong>
                    <p>{t.outputsPanelHint}</p>
                    {busy && streamingAssistant?.activities?.length > 0 && (
                      <ul className="activity-lines compact-activity-lines" aria-label={t.outputs}>
                        {streamingAssistant.activities.map((activity) => (
                          <li key={activity.id}>{activity.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <dl>
                    <div><dt>{t.activeProject}</dt><dd title={activeProject?.path || t.noProjectPath}>{projectLabel(activeProject, t)}</dd></div>
                    <div><dt>{t.branch}</dt><dd>{environment?.git?.branch || t.gitUnavailable}</dd></div>
                    <div><dt>{t.changes}</dt><dd>{environment?.git?.available ? environment.git.changes || 0 : t.gitUnavailable}</dd></div>
                  </dl>
                </div>
                {(runTimelineEvents.length > 0 || selectedRunEvent) && (
                  <div className="run-evidence-layout">
                    <RunTimeline
                      events={runTimelineEvents}
                      commandRuns={commandRuns}
                      automations={automationItemsForUi}
                      subagentRuns={subagentRuns}
                      browserVisits={browserVisits}
                      sessions={sessions}
                      selectedEventId={selectedRunEvent?.id || ""}
                      onSelectEvent={setSelectedRunEventId}
                      onCopy={onCopy}
                      onOpenWorkspaceFile={onOpenWorkspaceFile}
                      t={t}
                    />
                    <SelectedRunEvidencePanel
                      event={selectedRunEvent}
                      evidence={selectedRunEvidence}
                      recoveryActions={selectedRunRecoveryActions}
                      onCopy={onCopy}
                      onOpenWorkspaceFile={onOpenWorkspaceFile}
                      t={t}
                    />
                  </div>
                )}
                {workspaceCommandRuns.length > 0 && (
                  <div className="bottom-panel-stack command-evidence-stack workspace-command-evidence-stack">
                    <div className="command-evidence-note">{t.workspaceCommandBackedByStore}</div>
                    <CommandHistory
                      title={t.workspaceCommandEvidence}
                      entries={workspaceCommandRuns}
                      liveEntry={null}
                      onRetryEntry={onRetryWorkspaceCommand ? retryBottomWorkspaceEntry : null}
                      canRetryEntry={(entry) => Boolean(workspaceCommandFromRun(entry))}
                      retryDisabled={Boolean(bottomWorkspaceRetryingId)}
                      onOpenContextEntry={() => onActivateTool("terminal")}
                      canOpenContextEntry={(entry) => entry?.code !== 0 && !entry?.cancelled}
                      openContextLabel={t.openTerminalTool}
                      onClear={null}
                      t={t}
                    />
                  </div>
                )}
                {claudeCommandRuns.length > 0 && (
                  <div className="bottom-panel-stack command-evidence-stack claude-command-evidence-stack">
                    <div className="command-evidence-note">{t.claudeCommandBackedByStore}</div>
                    <CommandHistory
                      title={t.claudeCommandEvidence}
                      entries={claudeCommandRuns}
                      liveEntry={null}
                      onRetryEntry={onRetryClaudeCommand ? retryBottomClaudeEntry : null}
                      retryDisabled={Boolean(bottomClaudeRetryingId)}
                      onClear={null}
                      t={t}
                    />
                  </div>
                )}
                {capabilityCommandRuns.length > 0 && (
                  <div className="bottom-panel-stack command-evidence-stack capability-command-evidence-stack">
                    <div className="command-evidence-note">{t.capabilityCommandBackedByTimeline}</div>
                    <CommandHistory
                      title={t.capabilityCommandEvidence}
                      entries={capabilityCommandRuns}
                      liveEntry={null}
                      onRetryEntry={onRetryCapabilityCommand ? retryBottomCapabilityEntry : null}
                      canRetryEntry={(entry) => Boolean(capabilityRetryArgsFromRun(entry))}
                      retryDisabled={Boolean(bottomCapabilityRetryingId)}
                      onOpenContextEntry={() => onActivateTool("claude")}
                      canOpenContextEntry={(entry) => entry?.code !== 0 && !entry?.cancelled}
                      openContextLabel={t.openClaudePanel}
                      onClear={null}
                      t={t}
                    />
                  </div>
                )}
              </div>
            )}
            {bottomPanel === "notices" && (
              <NoticeCenter
                notices={notices}
                onDismiss={onDismissNotice}
                onClear={onClearNotices}
                onAction={handleNoticeAction}
                t={t}
              />
            )}
            {bottomPanel === "environment" && (
              <div className="bottom-panel-grid">
                <div>
                  <span>{t.environment}</span>
                  <strong>{projectLabel(activeProject, t)}</strong>
                  <p className={cx(projectPathMissing && "project-path-warning-inline")} title={projectPathMissing ? `${t.projectPathMissing}: ${activeProject?.path || ""}` : environment?.cwd || activeProject?.path || t.noProjectPath}>
                    {projectPathMissing ? t.projectPathMissingHint : activeProject?.path ? compactPath(activeProject.path, 78) : t.noProjectPath}
                  </p>
                </div>
                <div className="bottom-panel-actions">
                  <button type="button" className="plain-action subtle-action" onClick={onRefreshEnvironment}>
                    <RefreshCw size={14} />
                    {t.refresh}
                  </button>
                  <button type="button" className="plain-action subtle-action" onClick={onOpenIde}>
                    <Code2 size={14} />
                    {t.openIde}
                  </button>
                  <button type="button" className="plain-action subtle-action" onClick={() => onActivateTool("workspace")}>
                    <PanelRight size={14} />
                    {t.workspaceTool}
                  </button>
                </div>
                <dl>
                  <div><dt>{t.branch}</dt><dd>{branchLabel}</dd></div>
                  <div><dt>{t.upstream}</dt><dd>{upstreamLabel}</dd></div>
                  <div><dt>{t.changes}</dt><dd>{gitChangesLabel}</dd></div>
                  <div><dt>{t.gitRoot}</dt><dd title={gitRootPath || ""}>{gitRootPath ? gitRootLabel : t.gitUnavailable}</dd></div>
                  {gitRelativePath && gitRelativePath !== "." && <div><dt>{t.gitRelativePath}</dt><dd>{gitRelativeLabel}</dd></div>}
                  <div><dt>{t.openInIde}</dt><dd>{ideOptions?.map((item) => item.label).join(", ") || t.ideUnavailable}</dd></div>
                </dl>
              </div>
            )}
            {bottomPanel === "changes" && (
              <div className="bottom-panel-stack">
                <div className="bottom-panel-grid">
                  <div>
                    <span>{t.changes}</span>
                    <strong>{gitAvailable ? `${gitChangesLabel} · ${branchLabel}` : t.noGitProject}</strong>
                    <p title={gitRootPath || activeProject?.path || ""}>{gitAvailable ? `${upstreamLabel} · ${aheadBehindLabel} · ${t.gitRoot}: ${gitRootLabel}` : activeProject?.path ? compactPath(activeProject.path, 78) : t.noProjectPath}</p>
                  </div>
                  <div className="bottom-panel-actions">
                    <button type="button" className="plain-action subtle-action" onClick={onRefreshEnvironment}>
                      <RefreshCw size={14} />
                      {t.refresh}
                    </button>
                    <button type="button" className="plain-action subtle-action" onClick={() => onActivateTool("workspace")}>
                      <FileText size={14} />
                      {t.reviewChanges}
                    </button>
                    <button type="button" className="plain-action subtle-action" onClick={onOpenTerminal}>
                      <SquareTerminal size={14} />
                      {t.commitOrPush}
                    </button>
                  </div>
                </div>
                <section className="git-change-summary" aria-label={t.gitSummary}>
                  <div>
                    <span>{t.gitSummary}</span>
                    <small>{t.gitSummaryBackedByCli}</small>
                  </div>
                  <div className="git-change-summary-chips">
                    {gitSummaryItems.length > 0 ? gitSummaryItems.map(([label, count, kind]) => (
                      <em className={cx("git-summary-chip", kind)} key={label}>
                        {label} {count}
                      </em>
                    )) : (
                      <em className="git-summary-chip clean">{gitAvailable ? t.noGitDiff : t.gitUnavailable}</em>
                    )}
                  </div>
                </section>
                {latestGitActionEvent && (
                  <section className={cx("git-latest-action", latestGitActionEvent.status)} aria-label={t.recentGitAction}>
                    <div>
                      <span>{t.recentGitAction}</span>
                      <strong>{latestGitActionEvent.title || "Git"}</strong>
                      <p>{latestGitActionEvent.detail || t.gitActionEvidenceHint}</p>
                    </div>
                    <dl>
                      <div><dt>{t.scheduleStatus}</dt><dd>{runTimelineStatusLabel(latestGitActionEvent.status, t)}</dd></div>
                      <div><dt>{t.commandExit}</dt><dd>{typeof latestGitActionEvent.code === "number" ? latestGitActionEvent.code : typeof latestGitActionRun?.code === "number" ? latestGitActionRun.code : "-"}</dd></div>
                      <div><dt>{t.commandDuration}</dt><dd>{formatDurationMs(latestGitActionEvent.durationMs || latestGitActionRun?.durationMs)}</dd></div>
                    </dl>
                    {latestGitActionRun && (
                      <pre>{messageExcerpt(gitCommandOutput(latestGitActionRun) || latestGitActionRun.commandLine, 220)}</pre>
                    )}
                    <div className="git-latest-action-controls">
                      <button
                        type="button"
                        className="plain-action subtle-action"
                        data-git-action="open-timeline"
                        onClick={() => onOpenRunTimeline?.(latestGitActionEvent.id)}
                        title={t.openRunTimeline}
                      >
                        <FileText size={13} />
                        {t.openRunTimeline}
                      </button>
                    </div>
                  </section>
                )}
                <div className="git-evidence-layout">
                  <div className="git-evidence-main">
                    {gitFiles.length > 0 && (
                      <div className="git-change-list" aria-label={t.changes}>
                        <button
                          type="button"
                          className={cx("git-change-item", !selectedGitDiffPath && "selected")}
                          onClick={() => {
                            setSelectedGitDiffPath("");
                            setSelectedGitHunkId("");
                          }}
                          title={t.allChanges}
                        >
                          <span className="git-change-status">Σ</span>
                          <strong>{t.allChanges}</strong>
                        </button>
                        {gitFiles.slice(0, 12).map((item) => (
                          <button
                            type="button"
                            className={cx("git-change-item", item.kind && `kind-${item.kind}`, selectedGitDiffPath === item.path && "selected")}
                            key={`${item.status}-${item.path}`}
                            onClick={() => {
                              setSelectedGitDiffPath(item.path);
                              setSelectedGitHunkId("");
                            }}
                            title={item.previousPath ? `${item.previousPath} -> ${item.path}` : `${t.focusFileDiff}: ${item.path}`}
                          >
                            <span className="git-change-status">{item.status}</span>
                            <strong title={item.previousPath ? `${item.previousPath} -> ${item.path}` : item.path}>{item.path}</strong>
                            {(typeof item.additions === "number" || typeof item.deletions === "number") && (
                              <em>{`+${item.additions || 0} -${item.deletions || 0}`}</em>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    <pre className="git-status-preview git-stat-preview" aria-label={t.gitDiffStat}>{gitStat || t.noGitDiff}</pre>
                    <section className="git-diff-preview" aria-label={t.gitDiffPreview}>
                      <div className="git-diff-head">
                        <span>{selectedGitFileDiff ? `${t.focusedFileDiff}: ${selectedGitFileDiff.path}` : t.gitDiffPreview}</span>
                        {git?.diff?.truncated && <em>{t.gitDiffTruncated}</em>}
                      </div>
                      {gitDiffRows.length ? (
                        <div className="git-diff-lines" role="list">
                          {gitDiffRows.map((row) => (
                            <code className={cx("git-diff-row", row.type)} role="listitem" key={row.id}>
                              {row.text}
                            </code>
                          ))}
                        </div>
                      ) : (
                        <p className="empty-list">
                          {selectedGitDiffPath ? `${selectedGitDiffPath}: ${t.noGitDiff}` : t.noGitDiff}
                        </p>
                      )}
                    </section>
                    <details className="git-raw-status">
                      <summary>{t.gitRawStatus}</summary>
                      <pre className="git-status-preview">{rawGitStatus || t.noGitProject}</pre>
                    </details>
                  </div>
                  <section className={cx("git-selected-evidence-panel", selectedGitFile?.kind && `kind-${selectedGitFile.kind}`)} aria-label={t.gitEvidence}>
                    <div className="git-selected-evidence-head">
                      <div>
                        <span>{selectedGitFile ? t.gitFileEvidence : t.gitEvidence}</span>
                        <strong title={selectedGitDiffPath || t.allChanges}>{selectedGitDiffPath || t.allChanges}</strong>
                        <p>{t.gitEvidenceHint}</p>
                      </div>
                      <div className="git-selected-evidence-actions">
                        <button
                          type="button"
                          className="plain-action subtle-action"
                          data-git-action="copy-evidence"
                          onClick={copyGitEvidence}
                          title={copiedGitEvidence ? t.copied : t.copyGitEvidence}
                        >
                          {copiedGitEvidence ? <Check size={13} /> : <Copy size={13} />}
                          {copiedGitEvidence ? t.copied : t.copyGitEvidence}
                        </button>
                        {selectedGitFile && selectedGitCanStage && (
                          <button
                            type="button"
                            className="plain-action subtle-action"
                            onClick={() => runGitFileAction("stage", selectedGitFile)}
                            disabled={Boolean(gitActionWorkingPath)}
                            title={gitActionWorkingPath ? t.gitActionRunning : t.stageFile}
                          >
                            <GitBranch size={13} />
                            {selectedGitActionBusy ? t.gitActionRunning : t.stageFile}
                          </button>
                        )}
                        {selectedGitFile && selectedGitCanUnstage && (
                          <button
                            type="button"
                            className="plain-action subtle-action danger-inline-action"
                            onClick={() => runGitFileAction("unstage", selectedGitFile)}
                            disabled={Boolean(gitActionWorkingPath)}
                            title={gitActionWorkingPath ? t.gitActionRunning : t.unstageFile}
                          >
                            <X size={13} />
                            {selectedGitActionBusy ? t.gitActionRunning : t.unstageFile}
                          </button>
                        )}
                      </div>
                    </div>
                    <dl className="git-selected-evidence-meta">
                      <div><dt>{t.branch}</dt><dd>{branchLabel}</dd></div>
                      <div><dt>{t.upstream}</dt><dd>{upstreamLabel}</dd></div>
                      <div><dt>{t.remote}</dt><dd title={git?.remoteUrl || remoteLabel}>{remoteLabel}</dd></div>
                      <div><dt>{t.gitSyncStatus}</dt><dd>{aheadBehindLabel}</dd></div>
                      <div><dt>{t.scheduleStatus}</dt><dd>{selectedGitFile ? gitChangeKindLabel(selectedGitFile.kind, t) : t.allChanges}</dd></div>
                      <div><dt>{t.changedLines}</dt><dd>{selectedGitFile ? `+${selectedGitFile.additions || 0} -${selectedGitFile.deletions || 0}` : `${gitFiles.length}`}</dd></div>
                      <div><dt>{t.gitHunks}</dt><dd>{gitHunks.length}</dd></div>
                      {selectedGitHunk && <div><dt>{t.selectedHunk}</dt><dd>{`+${selectedGitHunk.additions || 0} -${selectedGitHunk.deletions || 0}`}</dd></div>}
                      <div><dt>{t.gitRawStatus}</dt><dd>{selectedGitFile?.status || "Σ"}</dd></div>
                      <div><dt>{t.gitRoot}</dt><dd title={gitRootPath || ""}>{gitRootPath ? gitRootLabel : t.gitUnavailable}</dd></div>
                      {gitRelativePath && gitRelativePath !== "." && <div><dt>{t.gitRelativePath}</dt><dd>{gitRelativeLabel}</dd></div>}
                      <div className="wide-evidence-row"><dt>{t.path}</dt><dd title={activeProject?.path || ""}>{selectedGitDiffPath || compactPath(activeProject?.path || t.noProjectPath, 88)}</dd></div>
                    </dl>
                    {gitHunks.length > 0 && (
                      <section className="git-hunk-review" aria-label={t.gitHunkReview}>
                        <div className="git-hunk-review-head">
                          <span>{t.gitHunkReview}</span>
                          <em>{`${gitHunks.length} ${t.gitHunks}`}</em>
                        </div>
                        <div className="git-hunk-list">
                          <button
                            type="button"
                            className={cx("git-hunk-item", !selectedGitHunkId && "selected")}
                            onClick={() => setSelectedGitHunkId("")}
                            title={t.allHunks}
                          >
                            <strong>{t.allHunks}</strong>
                            <span>{`+${gitHunks.reduce((sum, item) => sum + (item.additions || 0), 0)} -${gitHunks.reduce((sum, item) => sum + (item.deletions || 0), 0)}`}</span>
                          </button>
                          {gitHunks.slice(0, 16).map((hunk, index) => (
                            <button
                              type="button"
                              className={cx("git-hunk-item", selectedGitHunkId === hunk.id && "selected")}
                              onClick={() => setSelectedGitHunkId(hunk.id)}
                              title={`${t.focusHunk}: ${hunk.filePath || selectedGitDiffPath || t.allChanges}`}
                              key={hunk.id}
                            >
                              <strong>{`${index + 1}. ${hunk.header}`}</strong>
                              <small>{hunk.filePath || selectedGitDiffPath || t.allChanges}</small>
                              <span>{`+${hunk.additions || 0} -${hunk.deletions || 0}`}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}
                    {gitAvailable && (
                      <section className="git-repo-actions" aria-label={t.commitOrPush}>
                        <label>
                          <span>{t.gitCommitMessage}</span>
                          <input
                            type="text"
                            value={gitCommitMessage}
                            onChange={(event) => setGitCommitMessage(event.target.value)}
                            placeholder={gitStagedCount > 0 ? t.gitCommitPlaceholder : t.gitNoStagedChanges}
                            disabled={gitActionWorking}
                          />
                        </label>
                        <div className="git-repo-action-buttons">
                          <button
                            type="button"
                            className="plain-action subtle-action"
                            onClick={() => runGitRepoAction("commit")}
                            disabled={!gitCanCommit}
                            title={gitStagedCount > 0 ? t.commitStaged : t.gitNoStagedChanges}
                          >
                            <GitCommit size={13} />
                            {gitActionWorkingPath === "repo:commit" ? t.gitActionRunning : t.commitStaged}
                          </button>
                          <button
                            type="button"
                            className="plain-action subtle-action"
                            onClick={() => runGitRepoAction("push")}
                            disabled={!gitCanPush}
                            title={gitPushTitle}
                          >
                            <GitBranch size={13} />
                            {gitActionWorkingPath === "repo:push" ? t.gitActionRunning : t.pushBranch}
                          </button>
                        </div>
                        <p>{git?.upstream ? `${t.gitCommandHint} ${branchLabel} → ${upstreamLabel} · ${aheadBehindLabel}` : `${t.gitCommandHint} ${t.gitPushUnavailableNoUpstream}`}</p>
                      </section>
                    )}
                    <div className="git-selected-diff" aria-label={t.gitDiffPreview}>
                      <div className="git-diff-head">
                        <span>{t.gitDiffPreview}</span>
                        {git?.diff?.truncated && <em>{t.gitDiffTruncated}</em>}
                      </div>
                      {gitDiffRows.length ? (
                        <div className="git-diff-lines" role="list">
                          {gitDiffRows.slice(0, 220).map((row) => (
                            <code className={cx("git-diff-row", row.type)} role="listitem" key={`selected-${row.id}`}>
                              {row.text}
                            </code>
                          ))}
                        </div>
                      ) : (
                        <p className="empty-list">{t.noGitDiff}</p>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}
            {bottomPanel === "sources" && (
              <div className="bottom-panel-stack">
                <div className="bottom-panel-grid">
                  <div>
                    <span>{t.sources}</span>
                    <strong>{sourceRefs?.length ? t.sourceCount.replace("{count}", sourceRefs.length) : t.noSourcesYet}</strong>
                    <p title={activeProject?.path || t.noProjectPath}>
                      {sourceRefs?.length ? t.sourceBackedByWorkspace : activeProject?.path ? compactPath(activeProject.path, 78) : t.noProjectPath}
                    </p>
                  </div>
                  <div className="bottom-panel-actions">
                    <button type="button" className="plain-action subtle-action" onClick={() => onActivateTool("workspace")}>
                      <Folder size={14} />
                      {t.files}
                    </button>
                    <button type="button" className="plain-action subtle-action" onClick={onOpenProject} disabled={!activeProject?.path}>
                      <ExternalLink size={14} />
                      {t.openFolderShort}
                    </button>
                  </div>
                </div>
                {sourceRefs?.length ? (
                  <div className="source-ref-list">
                    {sourceRefs.slice(0, 12).map((source) => {
                      const sourceKey = sourceRefKey(source);
                      const selected = focusedSourceKey && [sourceKey, source.id, source.path].filter(Boolean).includes(focusedSourceKey);
                      return (
                        <article className={cx("source-ref-card", selected && "selected")} key={sourceKey || source.id || source.path}>
                          <FileText size={14} />
                          <div>
                            <strong title={source.path}>{source.path}</strong>
                            <span title={source.project?.path || ""}>{projectLabel(source.project, t)} · {formatBytes(source.size)} · {t.sourceLastOpened} {formatDate(source.lastOpenedAt)}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-panel compact-empty-panel">
                    <FileText size={20} />
                    <strong>{t.noSourcesYet}</strong>
                    <p>{t.sourceBackedByWorkspace}</p>
                  </div>
                )}
              </div>
            )}
            {bottomPanel === "subagents" && (
              <SubagentWorkbench
                runs={subagentRuns}
                automations={automationItemsForUi}
                sessions={sessions}
                activeProject={activeProject}
                onRunAutomationNow={onRunAutomationNow}
                onToggleAutomationEnabled={onToggleAutomationEnabled}
                onDeleteAutomation={onDeleteAutomation}
                onRunSubagent={onRunSubagent}
                onCancelSubagent={onCancelSubagent}
                onArchiveSubagent={onArchiveSubagent}
                onContinueSubagent={onContinueSubagent}
                onOpenRunTimeline={onOpenRunTimeline || ((eventId) => {
                  const focusedId = String(eventId || "").trim();
                  if (focusedId) setSelectedRunEventId(focusedId);
                  setBottomPanel("outputs");
                })}
                onCopy={onCopy}
                onOpenInteractiveClaude={onOpenInteractiveClaude}
                onOpenClaudePanel={() => onActivateTool("claude")}
                onOpenAutomation={onOpenAutomation}
                onOpenWorkspaceFile={onOpenWorkspaceFile}
                focus={taskCenterFocus}
                t={t}
              />
            )}
            {bottomPanel === "terminal" && (
              <div className="bottom-panel-grid">
                <div>
                  <span>{t.terminal}</span>
                  <strong>{projectLabel(activeProject, t)}</strong>
                  <p>{t.terminalPanelHint}</p>
                </div>
                <div className="bottom-panel-actions">
                  <button type="button" className="plain-action" onClick={onOpenTerminal}>
                    <SquareTerminal size={14} />
                    {t.openTerminal}
                  </button>
                  <button type="button" className="plain-action subtle-action" onClick={() => onActivateTool("terminal")}>
                    <PanelRight size={14} />
                    {t.openSidePanel}
                  </button>
                  <button type="button" className="plain-action subtle-action" onClick={onOpenProject} disabled={!activeProject?.path}>
                    <Folder size={14} />
                    {t.openFolderShort}
                  </button>
                </div>
              </div>
            )}
            {bottomPanel === "browser" && (
              <div className="bottom-panel-stack">
                <div className="bottom-panel-grid">
                  <div>
                    <span>{t.browser}</span>
                    <strong>{browserVisits?.length ? t.browserVisitCount.replace("{count}", browserVisits.length) : t.browserNoHistory}</strong>
                    <p>{browserVisits?.length ? t.browserBackedByWebview : t.browserPanelHint}</p>
                  </div>
                  <div className="bottom-panel-actions">
                    <button type="button" className="plain-action" onClick={() => onActivateTool("browser")}>
                      <Globe2 size={14} />
                      {t.openSidePanel}
                    </button>
                  </div>
                </div>
                <BrowserEvidenceList
                  visits={browserVisits}
                  focusedVisitKey={focusedBrowserVisitKey}
                  onOpenVisit={onOpenBrowserVisit}
                  onOpenExternalVisit={onOpenExternalBrowserVisit}
                  t={t}
                />
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function CommandOutputCard({
  commandLine,
  cwd,
  code,
  durationMs,
  stdout = "",
  stderr = "",
  live = false,
  cancelled = false,
  onRetry,
  retryDisabled = false,
  onOpenContext,
  openContextLabel = "",
  openContextDisabled = false,
  t,
}) {
  const [copied, setCopied] = useState(false);
  const statusClass = live ? "live" : cancelled ? "cancelled" : code === 0 ? "ok" : "error";
  const statusLabel = live ? t.commandRunning : cancelled ? t.commandCancelled : code === 0 ? t.commandSucceeded : t.commandFailed;
  const hasStdout = Boolean(String(stdout || "").trim());
  const hasStderr = Boolean(String(stderr || "").trim());
  const canRetry = Boolean(onRetry && !live && !cancelled && code !== 0);
  const clipboardText = [
    `$ ${commandLine || ""}`,
    cwd ? `${t.commandCwd}: ${cwd}` : "",
    !live ? `${t.commandExit}: ${code ?? ""}${typeof durationMs === "number" ? ` (${durationMs}ms)` : ""}` : "",
    "",
    stdout || "",
    stderr ? `[stderr]\n${stderr}` : "",
  ].filter((line, index) => index < 3 || line !== "").join("\n");

  async function copyOutput() {
    await navigator.clipboard?.writeText(clipboardText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className={cx("command-output-card", statusClass)} aria-live={live ? "polite" : undefined}>
      <div className="command-output-head">
        <div>
          <span>{live ? t.liveOutput : statusLabel}</span>
          <strong>{commandLine}</strong>
        </div>
        <div className="command-output-actions">
          {canRetry && (
            <button type="button" className="plain-action subtle-action command-output-retry" onClick={onRetry} disabled={retryDisabled} title={retryDisabled ? t.workingHint : t.retry}>
              <RefreshCw size={12} />
              {t.retry}
            </button>
          )}
          {onOpenContext && openContextLabel && (
            <button type="button" className="plain-action subtle-action command-output-context-action" onClick={onOpenContext} disabled={openContextDisabled} title={openContextDisabled ? t.workingHint : openContextLabel}>
              <PanelRight size={12} />
              {openContextLabel}
            </button>
          )}
          <button type="button" className="icon-only mini-icon" onClick={copyOutput} title={copied ? t.outputCopied : t.copyOutput} aria-label={copied ? t.outputCopied : t.copyOutput}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      </div>
      <dl className="command-output-meta">
        <div><dt>{t.commandCwd}</dt><dd title={cwd || ""}>{cwd ? compactPath(cwd, 48) : "-"}</dd></div>
        <div><dt>{t.commandExit}</dt><dd>{live ? t.commandRunning : code}</dd></div>
        <div><dt>{t.commandDuration}</dt><dd>{typeof durationMs === "number" ? `${durationMs}ms` : "-"}</dd></div>
      </dl>
      <div className="command-output-section">
        <div className="command-output-section-head">
          <span>{t.commandStdout}</span>
        </div>
        <pre>{hasStdout ? stdout : live ? t.runStreaming : t.noOutput}</pre>
      </div>
      {(hasStderr || live) && (
        <div className="command-output-section stderr">
          <div className="command-output-section-head">
            <span>{t.commandStderr}</span>
          </div>
          <pre>{hasStderr ? stderr : t.noOutput}</pre>
        </div>
      )}
    </section>
  );
}

function CommandHistory({
  title,
  liveEntry,
  entries,
  onClear,
  onRetryEntry,
  canRetryEntry,
  retryDisabled = false,
  onOpenContextEntry,
  canOpenContextEntry,
  openContextLabel = "",
  openContextDisabled = false,
  t,
}) {
  if (!liveEntry && !entries.length) return null;
  const summary = liveEntry ? t.runningNow : t.completedRuns.replace("{count}", entries.length);
  const retryPropsFor = (entry) => (onRetryEntry && entry?.code !== 0 && !entry?.cancelled && (!canRetryEntry || canRetryEntry(entry))
    ? { onRetry: () => onRetryEntry(entry), retryDisabled }
    : {});
  const openContextPropsFor = (entry) => (onOpenContextEntry && openContextLabel && (!canOpenContextEntry || canOpenContextEntry(entry))
    ? { onOpenContext: () => onOpenContextEntry(entry), openContextLabel, openContextDisabled }
    : {});

  return (
    <section className="command-history" aria-label={title}>
      <div className="command-history-head">
        <div>
          <span>{title}</span>
          <strong>{summary}</strong>
        </div>
        {entries.length > 0 && onClear && (
          <button type="button" className="plain-action subtle-action command-history-clear" onClick={onClear}>
            <X size={12} />
            {t.clearHistory}
          </button>
        )}
      </div>
      <div className="command-history-list">
        {liveEntry && <CommandOutputCard {...liveEntry} live t={t} />}
        {entries.map((entry, index) => (
          !liveEntry && index === 0 ? (
            <CommandOutputCard key={entry.id} {...entry} {...retryPropsFor(entry)} {...openContextPropsFor(entry)} t={t} />
          ) : (
            <details className={cx("command-history-item", entry.cancelled ? "cancelled" : entry.code === 0 ? "ok" : "error")} key={entry.id}>
              <summary>
                <span className="command-history-dot" />
                <strong title={entry.commandLine}>{entry.commandLine}</strong>
                <em>
                  {entry.cancelled ? t.commandCancelled : entry.code === 0 ? t.commandSucceeded : t.commandFailed}
                  {typeof entry.durationMs === "number" ? ` · ${entry.durationMs}ms` : ""}
                </em>
              </summary>
              <CommandOutputCard {...entry} {...retryPropsFor(entry)} {...openContextPropsFor(entry)} t={t} />
            </details>
          )
        ))}
      </div>
    </section>
  );
}

function SubagentWorkbench({
  runs = [],
  automations = [],
  sessions = [],
  activeProject,
  onRunAutomationNow,
  onToggleAutomationEnabled,
  onDeleteAutomation,
  onRunSubagent,
  onCancelSubagent,
  onArchiveSubagent,
  onContinueSubagent,
  onOpenRunTimeline,
  onOpenWorkspaceFile,
  onCopy,
  onOpenInteractiveClaude,
  onOpenClaudePanel,
  onOpenAutomation,
  focus,
  t,
}) {
  const [task, setTask] = useState("");
  const [nickname, setNickname] = useState("");
  const [running, setRunning] = useState(false);
  const [automationWorkingId, setAutomationWorkingId] = useState("");
  const [showArchivedRuns, setShowArchivedRuns] = useState(false);
  const [copiedAutomationRunId, setCopiedAutomationRunId] = useState("");
  const [copiedSubagentRunId, setCopiedSubagentRunId] = useState("");
  const taskInputRef = useRef(null);
  const activeRuns = runs.filter((run) => !run.archivedAt);
  const archivedRunCount = runs.length - activeRuns.length;
  const visibleRuns = showArchivedRuns ? runs : activeRuns;
  const focusedAutomationId = focus?.type === "automation" ? String(focus.id || "") : "";
  const focusedSubagentId = focus?.type === "subagent" ? String(focus.id || "") : "";
  const runCount = t.subagentCount.replace("{count}", visibleRuns.length);
  const automationItems = Array.isArray(automations) ? automations : [];
  const activeAutomationCount = automationItems.filter((item) => ["running", "scheduled"].includes(item.status)).length;
  const failedAutomationCount = automationItems.filter((item) => item.status === "failed" || item.lastRun?.status === "failed").length;
  const runningSubagentCount = activeRuns.filter((run) => run.status === "running").length;
  const failedSubagentCount = activeRuns.filter((run) => run.status === "error").length;
  const taskSummary = t.taskCenterSummary
    .replace("{automations}", automationItems.length)
    .replace("{subagents}", activeRuns.length);
  const taskStats = [
    { label: t.taskCenterTotal, value: automationItems.length + activeRuns.length },
    { label: t.taskCenterActive, value: activeAutomationCount + runningSubagentCount },
    { label: t.taskCenterFailed, value: failedAutomationCount + failedSubagentCount },
  ];

  async function submit(event) {
    event.preventDefault();
    if (!task.trim()) return;
    setRunning(true);
    try {
      await onRunSubagent?.(task.trim(), nickname.trim() || "Subagent");
      setTask("");
    } catch {
      // The parent action already displays a toast and run timeline entry.
    } finally {
      setRunning(false);
    }
  }

  async function handleAutomationAction(item, action) {
    if (!item?.id) return;
    setAutomationWorkingId(item.id);
    try {
      await action?.(item);
    } catch {
      // The parent action already displays a toast and timeline/notice entry.
    } finally {
      setAutomationWorkingId("");
    }
  }

  async function copySubagentEvidence(run) {
    const output = run?.summary || run?.stdout || run?.stderr || "";
    const artifacts = subagentArtifactsEvidenceText(run?.artifacts || [], t);
    const runId = String(run?.id || run?.requestId || "").trim();
    await onCopy?.([
      `${t.subagents}: ${run?.nickname || "Subagent"}`,
      `${t.subagentTask}: ${run?.task || ""}`,
      `${t.scheduleStatus}: ${subagentStatusLabel(run?.status, t)}`,
      `${t.subagentExitCode}: ${run?.code ?? ""}`,
      "",
      output,
      artifacts,
    ].filter((line, index) => index < 4 || line).join("\n"));
    if (runId) {
      setCopiedSubagentRunId(runId);
      window.setTimeout(() => setCopiedSubagentRunId((current) => (current === runId ? "" : current)), 1200);
    }
  }

  async function copySubagentArtifact(artifact, index) {
    await onCopy?.(subagentArtifactEvidenceText(artifact, index, t));
  }

  function openSubagentArtifact(run, artifact) {
    const artifactPath = subagentArtifactPathValue(artifact);
    if (!artifactPath) return;
    onOpenWorkspaceFile?.(artifactPath, {
      projectPath: run?.project?.path || run?.cwd || activeProject?.path || "",
      projectLabel: run?.project?.name || run?.nickname || t.subagents,
      force: true,
    });
  }

  async function copyAutomationEvidence(item, entry = item?.lastRun) {
    if (!entry) return;
    await onCopy?.(automationEvidenceText(item, entry, t, sessions));
    const runId = String(entry?.id || item?.id || "").trim();
    if (runId) {
      setCopiedAutomationRunId(runId);
      window.setTimeout(() => setCopiedAutomationRunId((current) => (current === runId ? "" : current)), 1200);
    }
  }

  useEffect(() => {
    if (!focusedSubagentId) return;
    const run = runs.find((item) => item?.id === focusedSubagentId || item?.requestId === focusedSubagentId);
    if (run?.archivedAt) setShowArchivedRuns(true);
  }, [focusedSubagentId, runs]);

  useEffect(() => {
    const id = focusedAutomationId || focusedSubagentId;
    if (!id) return undefined;
    const timer = window.setTimeout(() => {
      document.querySelector(".focused-task-card")?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusedAutomationId, focusedSubagentId, focus?.nonce, showArchivedRuns]);

  return (
    <div className="subagent-workbench">
      <div className="bottom-panel-grid subagent-workbench-head">
        <div>
          <span>{t.taskCenter}</span>
          <strong>{taskSummary}</strong>
          <p title={activeProject?.path || t.noProjectPath}>{t.taskCenterHint}</p>
        </div>
        <div className="bottom-panel-actions">
          <button type="button" className="plain-action subtle-action" onClick={onOpenInteractiveClaude}>
            <SquareTerminal size={14} />
            {t.interactiveClaude}
          </button>
          <button type="button" className="plain-action subtle-action" onClick={onOpenClaudePanel}>
            <Bot size={14} />
            {t.claudeCodeTool}
          </button>
        </div>
      </div>
      <section className="task-center-summary" aria-label={t.taskCenter}>
        {taskStats.map((item) => (
          <div className="task-center-stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>
      <section className="automation-task-section" aria-label={t.automationTasks}>
        <div className="task-section-head">
          <div>
            <span>{t.automationTasks}</span>
            <strong>{automationItems.length ? t.scheduleCount.replace("{count}", automationItems.length) : t.noAutomationTasks}</strong>
          </div>
        </div>
        {automationItems.length ? (
          <div className="automation-task-list">
            {automationItems.slice(0, 4).map((item) => {
              const isFocusedAutomation = focusedAutomationId === item.id;
              const openFocusedAutomationEvidence = Boolean(isFocusedAutomation && focus?.expandEvidence);
              const openFocusedAutomationHistory = Boolean(isFocusedAutomation && (focus?.expandHistory || focus?.expandEvidence));
              const lastRunDetail = item.lastRun?.error || item.lastRun?.detail || "";
              const history = Array.isArray(item.history) ? item.history.slice(0, 3) : [];
              const timing = item.lastRun?.endedAt
                ? `${t.automationLastRun}: ${formatDate(item.lastRun.endedAt)}`
                : item.nextRun
                  ? `${t.scheduleNextRun}: ${formatDate(item.nextRun)}`
                  : t.noAutomationHistory;
              return (
                <article
                  className={cx("automation-task-card", item.status || "idle", isFocusedAutomation && "focused-task-card")}
                  key={item.id}
                  data-automation-id={item.id}
                  aria-current={isFocusedAutomation ? "true" : undefined}
                >
                  <div className="automation-task-main">
                    <div className="schedule-item-title">
                      <strong>{messageExcerpt(item.prompt, 110)}</strong>
                      <span className={cx("automation-status-badge", item.status || "idle")}>
                        {automationStatusLabel(item.status, t)}
                      </span>
                    </div>
                    <div className="automation-task-meta">
                      <span title={item.project?.path || ""}>{automationProjectLabel(item, t)}</span>
                      <span>{automationThreadLabel(item, sessions, t)}</span>
                      <span>{automationScheduleTypeLabel(item.schedule?.type, t)}</span>
                      <span>{timing}</span>
                    </div>
                    {item.lastRun && (
                      <div className="automation-task-evidence-block">
                        <span>{t.automationEvidence}</span>
                        <dl className="automation-task-evidence" aria-label={t.automationEvidence}>
                          <div>
                            <dt>{t.scheduleStatus}</dt>
                            <dd>{automationStatusLabel(item.lastRun.status, t)}</dd>
                          </div>
                          <div>
                            <dt>{t.scheduleHistory}</dt>
                            <dd>{automationTriggerLabel(item.lastRun.trigger, t)}</dd>
                          </div>
                          <div>
                            <dt>{t.commandDuration}</dt>
                            <dd>{formatDurationMs(item.lastRun.durationMs)}</dd>
                          </div>
                          <div>
                            <dt>{t.commandExit}</dt>
                            <dd>{typeof item.lastRun.code === "number" ? item.lastRun.code : "-"}</dd>
                          </div>
                          <div>
                            <dt>{t.automationSession}</dt>
                            <dd title={item.lastRun.sessionId || item.threadId || ""}>{messageExcerpt(item.lastRun.sessionId || item.threadId || "-", 38)}</dd>
                          </div>
                        </dl>
                      </div>
                    )}
                    {lastRunDetail && <p className="automation-task-detail">{lastRunDetail}</p>}
                    {history.length > 0 && (
                      <details className="automation-task-history" open={openFocusedAutomationHistory || undefined}>
                        <summary>{t.automationRunHistoryShort}</summary>
                        <ul>
                          {history.map((entry) => (
                            <li key={entry.id} className={entry.status}>
                              <span>{automationStatusLabel(entry.status, t)}</span>
                              <time>{formatDate(entry.endedAt || entry.startedAt)}</time>
                              <em>{automationTriggerLabel(entry.trigger, t)}</em>
                              <em>{typeof entry.code === "number" ? `${t.commandExit}: ${entry.code}` : t.commandExit}</em>
                              <div className="automation-history-actions">
                                <button
                                  type="button"
                                  className="plain-action subtle-action"
                                  data-automation-history-action="copy"
                                  onClick={() => copyAutomationEvidence(item, entry)}
                                  title={t.copyAutomationEvidence}
                                >
                                  {copiedAutomationRunId === entry.id ? <Check size={12} /> : <Copy size={12} />}
                                  {copiedAutomationRunId === entry.id ? t.copied : t.copyAutomationEvidence}
                                </button>
                                {entry.id && (
                                  <button
                                    type="button"
                                    className="plain-action subtle-action"
                                    data-automation-history-action="timeline"
                                    onClick={() => onOpenRunTimeline?.(entry.id)}
                                    title={t.openRunTimeline}
                                  >
                                    <FileText size={12} />
                                    {t.openRunTimeline}
                                  </button>
                                )}
                              </div>
                              {(entry.detail || entry.error || entry.summary) && <p>{messageExcerpt(entry.detail || entry.error || entry.summary, 110)}</p>}
                              {(entry.stdout || entry.stderr || entry.sessionId || typeof entry.code === "number") && (
                                <details className="automation-run-evidence-details" open={openFocusedAutomationEvidence || undefined}>
                                  <summary>{t.automationRawEvidence}</summary>
                                  <dl className="automation-run-evidence-meta">
                                    <div><dt>{t.automationSession}</dt><dd>{entry.sessionId || "-"}</dd></div>
                                    <div><dt>{t.commandExit}</dt><dd>{typeof entry.code === "number" ? entry.code : "-"}</dd></div>
                                    <div><dt>{t.commandDuration}</dt><dd>{formatDurationMs(entry.durationMs)}</dd></div>
                                  </dl>
                                  {entry.stdout && (
                                    <section>
                                      <span>{t.automationStdout}</span>
                                      <pre className="subagent-output secondary-output">{entry.stdout}</pre>
                                    </section>
                                  )}
                                  {entry.stderr && (
                                    <section>
                                      <span>{t.automationStderr}</span>
                                      <pre className="subagent-output secondary-output error-output">{entry.stderr}</pre>
                                    </section>
                                  )}
                                </details>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <div className="automation-task-actions">
                      <button
                        type="button"
                        className="plain-action subtle-action"
                        onClick={() => handleAutomationAction(item, onRunAutomationNow)}
                        disabled={automationWorkingId === item.id || item.status === "running"}
                        title={t.runNow}
                      >
                        <Send size={13} />
                        {automationWorkingId === item.id ? t.automationRunning : t.runNow}
                      </button>
                      {item.lastRun && (
                        <button
                          type="button"
                          className="plain-action subtle-action"
                          data-automation-task-action="copy-evidence"
                          onClick={() => copyAutomationEvidence(item)}
                          title={copiedAutomationRunId === item.lastRun.id ? t.copied : t.copyAutomationEvidence}
                        >
                          {copiedAutomationRunId === item.lastRun.id ? <Check size={13} /> : <Copy size={13} />}
                          {copiedAutomationRunId === item.lastRun.id ? t.copied : t.copyAutomationEvidence}
                        </button>
                      )}
                      {item.lastRun?.id && (
                        <button
                          type="button"
                          className="plain-action subtle-action"
                          onClick={() => onOpenRunTimeline?.(item.lastRun.id)}
                          title={t.openRunTimeline}
                        >
                          <FileText size={13} />
                          {t.openRunTimeline}
                        </button>
                      )}
                      <button
                        type="button"
                        className="plain-action subtle-action"
                        onClick={() => handleAutomationAction(item, () => onToggleAutomationEnabled?.(item, !item.enabled))}
                        disabled={!item.schedule?.runAt || automationWorkingId === item.id || item.status === "running"}
                        title={item.enabled ? t.pauseAutomation : t.resumeAutomation}
                      >
                        <Clock3 size={13} />
                        {item.enabled ? t.pauseAutomation : t.resumeAutomation}
                      </button>
                      <button
                        type="button"
                        className="plain-action subtle-action danger-inline-action"
                        onClick={() => handleAutomationAction(item, onDeleteAutomation)}
                        disabled={automationWorkingId === item.id}
                        title={t.delete}
                      >
                        <Trash2 size={13} />
                        {t.delete}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-panel compact-empty-panel">
            <Clock3 size={20} />
            <strong>{t.noAutomationTasks}</strong>
            <p>{t.emptyScheduleHint}</p>
            <div className="empty-panel-actions">
              <button type="button" className="plain-action subtle-action" onClick={onOpenAutomation}>
                <Clock3 size={13} />
                {t.scheduled}
              </button>
              <button type="button" className="plain-action subtle-action" onClick={onOpenClaudePanel}>
                <Bot size={13} />
                {t.claudeCodeTool}
              </button>
            </div>
          </div>
        )}
      </section>
      <form className="subagent-form" onSubmit={submit}>
        <label>
          <span>{t.subagentTask}</span>
          <textarea ref={taskInputRef} value={task} onChange={(event) => setTask(event.target.value)} placeholder={t.subagentTaskPlaceholder} />
        </label>
        <label>
          <span>{t.subagentNickname}</span>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder={t.subagentNicknamePlaceholder} />
        </label>
        <button type="submit" className="primary-action" disabled={!task.trim() || running}>
          <Bot size={15} />
          {running ? t.commandRunning : t.runSubagent}
        </button>
      </form>
      <div className="task-section-head">
        <div>
          <span>{t.subagents}</span>
          <strong>{visibleRuns.length ? runCount : t.noSubagentsYet}</strong>
        </div>
        {archivedRunCount > 0 && (
          <button type="button" className="plain-action subtle-action" onClick={() => setShowArchivedRuns((current) => !current)}>
            <Archive size={13} />
            {showArchivedRuns ? t.hideArchivedSubagents : `${t.showArchivedSubagents} ${archivedRunCount}`}
          </button>
        )}
      </div>
      <div className="subagent-run-list">
        {visibleRuns.map((run) => {
          const isFocusedRun = focusedSubagentId === run.id || focusedSubagentId === run.requestId;
          const openFocusedEvidence = Boolean(isFocusedRun && focus?.expandEvidence);
          const openFocusedArtifacts = Boolean(isFocusedRun && focus?.expandArtifacts);
          return (
          <article
            className={cx("subagent-run-card", run.status, run.archivedAt && "archived", isFocusedRun && "focused-task-card")}
            key={run.id}
            data-subagent-run-id={run.id}
            data-subagent-request-id={run.requestId || ""}
            aria-current={isFocusedRun ? "true" : undefined}
          >
            <div className="subagent-run-head">
              <div>
                <strong>{run.nickname || "Subagent"}</strong>
                <span title={run.cwd || run.project?.path || ""}>{run.cwd ? compactPath(run.cwd, 72) : projectLabel(run.project, t)}</span>
              </div>
              <span className={cx("subagent-status-badge", run.status)}>{subagentStatusLabel(run.status, t)}</span>
            </div>
            <p className="subagent-task-text">{run.task}</p>
            {(run.summary || run.stdout || run.stderr || run.artifacts?.length) && (
              <div className="subagent-evidence-stack" aria-label={t.subagentEvidence}>
                {run.summary && (
                  <pre className="subagent-output">{run.summary}</pre>
                )}
                {(run.stdout || run.stderr || typeof run.code === "number") && (
                  <details className="subagent-evidence-details" open={openFocusedEvidence || undefined}>
                    <summary>{t.subagentEvidence}</summary>
                    <dl className="subagent-evidence-meta">
                      <div><dt>{t.activeProject}</dt><dd title={run.project?.path || run.cwd || ""}>{projectLabel(run.project, t)}</dd></div>
                      <div><dt>{t.subagentSession}</dt><dd>{run.sessionId || "-"}</dd></div>
                      <div><dt>{t.subagentExitCode}</dt><dd>{run.code ?? "-"}</dd></div>
                      <div><dt>{t.commandDuration}</dt><dd>{formatDurationMs(run.durationMs)}</dd></div>
                      <div className="wide-evidence-row"><dt>{t.subagentCommand}</dt><dd title={subagentCommandLine(run)}>{messageExcerpt(subagentCommandLine(run), 120) || "-"}</dd></div>
                    </dl>
                    {run.stdout && (
                      <section>
                        <span>{t.subagentStdout}</span>
                        <pre className="subagent-output secondary-output">{run.stdout}</pre>
                      </section>
                    )}
                    {run.stderr && (
                      <section>
                        <span>{t.subagentStderr}</span>
                        <pre className="subagent-output secondary-output error-output">{run.stderr}</pre>
                      </section>
                    )}
                  </details>
                )}
                {run.artifacts?.length > 0 && (
                  <details className="subagent-evidence-details" open={openFocusedArtifacts || undefined}>
                    <summary>{t.subagentArtifacts}: {run.artifacts.length}</summary>
                    <div className="subagent-artifact-list">
                      {run.artifacts.map((artifact, index) => {
                        const label = subagentArtifactLabel(artifact, index, t);
                        const content = subagentArtifactContent(artifact);
                        const openable = isOpenableSubagentArtifact(artifact);
                        return (
                          <article
                            className="subagent-artifact-item"
                            key={`${label}-${index}`}
                            data-subagent-artifact-index={index}
                          >
                            <div className="subagent-artifact-head">
                              <code title={artifact?.path || artifact?.type || label}>{label}</code>
                              <div className="subagent-artifact-actions">
                                {openable && (
                                  <button
                                    type="button"
                                    className="plain-action subtle-action"
                                    data-subagent-artifact-open={index}
                                    onClick={() => openSubagentArtifact(run, artifact)}
                                    title={t.openSubagentArtifact}
                                  >
                                    <FileText size={12} />
                                    {t.openSubagentArtifact}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="plain-action subtle-action"
                                  data-subagent-artifact-copy={index}
                                  onClick={() => copySubagentArtifact(artifact, index)}
                                  title={t.copySubagentArtifact}
                                >
                                  <Copy size={12} />
                                  {t.copySubagentArtifact}
                                </button>
                              </div>
                            </div>
                            {artifact?.path && <small title={artifact.path}>{artifact.path}</small>}
                            {content ? (
                              <pre className="subagent-output secondary-output">{content}</pre>
                            ) : (
                              <p className="empty-list">{t.noSubagentArtifacts}</p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            )}
            <div className="subagent-run-foot">
              <span>{formatDate(run.endedAt || run.startedAt)}</span>
              {typeof run.durationMs === "number" && run.durationMs > 0 && <span>{formatDurationMs(run.durationMs)}</span>}
              <span>{t.subagentArtifacts}: {run.artifacts?.length || 0}</span>
              {run.continuedAt && <span>{t.subagentContinuedShort}: {formatDate(run.continuedAt)}</span>}
              <button type="button" className="plain-action subtle-action" data-subagent-run-action="copy-evidence" onClick={() => copySubagentEvidence(run)} title={copiedSubagentRunId === run.id ? t.copiedSubagentEvidence : t.copySubagentEvidence}>
                {copiedSubagentRunId === run.id ? <Check size={13} /> : <Copy size={13} />}
                {copiedSubagentRunId === run.id ? t.copiedSubagentEvidence : t.copySubagentEvidence}
              </button>
              <button type="button" className="plain-action subtle-action" onClick={() => onOpenRunTimeline?.(run.requestId || run.id)} title={t.openRunTimeline}>
                <FileText size={13} />
                {t.openRunTimeline}
              </button>
              {run.status !== "running" && (
                <>
                  <button type="button" className="plain-action subtle-action" onClick={() => onContinueSubagent?.(run)} disabled={Boolean(run.continuedAt)}>
                    <MessageSquarePlus size={13} />
                    {run.continuedAt ? t.subagentContinuedShort : t.continueSubagent}
                  </button>
                  <button
                    type="button"
                    className="plain-action subtle-action"
                    onClick={() => onRunSubagent?.(run.task, run.nickname || "Subagent", {
                      projectPath: run.project?.path || run.cwd || "",
                      sessionId: run.sessionId || "",
                    })}
                  >
                    <RefreshCw size={13} />
                    {t.retrySubagent}
                  </button>
                  <button type="button" className="plain-action subtle-action" onClick={() => onArchiveSubagent?.(run, !run.archivedAt)}>
                    <Archive size={13} />
                    {run.archivedAt ? t.restoreSubagent : t.archiveSubagent}
                  </button>
                </>
              )}
              {run.status === "running" && (
                <button type="button" className="plain-action subtle-action" onClick={() => onCancelSubagent?.(run)}>
                  <X size={13} />
                  {t.cancelSubagent}
                </button>
              )}
            </div>
          </article>
          );
        })}
        {!visibleRuns.length && (
          <div className="empty-panel">
            <Bot size={20} />
            <strong>{t.noSubagentsYet}</strong>
            <p>{t.subagentWorkbenchHint}</p>
            <div className="empty-panel-actions">
              <button type="button" className="plain-action subtle-action" onClick={() => taskInputRef.current?.focus()}>
                <Bot size={13} />
                {t.runSubagent}
              </button>
              <button type="button" className="plain-action subtle-action" onClick={onOpenInteractiveClaude}>
                <SquareTerminal size={13} />
                {t.interactiveClaude}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BrowserEvidenceList({ visits = [], focusedVisitKey = "", onOpenVisit, onOpenExternalVisit, t }) {
  const [copiedVisitId, setCopiedVisitId] = useState("");

  async function copyVisitEvidence(visit) {
    const key = visit?.id || visit?.url || "";
    try {
      await navigator.clipboard?.writeText(browserVisitEvidenceText(visit, t));
    } catch {
      // Clipboard permissions vary; the visible feedback still records the copy intent.
    }
    setCopiedVisitId(key);
    window.setTimeout(() => setCopiedVisitId((current) => (current === key ? "" : current)), 1200);
  }

  if (!visits?.length) {
    return (
      <div className="empty-panel compact-empty-panel">
        <Globe2 size={20} />
        <strong>{t.browserNoHistory}</strong>
        <p>{t.browserBackedByWebview}</p>
      </div>
    );
  }
  return (
    <div className="browser-evidence-list" aria-label={t.browserEvidence}>
      {visits.slice(0, 10).map((visit) => {
        const visitKey = visit.id || visit.url;
        const selected = focusedVisitKey && [browserVisitKey(visit), visit.id, visit.url, browserVisitFinalUrl(visit)].filter(Boolean).includes(focusedVisitKey);
        const metadataRows = browserVisitMetadataRows(visit, t);
        const recoveryUrl = browserVisitFinalUrl(visit) || visit.url;
        const isErrorVisit = visit.status === "error";
        return (
          <article className={cx("browser-evidence-card", visit.status, selected && "selected")} key={visitKey}>
            <Globe2 size={14} />
            <div>
              <strong title={browserVisitFinalUrl(visit)}>{browserVisitFinalUrl(visit) || visit.url}</strong>
              {visit.title && <small title={visit.title}>{visit.title}</small>}
              <span>
                {browserStatusLabel(visit.status, t)}
                {visit.error ? ` · ${visit.error}` : ""}
                {Number.isFinite(Number(visit.errorCode)) ? ` · ${t.browserErrorCode} ${visit.errorCode}` : ""}
                {visit.isMainFrame ? ` · ${t.browserMainFrame}` : ""}
                {visit.lastEventAt ? ` · ${formatDate(visit.lastEventAt)}` : ""}
              </span>
              {metadataRows.length > 0 && (
                <dl className="browser-evidence-meta" data-browser-evidence-meta="">
                  {metadataRows.map(([label, value]) => (
                    <div key={`${visitKey}-${label}`}>
                      <dt>{label}</dt>
                      <dd title={value}>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {visit.excerpt && <p title={visit.excerpt}>{visit.excerpt}</p>}
              <div className="browser-evidence-actions">
                <button
                  type="button"
                  className="plain-action subtle-action"
                  data-browser-visit-action="copy"
                  onClick={() => copyVisitEvidence(visit)}
                  title={t.copyBrowserEvidence}
                >
                  <Copy size={13} />
                  {copiedVisitId === visitKey ? t.copiedBrowserEvidence : t.copyBrowserEvidence}
                </button>
                {onOpenVisit && recoveryUrl && (
                  <button
                    type="button"
                    className="plain-action subtle-action"
                    data-browser-visit-action={isErrorVisit ? "retry" : "open"}
                    onClick={() => onOpenVisit(visit)}
                    title={recoveryUrl}
                  >
                    {isErrorVisit ? <RefreshCw size={13} /> : <Globe2 size={13} />}
                    {isErrorVisit ? t.retry : t.reopenBrowserVisit}
                  </button>
                )}
                {onOpenExternalVisit && recoveryUrl && (
                  <button
                    type="button"
                    className="plain-action subtle-action"
                    data-browser-visit-action="external"
                    onClick={() => onOpenExternalVisit(visit)}
                    title={recoveryUrl}
                  >
                    <ExternalLink size={13} />
                    {t.openExternal}
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function NoticeCenter({ notices = [], onDismiss, onClear, onAction, t }) {
  const active = notices.filter((notice) => !notice.dismissedAt);
  const visible = notices.slice(0, 18);
  return (
    <div className="bottom-panel-stack notice-center">
      <div className="bottom-panel-grid">
        <div>
          <span>{t.noticeCenter}</span>
          <strong>{active.length ? t.noticeCount.replace("{count}", active.length) : t.noticeNoActive}</strong>
          <p>{t.noticeBackedByLocalState}</p>
        </div>
        <div className="bottom-panel-actions">
          <button type="button" className="plain-action subtle-action" onClick={onClear} disabled={!active.length}>
            <Check size={14} />
            {t.noticeClearAll}
          </button>
        </div>
      </div>
      {visible.length ? (
        <div className="notice-list" aria-label={t.noticeCenter}>
          {visible.map((notice) => (
            <article className={cx("notice-card", notice.level, notice.dismissedAt && "dismissed")} key={notice.id}>
              <AlertTriangle size={15} />
              <div>
                <div className="notice-card-head">
                  <strong>{notice.title}</strong>
                  <span>{noticeLevelLabel(notice.level, t)}{notice.count > 1 ? ` ×${notice.count}` : ""}</span>
                </div>
                {notice.detail && <p>{notice.detail}</p>}
                <small title={notice.project?.path || ""}>
                  {[notice.source || t.noticeSource, projectLabel(notice.project, t), formatDate(notice.lastSeenAt || notice.createdAt)].filter(Boolean).join(" · ")}
                </small>
              </div>
              {!notice.dismissedAt && (
                <div className="notice-card-actions">
                  {notice.action && (
                    <button type="button" className="plain-action subtle-action" data-notice-action="open" onClick={() => onAction?.(notice)}>
                      <PanelRight size={13} />
                      {t.noticeOpenAction || t.runtimeHealthOpenTarget}
                    </button>
                  )}
                  <button type="button" className="plain-action subtle-action" data-notice-action="dismiss" onClick={() => onDismiss?.(notice)}>
                    {t.noticeDismiss}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel compact-empty-panel">
          <AlertTriangle size={20} />
          <strong>{t.noticeNoHistory}</strong>
          <p>{t.noticeBackedByLocalState}</p>
        </div>
      )}
    </div>
  );
}

function RunEvidenceDetails({ event, evidence, onCopy, onOpenWorkspaceFile, t, pinned = false }) {
  const hasRawEvidence = runTimelineHasEvidence(evidence);
  const typeRaw = runTimelineTypeRaw(event, evidence);
  const typeLabel = runTimelineTypeLabel(event, evidence, t);
  const primaryOutputLabel = evidence?.source === "browser" ? t.browserEvidence : t.commandStdout;
  const secondaryOutputLabel = evidence?.source === "browser" ? t.requestError : t.commandStderr;
  const [copiedRunEvidence, setCopiedRunEvidence] = useState(false);
  const copiedRunEvidenceTimer = useRef(null);
  useEffect(() => () => {
    if (copiedRunEvidenceTimer.current) window.clearTimeout(copiedRunEvidenceTimer.current);
  }, []);
  useEffect(() => {
    setCopiedRunEvidence(false);
  }, [event?.id]);
  async function copyRunArtifact(artifact, index) {
    await onCopy?.(subagentArtifactEvidenceText(artifact, index, t));
  }
  function openRunArtifact(artifact) {
    const artifactPath = subagentArtifactPathValue(artifact);
    if (!artifactPath) return;
    onOpenWorkspaceFile?.(artifactPath, {
      projectPath: evidence?.cwd || "",
      projectLabel: evidence?.project || t.subagents,
      force: true,
    });
  }
  async function copyRunEvidence() {
    await onCopy?.(runTimelineEvidenceText(event, evidence, t));
    setCopiedRunEvidence(true);
    if (copiedRunEvidenceTimer.current) window.clearTimeout(copiedRunEvidenceTimer.current);
    copiedRunEvidenceTimer.current = window.setTimeout(() => setCopiedRunEvidence(false), 1200);
  }

  return (
    <div className={cx("run-timeline-evidence", pinned && "pinned-run-evidence-body")} aria-label={t.timelineEvidence}>
      {hasRawEvidence ? (
        <>
          <dl className="run-timeline-evidence-meta">
            <div>
              <dt>{t.timelineEventType}</dt>
              <dd data-run-event-type={typeRaw} title={typeRaw}>
                <span>{typeLabel}</span>
                {typeRaw !== typeLabel && <code className="run-timeline-type-raw">{typeRaw}</code>}
              </dd>
            </div>
            <div><dt>{t.scheduleStatus}</dt><dd>{runTimelineStatusLabel(event?.status || evidence.status, t)}</dd></div>
            <div><dt>{t.activeProject}</dt><dd title={evidence.cwd || ""}>{evidence.project || "-"}</dd></div>
            <div><dt>{t.automationSession}</dt><dd>{evidence.sessionId || "-"}</dd></div>
            <div><dt>{t.commandExit}</dt><dd>{typeof evidence.code === "number" ? evidence.code : "-"}</dd></div>
            <div><dt>{t.commandDuration}</dt><dd>{formatDurationMs(evidence.durationMs)}</dd></div>
            {evidence.commandLine && (
              <div className="wide-evidence-row"><dt>{t.commandLine}</dt><dd title={evidence.commandLine}>{messageExcerpt(evidence.commandLine, 120)}</dd></div>
            )}
            {evidence.cwd && (
              <div className="wide-evidence-row"><dt>{t.commandCwd}</dt><dd title={evidence.cwd}>{compactPath(evidence.cwd, 90)}</dd></div>
            )}
          </dl>
          {(evidence.summary || evidence.detail) && <p className="run-timeline-summary">{evidence.summary || evidence.detail}</p>}
          {evidence.stdout && (
            <section>
              <span>{primaryOutputLabel}</span>
              <pre className="subagent-output secondary-output">{evidence.stdout}</pre>
            </section>
          )}
          {evidence.stderr && (
            <section>
              <span>{secondaryOutputLabel}</span>
              <pre className="subagent-output secondary-output error-output">{evidence.stderr}</pre>
            </section>
          )}
          {evidence.artifacts?.length > 0 && (
            <div className="run-timeline-artifacts">
              <span>{t.subagentArtifacts}</span>
              <div className="subagent-artifact-list run-timeline-artifact-list">
                {evidence.artifacts.map((artifact, index) => {
                  const label = subagentArtifactLabel(artifact, index, t);
                  const content = subagentArtifactContent(artifact);
                  const openable = isOpenableSubagentArtifact(artifact);
                  return (
                    <article
                      className="subagent-artifact-item"
                      key={`${label}-${index}`}
                      data-run-timeline-artifact-index={index}
                    >
                      <div className="subagent-artifact-head">
                        <code title={artifact?.path || artifact?.type || label}>{label}</code>
                        <div className="subagent-artifact-actions">
                          {openable && (
                            <button
                              type="button"
                              className="plain-action subtle-action"
                              data-run-timeline-artifact-open={index}
                              onClick={() => openRunArtifact(artifact)}
                              title={t.openSubagentArtifact}
                            >
                              <FileText size={12} />
                              {t.openSubagentArtifact}
                            </button>
                          )}
                          <button
                            type="button"
                            className="plain-action subtle-action"
                            data-run-timeline-artifact-copy={index}
                            onClick={() => copyRunArtifact(artifact, index)}
                            title={t.copySubagentArtifact}
                          >
                            <Copy size={12} />
                            {t.copySubagentArtifact}
                          </button>
                        </div>
                      </div>
                      {artifact?.path && <small title={artifact.path}>{artifact.path}</small>}
                      {content ? (
                        <pre className="subagent-output secondary-output">{content}</pre>
                      ) : (
                        <p className="empty-list">{t.noSubagentArtifacts}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
          <div className="run-timeline-actions">
            <button
              type="button"
              className="plain-action subtle-action"
              data-run-timeline-action="copy-evidence"
              onClick={copyRunEvidence}
              title={copiedRunEvidence ? t.copied : t.copyAutomationEvidence}
            >
              {copiedRunEvidence ? <Check size={13} /> : <Copy size={13} />}
              {copiedRunEvidence ? t.copied : t.copyAutomationEvidence}
            </button>
          </div>
        </>
      ) : (
        <p className="run-timeline-empty">{t.timelineEvidenceEmpty}</p>
      )}
    </div>
  );
}

function SelectedRunEvidencePanel({ event, evidence, recoveryActions = [], onCopy, onOpenWorkspaceFile, t }) {
  if (!event || !evidence) return null;
  return (
    <section className={cx("selected-run-evidence-panel", event.status)} aria-label={t.selectedRunEvidence}>
      <div className="selected-run-evidence-head">
        <div>
          <span>{t.selectedRunEvidence}</span>
          <strong>{event.title || evidence.title || t.outputs}</strong>
          <p>{t.selectedRunEvidenceHint}</p>
        </div>
        <div className="selected-run-evidence-side">
          <time>{formatDate(event.createdAt)}</time>
          {recoveryActions.length > 0 && (
            <div className="selected-run-recovery-actions" aria-label={t.errorActions}>
              {recoveryActions.map((action) => {
                const Icon = action.icon || FileText;
                return (
                  <button
                    type="button"
                    className="plain-action subtle-action"
                    data-run-recovery-action={action.key}
                    key={action.key}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    title={action.label}
                  >
                    <Icon size={12} />
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <RunEvidenceDetails event={event} evidence={evidence} onCopy={onCopy} onOpenWorkspaceFile={onOpenWorkspaceFile} t={t} pinned />
    </section>
  );
}

function RunTimeline({
  events = [],
  commandRuns = [],
  automations = [],
  subagentRuns = [],
  browserVisits = [],
  sessions = [],
  selectedEventId = "",
  onSelectEvent,
  onCopy,
  onOpenWorkspaceFile,
  t,
}) {
  if (!events.length) return null;
  return (
    <section className="run-timeline" aria-label={t.outputs}>
      <div className="run-timeline-head">
        <span>{t.outputs}</span>
        <strong>{events.length}</strong>
      </div>
      <div className="run-timeline-list">
        {events.map((event) => {
          const evidence = runTimelineEvidenceForEvent(event, { commandRuns, automations, subagentRuns, browserVisits, sessions, t });
          const typeRaw = runTimelineTypeRaw(event, evidence);
          const typeLabel = runTimelineTypeLabel(event, evidence, t);
          return (
            <details className={cx("run-timeline-row", event.status, selectedEventId === event.id && "selected")} key={event.id}>
              <summary onClick={() => onSelectEvent?.(event.id)}>
                <span className="run-timeline-dot" />
                <div className="run-timeline-main">
                  <div className="run-timeline-title-row">
                    <strong>{event.title}</strong>
                    <span className="run-timeline-type-pill" data-run-event-type={typeRaw} title={typeRaw}>{typeLabel}</span>
                  </div>
                  {event.detail && <p>{event.detail}</p>}
                </div>
                <time>{formatDate(event.createdAt)}</time>
              </summary>
              <RunEvidenceDetails event={event} evidence={evidence} onCopy={onCopy} onOpenWorkspaceFile={onOpenWorkspaceFile} t={t} />
            </details>
          );
        })}
      </div>
    </section>
  );
}

function EnvironmentOverview({
  environment,
  activeProject,
  subagentRuns = [],
  sourceRefs = [],
  ideOptions,
  selectedIdeId,
  setSelectedIdeId,
  onOpenIde,
  onRefreshEnvironment,
  onOpenBottomPanel,
  t,
}) {
  const git = environment?.git;
  const selectedIde = ideOptions?.find((option) => option.id === selectedIdeId) || ideOptions?.[0];
  const upstreamLabel = git?.upstream || t.noGitUpstream;
  const syncLabel = gitAheadBehindLabel(git, t);
  const projectMissing = Boolean(activeProject?.path && environment?.projectMissing);
  const gitRootPath = String(git?.root || "").trim();
  const gitRootLabel = gitRootPath ? compactPath(gitRootPath, 28) : t.gitUnavailable;
  const gitRelativePath = String(git?.relativePath || "").trim();
  const gitRelativeLabel = gitRelativePath && gitRelativePath !== "." ? gitRelativePath : t.activeProject;
  const activeKey = String(activeProject?.path || activeProject?.name || "").trim().toLowerCase();
  const matchesActiveProject = (project = {}) => {
    const itemKey = String(project?.path || project?.name || "").trim().toLowerCase();
    return !activeKey || !itemKey || itemKey === activeKey;
  };
  const projectSubagents = (subagentRuns || [])
    .filter((run) => !run.archivedAt && matchesActiveProject(run.project))
    .slice(0, 3);
  const projectSources = (sourceRefs || [])
    .filter((source) => matchesActiveProject(source.project))
    .slice(0, 3);
  return (
    <section className="environment-card" aria-label={t.environment}>
      <div className="environment-card-head">
        <div>
          <span>{t.environment}</span>
          <strong>{projectLabel(activeProject, t)}</strong>
        </div>
        <button type="button" className="icon-only mini-icon" onClick={onRefreshEnvironment} title={t.refresh} aria-label={t.refresh}>
          <RefreshCw size={14} />
        </button>
      </div>
      {projectMissing && (
        <div className="environment-warning project-path-warning" role="status">
          <AlertTriangle size={14} />
          <strong>{t.projectPathMissing}</strong>
          <span title={activeProject.path}>{t.projectPathMissingHint}</span>
        </div>
      )}
      <div className="environment-rows">
        <button type="button" className="environment-row" onClick={() => onOpenBottomPanel?.("changes")} title={git?.raw || t.changes}>
          <FileText size={15} />
          <span>{t.changes}</span>
          <em>{git?.available ? `${git.changes || 0}` : t.gitUnavailable}</em>
        </button>
        <button type="button" className="environment-row" onClick={() => onOpenBottomPanel?.("environment")} title={environment?.cwd || activeProject?.path || t.noProjectPath}>
          <HardDrive size={15} />
          <span>{t.local}</span>
          <em>{projectMissing ? t.projectPathMissing : activeProject?.path ? compactPath(activeProject.path, 28) : t.noProjectPath}</em>
        </button>
        <button type="button" className="environment-row" onClick={() => onOpenBottomPanel?.("changes")} title={gitRootPath || t.gitUnavailable}>
          <GitFork size={15} />
          <span>{t.gitRoot}</span>
          <em>{gitRootLabel}</em>
        </button>
        <button type="button" className="environment-row" onClick={() => onOpenBottomPanel?.("changes")} title={git?.branch || t.gitUnavailable}>
          <GitBranch size={15} />
          <span>{t.branch}</span>
          <em>{git?.branch || t.gitUnavailable}</em>
        </button>
        {gitRelativePath && gitRelativePath !== "." && (
          <button type="button" className="environment-row muted" onClick={() => onOpenBottomPanel?.("environment")} title={gitRelativePath}>
            <Folder size={15} />
            <span>{t.gitRelativePath}</span>
            <em>{gitRelativeLabel}</em>
          </button>
        )}
        <button
          type="button"
          className="environment-row muted"
          onClick={() => onOpenBottomPanel?.("changes")}
          title={git?.available ? `${upstreamLabel} · ${syncLabel}` : t.gitUnavailable}
        >
          <GitCommit size={15} />
          <span>{t.commitOrPush}</span>
          <em>{git?.available ? syncLabel : t.gitUnavailable}</em>
        </button>
      </div>
      <div className="environment-ide-row">
        {ideOptions?.length > 1 && (
          <label>
            <Monitor size={14} />
            <select value={selectedIdeId} onChange={(event) => setSelectedIdeId(event.target.value)} aria-label={t.openInIde}>
              {ideOptions.map((option) => (
                <option value={option.id} key={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="plain-action subtle-action" onClick={onOpenIde} title={selectedIde?.label || t.ideUnavailable}>
          <Code2 size={14} />
          {selectedIde?.label || t.openIde}
        </button>
      </div>
      <details className="environment-subsection">
        <summary>
          <span>{t.subagents}</span>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenBottomPanel?.("subagents");
            }}
          >
            {projectSubagents.length ? t.subagentCount.replace("{count}", projectSubagents.length) : t.noSubagentsYet}
          </button>
        </summary>
        {projectSubagents.length ? (
          <ul className="environment-evidence-list">
            {projectSubagents.map((run) => (
              <li key={run.id || run.requestId}>
                <strong>{run.nickname || titleFromUserContent(run.task || t.subagentTask)}</strong>
                <span>{subagentStatusLabel(run.status, t)} · {formatDate(run.endedAt || run.startedAt || run.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t.noSubagentsYet}</p>
        )}
      </details>
      <details className="environment-subsection">
        <summary>
          <span>{t.sources}</span>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenBottomPanel?.("sources");
            }}
          >
            {projectSources.length ? t.sourceCount.replace("{count}", projectSources.length) : t.noSourcesYet}
          </button>
        </summary>
        {projectSources.length ? (
          <ul className="environment-evidence-list">
            {projectSources.map((source) => (
              <li key={`${source.project?.path || source.project?.name || ""}:${source.path}`}>
                <strong title={source.path}>{source.name || source.path}</strong>
                <span>{formatBytes(source.size)} · {t.sourceLastOpened} {formatDate(source.lastOpenedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t.noSourcesYet}</p>
        )}
      </details>
    </section>
  );
}

function ToolRail({
  activeProject,
  environment,
  selectedTool,
  onActivateTool,
  onSettings,
  onCapabilities,
  busy,
  t,
}) {
  const gitChanges = environment?.git?.available ? Number(environment.git.changes || 0) : 0;
  const projectMissing = Boolean(activeProject?.path && environment?.projectMissing);
  const items = [
    { id: "workspace", label: t.workspaceTool, icon: Folder, badge: gitChanges > 0 ? String(gitChanges) : "" },
    { id: "claude", label: t.claudeCodeTool, icon: Bot, badge: busy ? "●" : "" },
    { id: "browser", label: t.browser, icon: Globe2, badge: "" },
    { id: "terminal", label: t.terminal, icon: SquareTerminal, badge: "" },
  ];
  return (
    <aside className="tool-rail app-rail" aria-label={t.tools}>
      <button
        type="button"
        className="tool-rail-button rail-button primary rail-toggle"
        onClick={() => onActivateTool(selectedTool || "workspace")}
        title={`${t.openSidePanel} Ctrl+\\`}
        aria-label={t.openSidePanel}
      >
        <PanelRight size={17} />
      </button>
      <div className="tool-rail-stack" role="list" aria-label={t.tools}>
        {items.map(({ id, label, icon: Icon, badge }) => (
          <button
            type="button"
            key={id}
            className={cx("tool-rail-button rail-button", selectedTool === id && "active", badge === "●" && "running")}
            data-tool={id}
            onClick={() => onActivateTool(id)}
            title={badge && badge !== "●" ? `${label} · ${badge}` : label}
            aria-label={badge && badge !== "●" ? `${label}: ${badge}` : label}
          >
            <Icon size={17} />
            {badge && <em>{badge}</em>}
          </button>
        ))}
      </div>
      <div className="tool-rail-footer">
        <button type="button" className="tool-rail-button rail-button" onClick={onCapabilities} title={t.capabilities} aria-label={t.capabilities}>
          <Blocks size={16} />
        </button>
        <button type="button" className="tool-rail-button rail-button" onClick={onSettings} title={t.settings} aria-label={t.settings}>
          <Settings size={16} />
        </button>
      </div>
      <span
        className={cx("tool-rail-project-dot", projectMissing ? "missing" : activeProject?.path && "ready")}
        title={projectMissing ? `${t.projectPathMissing}: ${activeProject.path}` : activeProject?.path || t.noProjectPath}
      />
    </aside>
  );
}

function ToolsPanel({
  activeProject,
  settings,
  environment,
  onRefreshEnvironment,
  ideOptions,
  selectedIdeId,
  setSelectedIdeId,
  onOpenIde,
  selectedTool,
  setSelectedTool,
  onSettings,
  onOpenProject,
  onOpenTerminal,
  onOpenBrowserUrl,
  onCapabilities,
  onOpenBottomPanel,
  onRunEvent,
  onSourceRefs,
  subagentRuns = [],
  sourceRefs = [],
  commandRuns = [],
  onCommandRuns,
  browserVisits = [],
  onBrowserVisits,
  browserOpenRequest,
  workspaceOpenRequest,
  onClose,
  t,
}) {
  const [url, setUrl] = useState("");
  const [browserPreviewUrl, setBrowserPreviewUrl] = useState("");
  const [browserStatus, setBrowserStatus] = useState("idle");
  const [browserError, setBrowserError] = useState("");
  const browserWebviewRef = useRef(null);
  const browserVisitIdRef = useRef("");
  const browserFailedRef = useRef(false);
  const [tree, setTree] = useState([]);
  const fileCacheRef = useRef(new Map());
  const [expandedDirs, setExpandedDirs] = useState(() => new Set());
  const [lazyChildren, setLazyChildren] = useState({});
  const [file, setFile] = useState(null);
  const [fileDraft, setFileDraft] = useState("");
  const [fileView, setFileView] = useState("edit");
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceErrorRetry, setWorkspaceErrorRetry] = useState(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [openingPath, setOpeningPath] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [command, setCommand] = useState("");
  const [commandResult, setCommandResult] = useState(null);
  const [commandHistory, setCommandHistory] = useState(() => commandRunsToHistory(commandRuns, "workspace"));
  const [commandStream, setCommandStream] = useState({ stdout: "", stderr: "" });
  const [commandRequestId, setCommandRequestId] = useState("");
  const commandRequestRef = useRef("");
  const workspaceOutputRef = useRef(null);
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [claudeArgs, setClaudeArgs] = useState("");
  const [claudeBusy, setClaudeBusy] = useState(false);
  const [claudeRunningArgs, setClaudeRunningArgs] = useState("");
  const [claudeResult, setClaudeResult] = useState(null);
  const [claudeHistory, setClaudeHistory] = useState(() => commandRunsToHistory(commandRuns, "claude"));
  const [claudeStream, setClaudeStream] = useState({ stdout: "", stderr: "" });
  const [claudeRequestId, setClaudeRequestId] = useState("");
  const claudeRequestRef = useRef("");
  const claudeOutputRef = useRef(null);
  const [confirmingPluginAction, setConfirmingPluginAction] = useState(null);
  const [pluginName, setPluginName] = useState("");
  const [pluginItems, setPluginItems] = useState(null);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginsError, setPluginsError] = useState("");
  const [pathCopied, setPathCopied] = useState(false);
  const selectedToolDetailRef = useRef(null);
  const toolAutoScrollReadyRef = useRef(false);

  useEffect(() => {
    setCommandHistory(commandRunsToHistory(commandRuns, "workspace"));
  }, [commandRuns]);
  useEffect(() => {
    setClaudeHistory(commandRunsToHistory(commandRuns, "claude"));
  }, [commandRuns]);

  const hasUnsavedFile = Boolean(file && fileDraft !== file.content);
  const [debouncedFileDraft, setDebouncedFileDraft] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFileDraft(fileDraft), 300);
    return () => clearTimeout(timer);
  }, [fileDraft]);
  useEffect(() => {
    setSaveStatus("idle");
    setFileView("edit");
  }, [file?.path]);
  useEffect(() => {
    setSaveStatus((prev) => (prev === "saved" && hasUnsavedFile ? "idle" : prev));
  }, [hasUnsavedFile]);
  const fileTooLargeForDiff = Boolean(file && file.size > LARGE_FILE_DIFF_LIMIT_BYTES);
  const diff = useMemo(
    () => (hasUnsavedFile && !fileTooLargeForDiff ? buildLineDiff(file.content, debouncedFileDraft) : null),
    [file, debouncedFileDraft, hasUnsavedFile, fileTooLargeForDiff],
  );
  const fileUpdatedAt = formatFileTimestamp(file?.updatedAt);
  const changeSummary = diff ? `+${diff.additions} -${diff.deletions}` : hasUnsavedFile ? t.unsavedChanges : t.noFileChanges;
  const reviewRows = diff?.rows || [];
  const reviewBeforeSaveRequired = hasUnsavedFile && !fileTooLargeForDiff && fileView !== "review";
  const canSaveFile = hasUnsavedFile && !reviewBeforeSaveRequired;
  const changeBarTitle = saveStatus === "saved"
    ? t.savedChanges
    : reviewBeforeSaveRequired
      ? t.reviewRequiredTitle
      : fileView === "review" && hasUnsavedFile
        ? t.readyToSave
        : t.reviewUnsavedChanges;
  const changeBarHint = saveStatus === "saved"
    ? t.saved
    : reviewBeforeSaveRequired
      ? t.reviewRequiredHint
      : changeSummary;

  useEffect(() => {
    if (!desktopApi?.onWorkspaceCommandStream) return undefined;
    return desktopApi.onWorkspaceCommandStream((event) => {
      setCommandStream((current) => (
        event.requestId && event.requestId === commandRequestRef.current
          ? appendStreamChunk(current, event.stream, event.text)
          : current
      ));
    });
  }, []);

  useEffect(() => {
    if (!desktopApi?.onClaudeRunStream) return undefined;
    return desktopApi.onClaudeRunStream((event) => {
      setClaudeStream((current) => (
        event.requestId && event.requestId === claudeRequestRef.current
          ? appendStreamChunk(current, event.stream, event.text)
          : current
      ));
    });
  }, []);

  async function recordBrowserVisit(payload) {
    if (!desktopApi?.recordBrowserVisit || !payload?.url) return null;
    try {
      const next = await desktopApi.recordBrowserVisit({
        id: browserVisitIdRef.current || payload.id,
        projectPath: activeProject?.path || "",
        ...payload,
      });
      if (Array.isArray(next.browserVisits)) onBrowserVisits?.(next.browserVisits);
      return next.browserVisit || null;
    } catch {
      return null;
    }
  }

  async function captureBrowserSnapshot(webview) {
    if (!webview?.executeJavaScript) return {};
    try {
      return await webview.executeJavaScript(`
        (function() {
          const text = String(document.body?.innerText || document.body?.textContent || "")
            .replace(/\\s+/g, " ")
            .trim()
            .slice(0, 600);
          return {
            title: String(document.title || "").trim().slice(0, 180),
            excerpt: text,
            snapshotCapturedAt: new Date().toISOString()
          };
        })();
      `);
    } catch {
      return {};
    }
  }

  useEffect(() => {
    const webview = browserWebviewRef.current;
    if (!webview) return undefined;
    const ensureVisitId = () => {
      if (!browserVisitIdRef.current) browserVisitIdRef.current = `browser_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      return browserVisitIdRef.current;
    };
    const handleStart = () => {
      const visitId = ensureVisitId();
      browserFailedRef.current = false;
      setBrowserStatus("loading");
      setBrowserError("");
      recordBrowserVisit({ id: visitId, url: browserPreviewUrl, finalUrl: browserPreviewUrl, status: "loading" });
    };
    const handleStop = async () => {
      if (browserFailedRef.current) return;
      const visitId = ensureVisitId();
      setBrowserStatus("ready");
      setBrowserError("");
      const currentWebview = browserWebviewRef.current;
      const finalUrl = currentWebview?.getURL?.() || browserPreviewUrl;
      const snapshot = await captureBrowserSnapshot(currentWebview);
      recordBrowserVisit({ id: visitId, url: finalUrl, finalUrl, status: "ready", ...snapshot });
      onRunEvent?.({
        id: visitId,
        type: "browser",
        status: "ok",
        title: `${t.browser}: ${finalUrl}`,
        detail: t.browserReady,
        cwd: activeProject?.path || "",
      });
    };
    const handleFail = (event) => {
      if (event?.errorCode === -3) return;
      const visitId = ensureVisitId();
      browserFailedRef.current = true;
      setBrowserStatus("error");
      const error = event?.errorDescription || t.browserFailed;
      setBrowserError(error);
      recordBrowserVisit({
        id: visitId,
        url: event?.validatedURL || browserPreviewUrl,
        finalUrl: event?.validatedURL || browserPreviewUrl,
        status: "error",
        error,
        errorCode: event?.errorCode,
        validatedUrl: event?.validatedURL || "",
        isMainFrame: Boolean(event?.isMainFrame),
      });
      onRunEvent?.({
        id: visitId,
        type: "browser",
        status: "error",
        title: `${t.browser}: ${event?.validatedURL || browserPreviewUrl}`,
        detail: error,
        cwd: activeProject?.path || "",
      });
    };
    const handleNavigate = (event) => {
      if (event?.url && /^https?:\/\//i.test(event.url)) {
        setUrl(event.url);
        recordBrowserVisit({ url: event.url, finalUrl: event.url, status: browserStatus === "error" ? "error" : "ready" });
      }
    };
    webview.addEventListener("did-start-loading", handleStart);
    webview.addEventListener("did-stop-loading", handleStop);
    webview.addEventListener("did-fail-load", handleFail);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    return () => {
      webview.removeEventListener("did-start-loading", handleStart);
      webview.removeEventListener("did-stop-loading", handleStop);
      webview.removeEventListener("did-fail-load", handleFail);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
    };
  }, [activeProject?.path, browserPreviewUrl, selectedTool, t.browserFailed]);

  useEffect(() => {
    if (!browserOpenRequest?.url) return;
    openBrowserPreviewUrl(browserOpenRequest.url, browserOpenRequest.id || browserOpenRequest.visitId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserOpenRequest?.nonce]);

  useEffect(() => {
    if (!commandRequestId && !commandResult) return;
    window.setTimeout(() => workspaceOutputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  }, [commandRequestId, commandResult]);

  useEffect(() => {
    if (!claudeRequestId && !claudeResult) return;
    window.setTimeout(() => claudeOutputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  }, [claudeRequestId, claudeResult]);

  async function loadClaudeStatus() {
    if (!desktopApi?.getClaudeStatus) {
      setClaudeStatus(null);
      setStatusError("");
      return;
    }
    setStatusBusy(true);
    setStatusError("");
    try {
      const result = await desktopApi.getClaudeStatus({ projectPath: activeProject?.path });
      setClaudeStatus(result);
    } catch (error) {
      setStatusError(error.message || String(error));
    } finally {
      setStatusBusy(false);
    }
  }

  async function loadTree() {
    if (!desktopApi?.listWorkspaceFiles) {
      setWorkspaceError(t.desktopOnly);
      return;
    }
    if (!activeProject?.path) {
      setWorkspaceError(t.noProjectSelected);
      return;
    }
    setWorkspaceBusy(true);
    setWorkspaceError("");
    setWorkspaceErrorRetry(null);
    setExpandedDirs(new Set());
    setLazyChildren({});
    fileCacheRef.current.clear();
    try {
      const result = await desktopApi.listWorkspaceFiles({ projectPath: activeProject.path, depth: 2 });
      setTree(result.files || []);
    } catch (error) {
      setWorkspaceError(error.message || String(error));
      setWorkspaceErrorRetry(() => () => loadTree());
    } finally {
      setWorkspaceBusy(false);
    }
  }

  function toggleDir(item) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
    if (!expandedDirs.has(item.path) && item.children === undefined && lazyChildren[item.path] === undefined) {
      loadDirChildren(item);
    }
  }

  async function loadDirChildren(item) {
    if (!desktopApi?.listWorkspaceFiles || !activeProject?.path) return;
    setLazyChildren((prev) => ({ ...prev, [item.path]: "loading" }));
    try {
      const result = await desktopApi.listWorkspaceFiles({ projectPath: activeProject.path, relativePath: item.path, depth: 2 });
      setLazyChildren((prev) => ({ ...prev, [item.path]: result.files || [] }));
    } catch (error) {
      setLazyChildren((prev) => ({ ...prev, [item.path]: [] }));
      setWorkspaceError(error.message || String(error));
    }
  }

  async function openFile(item, options = {}) {
    if (!item || item.type !== "file") return;
    if (!desktopApi?.readWorkspaceFile) {
      setWorkspaceError(t.desktopOnly);
      return;
    }
    const targetProjectPath = String(item.projectPath || options.projectPath || activeProject?.path || "").trim();
    const cacheKey = `${targetProjectPath}::${item.path}`;
    const cached = fileCacheRef.current.get(cacheKey);
    if (cached && !options.force) {
      cacheFileRead(fileCacheRef, cacheKey, cached);
      setWorkspaceError("");
      setWorkspaceErrorRetry(null);
      setFile(cached);
      setFileDraft(cached.content || "");
      setFileView("edit");
      setSaveStatus("idle");
      return;
    }
    setWorkspaceBusy(true);
    setWorkspaceError("");
    setWorkspaceErrorRetry(null);
    setOpeningPath(item.path);
    try {
      const result = await desktopApi.readWorkspaceFile({ projectPath: targetProjectPath, relativePath: item.path });
      const nextFile = {
        ...result,
        projectPath: targetProjectPath,
        projectLabel: item.projectLabel || result.sourceRef?.project?.name || "",
      };
      cacheFileRead(fileCacheRef, cacheKey, nextFile);
      setFile(nextFile);
      setFileDraft(nextFile.content || "");
      setFileView("edit");
      setSaveStatus("idle");
      if (Array.isArray(result.sourceRefs)) onSourceRefs?.(result.sourceRefs);
    } catch (error) {
      setWorkspaceError(error.message || String(error));
      setWorkspaceErrorRetry(() => () => openFile(item, options));
    } finally {
      setWorkspaceBusy(false);
      setOpeningPath("");
    }
  }

  async function saveFile() {
    if (!file) return;
    if (hasUnsavedFile && !fileTooLargeForDiff && fileView !== "review") {
      setFileView("review");
      return;
    }
    if (!desktopApi?.saveWorkspaceFile) {
      setWorkspaceError(t.desktopOnly);
      return;
    }
    setWorkspaceBusy(true);
    setWorkspaceError("");
    setWorkspaceErrorRetry(null);
    setSaveStatus("saving");
    const requestId = `file_save_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    onRunEvent?.({
      id: requestId,
      type: "file-save",
      status: "running",
      title: `${t.saveFile}: ${file.path}`,
      detail: changeSummary,
      cwd: file.projectPath || activeProject?.path || "",
    });
    try {
      const result = await desktopApi.saveWorkspaceFile({
        projectPath: file.projectPath || activeProject.path,
        relativePath: file.path,
        content: fileDraft,
        baseUpdatedAt: file.updatedAt,
        baseSha256: file.sha256,
      });
      const nextFile = { ...result, projectPath: file.projectPath || activeProject.path, projectLabel: file.projectLabel || "" };
      cacheFileRead(fileCacheRef, `${file.projectPath || activeProject?.path || ""}::${file.path}`, nextFile);
      setFile(nextFile);
      setFileDraft(nextFile.content || "");
      setFileView("edit");
      setSaveStatus("saved");
      onRefreshEnvironment?.();
      onRunEvent?.({
        id: requestId,
        type: "file-save",
        status: "ok",
        title: `${t.saveFile}: ${file.path}`,
        detail: changeSummary,
        cwd: file.projectPath || activeProject?.path || "",
      });
    } catch (error) {
      setWorkspaceError(error.message || String(error));
      setWorkspaceErrorRetry(() => () => openFile({ type: "file", path: file.path, projectPath: file.projectPath, projectLabel: file.projectLabel }, { force: true }));
      setSaveStatus("error");
      onRunEvent?.({
        id: requestId,
        type: "file-save",
        status: "error",
        title: `${t.saveFile}: ${file.path}`,
        detail: error.message || String(error),
        cwd: file.projectPath || activeProject?.path || "",
        path: file.path,
        action: `workspace:file:${encodeURIComponent(file.path)}`,
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  function discardFileChanges() {
    if (!file) return;
    setFileDraft(file.content || "");
    setFileView("edit");
    setSaveStatus("idle");
  }

  useEffect(() => {
    if (saveStatus !== "saved") return undefined;
    const timer = setTimeout(() => setSaveStatus("idle"), 1500);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  async function runCommand() {
    const nextCommand = command.trim();
    if (!nextCommand) return;
    if (!desktopApi?.runWorkspaceCommand) {
      setWorkspaceError(t.desktopOnly);
      return;
    }
    if (!activeProject?.path) {
      setWorkspaceError(t.noProjectSelected);
      return;
    }
    setWorkspaceBusy(true);
    setWorkspaceError("");
    setWorkspaceErrorRetry(null);
    const requestId = `workspace_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    commandRequestRef.current = requestId;
    setCommandRequestId(requestId);
    setCommandStream({ stdout: "", stderr: "" });
    setCommandResult(null);
    onRunEvent?.({
      id: requestId,
      type: "workspace-command",
      status: "running",
      title: `${t.runCommand}: ${nextCommand}`,
      detail: activeProject.path,
      commandLine: nextCommand,
      cwd: activeProject.path,
    });
    try {
      const result = await desktopApi.runWorkspaceCommand({ projectPath: activeProject.path, command: nextCommand, requestId });
      setCommandResult(result);
      if (Array.isArray(result.commandRuns)) {
        onCommandRuns?.(result.commandRuns);
      } else {
        const entry = commandRunToHistoryEntry(result.commandRun) || {
          id: requestId,
          commandLine: result.command || nextCommand,
          cwd: result.cwd || activeProject.path,
          code: result.code,
          durationMs: result.durationMs,
          stdout: result.stdout || "",
          stderr: result.stderr || "",
          cancelled: Boolean(result.cancelled),
        };
        setCommandHistory((current) => prependCommandHistory(current, entry));
      }
      onRefreshEnvironment?.();
      onRunEvent?.({
        id: requestId,
        type: "workspace-command",
        status: result.cancelled ? "cancelled" : result.code === 0 ? "ok" : "error",
        title: `${t.runCommand}: ${result.command || nextCommand}`,
        detail: result.cancelled ? t.commandCancelled : `${t.commandExit}: ${result.code}`,
        commandLine: result.command || nextCommand,
        cwd: result.cwd || activeProject.path,
        code: result.code,
        durationMs: result.durationMs,
      });
    } catch (error) {
      setWorkspaceError(error.message || String(error));
      setWorkspaceErrorRetry(() => () => runCommand());
      onRunEvent?.({
        id: requestId,
        type: "workspace-command",
        status: "error",
        title: `${t.runCommand}: ${nextCommand}`,
        detail: error.message || String(error),
        commandLine: nextCommand,
        cwd: activeProject.path,
      });
    } finally {
      setWorkspaceBusy(false);
      commandRequestRef.current = "";
      setCommandRequestId("");
    }
  }

  async function cancelWorkspaceCommand() {
    const requestId = commandRequestRef.current || commandRequestId;
    if (!requestId) return;
    onRunEvent?.({
      id: requestId,
      type: "workspace-command",
      status: "cancelled",
      title: `${t.runCommand}: ${command.trim() || commandResult?.command || ""}`,
      detail: t.commandCancelled,
      commandLine: command.trim() || commandResult?.command || "",
      cwd: activeProject?.path || "",
      code: 130,
    });
    try {
      if (desktopApi?.cancelWorkspaceCommand) {
        await desktopApi.cancelWorkspaceCommand({ requestId });
      } else {
        await desktopApi?.cancelRequest?.(requestId);
      }
    } catch (error) {
      setWorkspaceError(error.message || String(error));
    }
  }

  async function runClaude(args = claudeArgs) {
    const nextArgs = String(args || "").trim();
    if (!nextArgs) return;
    if (!desktopApi?.runClaudeCommand) {
      setStatusError(t.desktopOnly);
      return;
    }
    setClaudeBusy(true);
    setStatusError("");
    const requestId = `claude_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    claudeRequestRef.current = requestId;
    setClaudeRequestId(requestId);
    setClaudeRunningArgs(nextArgs);
    setClaudeStream({ stdout: "", stderr: "" });
    setClaudeResult(null);
    onRunEvent?.({
      id: requestId,
      type: "claude-command",
      status: "running",
      title: `${t.runClaude}: claude ${nextArgs}`,
      detail: activeProject?.path || "",
      commandLine: `claude ${nextArgs}`,
      cwd: activeProject?.path || "",
    });
    try {
      const result = await desktopApi.runClaudeCommand({
        projectPath: activeProject?.path,
        args: nextArgs,
        requestId,
        persistCommandRun: true,
        commandRunKind: "claude",
      });
      setClaudeResult(result);
      if (Array.isArray(result.commandRuns)) {
        onCommandRuns?.(result.commandRuns);
      } else {
        setClaudeHistory((current) => prependCommandHistory(current, {
          id: requestId,
          commandLine: `claude ${result.args?.join(" ") || nextArgs}`,
          cwd: result.cwd || activeProject?.path || "",
          code: result.code,
          durationMs: result.durationMs,
          stdout: result.stdout || "",
          stderr: result.stderr || "",
        }));
      }
      onRunEvent?.({
        id: requestId,
        type: "claude-command",
        status: result.code === 0 ? "ok" : "error",
        title: `${t.runClaude}: claude ${result.args?.join(" ") || nextArgs}`,
        detail: `${t.commandExit}: ${result.code}`,
        commandLine: `claude ${result.args?.join(" ") || nextArgs}`,
        cwd: result.cwd || activeProject?.path || "",
        code: result.code,
        durationMs: result.durationMs,
      });
    } catch (error) {
      setStatusError(error.message || String(error));
      onRunEvent?.({
        id: requestId,
        type: "claude-command",
        status: "error",
        title: `${t.runClaude}: claude ${nextArgs}`,
        detail: error.message || String(error),
        commandLine: `claude ${nextArgs}`,
        cwd: activeProject?.path || "",
      });
    } finally {
      setClaudeBusy(false);
      claudeRequestRef.current = "";
      setClaudeRequestId("");
    }
  }

  async function openInteractiveClaude() {
    if (!desktopApi?.openClaudeTerminal) {
      setStatusError(t.desktopOnly);
      return;
    }
    await desktopApi?.openClaudeTerminal({ projectPath: activeProject?.path });
  }

  function openBrowserPreviewUrl(value, visitId = "") {
    const nextUrl = normalizeBrowserUrl(value);
    if (!nextUrl) {
      setUrl("");
      setBrowserPreviewUrl("");
      setBrowserError("");
      setBrowserStatus("idle");
      browserVisitIdRef.current = "";
      return;
    }
    browserVisitIdRef.current = visitId || `browser_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    browserFailedRef.current = false;
    setUrl(nextUrl);
    setBrowserError("");
    setBrowserStatus("loading");
    recordBrowserVisit({ id: browserVisitIdRef.current, url: nextUrl, finalUrl: nextUrl, status: "loading" });
    if (nextUrl === browserPreviewUrl) {
      browserWebviewRef.current?.reload?.();
    } else {
      setBrowserPreviewUrl(nextUrl);
    }
  }

  function submitBrowserPreview(event) {
    event?.preventDefault?.();
    openBrowserPreviewUrl(url);
  }

  function browserBack() {
    browserWebviewRef.current?.goBack?.();
  }

  function browserForward() {
    browserWebviewRef.current?.goForward?.();
  }

  function browserReload() {
    if (!browserPreviewUrl) {
      setBrowserStatus("idle");
      return;
    }
    if (!browserVisitIdRef.current) browserVisitIdRef.current = `browser_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    browserFailedRef.current = false;
    setBrowserStatus("loading");
    setBrowserError("");
    recordBrowserVisit({ id: browserVisitIdRef.current, url: browserPreviewUrl, finalUrl: browserPreviewUrl, status: "loading" });
    browserWebviewRef.current?.reload?.();
  }

  async function copyProjectPath() {
    const pathText = activeProject?.path || "";
    if (!pathText) return;
    await navigator.clipboard?.writeText(pathText);
    setPathCopied(true);
    window.setTimeout(() => setPathCopied(false), 1200);
  }

  async function loadPlugins() {
    if (!desktopApi?.getClaudeStatus && !desktopApi?.runClaudeCommand) return;
    setPluginsLoading(true);
    setPluginsError("");
    try {
      if (desktopApi?.getClaudeStatus) {
        const result = await desktopApi.getClaudeStatus({ projectPath: activeProject?.path });
        setClaudeStatus(result);
        setPluginItems(Array.isArray(result?.pluginItems) ? result.pluginItems : []);
        return;
      }
      const requestId = `plugins_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const result = await desktopApi.runClaudeCommand({ projectPath: activeProject?.path, args: "plugin list --json", requestId });
      if (result.code !== 0) throw new Error(result.stderr || t.pluginsLoadError);
      setPluginItems(panelPluginItemsFromJsonText(result.stdout));
    } catch (error) {
      setPluginsError(error.message || t.pluginsLoadError);
      setPluginItems([]);
    } finally {
      setPluginsLoading(false);
    }
  }

  async function runClaudeAndRefreshPlugins(args) {
    await runClaude(args);
    loadPlugins();
  }

  function openRuntimeHealthTargetName(target) {
    if (target === "plugins" || target === "skills" || target === "mcp" || target === "marketplace") {
      onCapabilities?.(target);
      return;
    }
    if (target === "claude") {
      setSelectedTool("claude");
    }
  }

  function openRuntimeHealthTarget(row) {
    openRuntimeHealthTargetName(runtimeHealthTargetForRow(row));
  }

  function openRuntimeHealthIssue(issue) {
    openRuntimeHealthTargetName(runtimeHealthTargetForIssue(issue));
  }

  function recordRuntimeHealthEvidence(summary, evidenceText) {
    const eventId = `runtime_health_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    onRunEvent?.({
      id: eventId,
      type: "runtime-health",
      status: summary?.status === "ok" ? "ok" : summary?.status === "pending" ? "running" : "error",
      title: t.runtimeHealthEvidence,
      detail: summary?.headline || "",
      cwd: activeProject?.path || "",
      stdout: evidenceText,
      code: Array.isArray(summary?.issues) ? summary.issues.length : null,
      suppressNotice: true,
    });
    onOpenBottomPanel?.("outputs");
  }

  useEffect(() => {
    if (selectedTool === "workspace") loadTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTool, activeProject?.path]);
  useEffect(() => {
    const focusedPath = String(workspaceOpenRequest?.path || "").trim();
    if (selectedTool !== "workspace" || !focusedPath) return;
    openFile({
      type: "file",
      path: focusedPath,
      projectPath: workspaceOpenRequest?.projectPath || "",
      projectLabel: workspaceOpenRequest?.projectLabel || "",
    }, { force: workspaceOpenRequest?.force !== false, projectPath: workspaceOpenRequest?.projectPath || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTool, workspaceOpenRequest?.nonce]);

  useEffect(() => {
    loadClaudeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.path]);

  useEffect(() => {
    if (selectedTool === "claude") loadPlugins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTool, activeProject?.path]);

  useEffect(() => {
    if (!selectedTool) return;
    if (!toolAutoScrollReadyRef.current) {
      toolAutoScrollReadyRef.current = true;
      return;
    }
    window.setTimeout(() => selectedToolDetailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
  }, [selectedTool]);

  const statusText = authLabel(claudeStatus?.auth, settings);
  const statusBaseUrl = cliBaseUrl(settings);
  const statusReady = Boolean(claudeStatus?.available);
  const statusHeadline = statusBusy ? `${t.loading}...` : statusReady ? t.uxReady : statusText;
  const compactRuntimeStatus = statusBusy
    ? `${t.loading}...`
    : [statusText, displayModelLabel(settings?.model), projectLabel(activeProject, t)].filter(Boolean).join(" · ");
  const quickClaudeCommands = [
    { label: t.help, args: "--help" },
    { label: t.auth, args: "auth status" },
    { label: t.plugins, args: "plugin list" },
    { label: "MCP", args: "mcp list" },
    { label: t.agents, args: "agents --help" },
    { label: t.doctor, args: "doctor" },
  ];
  const workspaceLiveEntry = workspaceBusy && commandRequestId
    ? {
      id: commandRequestId,
      commandLine: command,
      cwd: activeProject?.path || "",
      stdout: commandStream.stdout,
      stderr: commandStream.stderr,
    }
    : null;
  const commandIsRunning = Boolean(commandRequestId);
  const claudeLiveEntry = claudeBusy && claudeRequestId
    ? {
      id: claudeRequestId,
      commandLine: `claude ${claudeRunningArgs || claudeArgs}`,
      cwd: activeProject?.path || "",
      stdout: claudeStream.stdout,
      stderr: claudeStream.stderr,
    }
    : null;
  const installedPluginItems = Array.isArray(pluginItems)
    ? pluginItems
    : Array.isArray(claudeStatus?.pluginItems)
      ? claudeStatus.pluginItems
      : [];
  const mcpPanelItems = Array.isArray(claudeStatus?.mcpServers) ? claudeStatus.mcpServers : [];
  const marketplacePanelSources = Array.isArray(claudeStatus?.marketplaces) ? claudeStatus.marketplaces : [];
  const marketplacePanelPlugins = Array.isArray(claudeStatus?.marketplacePlugins) ? claudeStatus.marketplacePlugins : [];

  return (
    <aside className="tools-panel">
      <div className="panel-toggle">
        <span>{t.tools}</span>
        <div>
          <button type="button" title={t.capabilities} aria-label={t.capabilities} onClick={onCapabilities}>
            <Maximize2 size={14} />
          </button>
          <button type="button" title={t.terminal} aria-label={t.terminal} onClick={onOpenTerminal}>
            <PanelBottom size={16} />
          </button>
          <button type="button" title={t.settings} aria-label={t.settings} onClick={onSettings}>
            <Settings size={16} />
          </button>
          <button type="button" title={t.close} aria-label={t.close} onClick={onClose}>
            <PanelRight size={17} />
          </button>
        </div>
      </div>

      <section className="tool-group">
        <button type="button" className={cx("tool-row", selectedTool === "workspace" && "active")} onClick={() => setSelectedTool(selectedTool === "workspace" ? "" : "workspace")} aria-expanded={selectedTool === "workspace"} aria-controls="workspace-tool-detail" title={t.workspaceTool}>
          <Folder size={17} />
          <span>{t.workspaceTool}</span>
          {selectedTool === "workspace" ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <button type="button" className={cx("tool-row", selectedTool === "claude" && "active")} onClick={() => setSelectedTool(selectedTool === "claude" ? "" : "claude")} aria-expanded={selectedTool === "claude"} aria-controls="claude-tool-detail" title={t.claudeCodeTool}>
          <Bot size={17} />
          <span>{t.claudeCodeTool}</span>
          {selectedTool === "claude" ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <button type="button" className={cx("tool-row", selectedTool === "browser" && "active")} onClick={() => setSelectedTool(selectedTool === "browser" ? "" : "browser")} aria-expanded={selectedTool === "browser"} aria-controls="browser-tool-detail" title={t.browser}>
          <Globe2 size={17} />
          <span>{t.browser}</span>
          <span className="tool-row-trailing">
            <kbd>Ctrl+T</kbd>
            {selectedTool === "browser" ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </span>
        </button>
        <button type="button" className={cx("tool-row", selectedTool === "terminal" && "active")} onClick={() => setSelectedTool(selectedTool === "terminal" ? "" : "terminal")} aria-expanded={selectedTool === "terminal"} aria-controls="terminal-tool-detail" title={t.terminal}>
          <SquareTerminal size={17} />
          <span>{t.terminal}</span>
          {selectedTool === "terminal" ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <section className="context-summary compact-context-summary" aria-label={t.claudeStatus}>
          <div className="context-summary-head">
            <div>
              <span className={cx("status-dot", statusReady && "ok", statusBusy && "loading")} />
              <p>{t.claudeStatus}</p>
              <strong>{statusHeadline}</strong>
            </div>
            <button type="button" className="icon-only mini-icon" onClick={loadClaudeStatus} disabled={statusBusy} title={statusBusy ? t.workingHint : t.refreshStatus} aria-label={t.refreshStatus}>
              <RefreshCw size={14} className={statusBusy ? "spin" : undefined} />
            </button>
          </div>
          {statusError && <p className="tool-error">{statusError}</p>}
          <p className="context-summary-compact" title={compactRuntimeStatus}>{compactRuntimeStatus}</p>
          <details className="context-summary-details">
            <summary>{t.runtimeDetails}</summary>
            <dl className="context-summary-meta">
              <div><dt>CLI</dt><dd>{statusBusy ? `${t.loading}...` : claudeStatus?.version || "unknown"}</dd></div>
              <div><dt>{t.auth}</dt><dd>{statusText}</dd></div>
              <div><dt>{t.model}</dt><dd>{settings?.model || "claude-sonnet-4-5-20250929"}</dd></div>
              <div><dt>{t.activeProject}</dt><dd>{projectLabel(activeProject, t)}</dd></div>
              {statusBaseUrl && <div><dt>{t.cliEnvSource}</dt><dd title={statusBaseUrl}>{compactPath(statusBaseUrl, 42)}</dd></div>}
            </dl>
          </details>
        </section>
        <details className="status-details environment-status-details">
          <summary>{t.environment}</summary>
          <EnvironmentOverview
            environment={environment}
            activeProject={activeProject}
            ideOptions={ideOptions}
            selectedIdeId={selectedIdeId}
            setSelectedIdeId={setSelectedIdeId}
            onOpenIde={onOpenIde}
            onRefreshEnvironment={onRefreshEnvironment}
            onOpenBottomPanel={onOpenBottomPanel}
            subagentRuns={subagentRuns}
            sourceRefs={sourceRefs}
            t={t}
          />
        </details>
        {selectedTool === "workspace" && (
          <div className="tool-detail workspace-detail" id="workspace-tool-detail" ref={selectedToolDetailRef}>
            <div className="tool-detail-head">
              <p>{t.workspaceHelp}</p>
              <button type="button" className="plain-action" onClick={loadTree} disabled={workspaceBusy} title={workspaceBusy ? t.workingHint : t.refresh}>
                <History size={14} />
                {t.refresh}
              </button>
            </div>
            {workspaceError && (
              <div className="tool-error-row">
                <div>
                  <p className="tool-error">{workspaceError}</p>
                  {isPermissionDeniedError(workspaceError) && <p className="tool-hint">{t.permissionErrorHint}</p>}
                </div>
                {workspaceErrorRetry && (
                  <button
                    type="button"
                    className="plain-action subtle-action"
                    onClick={() => {
                      const retry = workspaceErrorRetry;
                      setWorkspaceError("");
                      setWorkspaceErrorRetry(null);
                      retry();
                    }}
                  >
                    <RefreshCw size={13} />
                    {isFileConflictError(workspaceError) ? t.fileConflictReload : t.retry}
                  </button>
                )}
              </div>
            )}
            <div className="workspace-grid">
              <div className="file-tree" aria-label={t.files}>
                {workspaceBusy && !tree.length && (
                  <div className="thread-skeleton" aria-busy="true" aria-label={t.loading}>
                    <div className="thread-skeleton-row" />
                    <div className="thread-skeleton-row" />
                    <div className="thread-skeleton-row" />
                  </div>
                )}
                {!activeProject?.path && <p className="empty-list">{t.noProjectSelected}</p>}
                {tree.map((item) => (
                  <FileTreeItem
                    item={item}
                    key={item.path}
                    activePath={file?.path}
                    onOpenFile={openFile}
                    expandedDirs={expandedDirs}
                    lazyChildren={lazyChildren}
                    onToggleDir={toggleDir}
                  />
                ))}
              </div>
              <div className="file-editor">
                {file ? (
                  <>
                    <div className="editor-head">
                      <div>
                        <strong>{file.name}</strong>
                        <span title={file.path}>{file.path}</span>
                        <div className="editor-meta-row" aria-label="File metadata">
                          <em>{t.fileSize}: {formatBytes(file.size)}</em>
                          {fileUpdatedAt && <em>{t.fileUpdatedAt}: {fileUpdatedAt}</em>}
                          <em>{t.changedLines}: {changeSummary}</em>
                          {file.projectPath && file.projectPath !== activeProject?.path && <em title={file.projectPath}>{t.skillRoot}: {compactPath(file.projectPath, 58)}</em>}
                        </div>
                      </div>
                      <div className="editor-actions">
                        <div className="segmented-control compact-segmented" role="tablist" aria-label={t.reviewChanges}>
                          <button type="button" className={cx(fileView === "edit" && "active")} onClick={() => setFileView("edit")} aria-selected={fileView === "edit"}>
                            {t.editFile}
                          </button>
                          <button type="button" className={cx(fileView === "review" && "active")} onClick={() => setFileView("review")} aria-selected={fileView === "review"}>
                            {t.reviewFile}
                          </button>
                        </div>
                      </div>
                    </div>
                    {fileView === "review" ? (
                      <div className="editor-review-pane" role="tabpanel" aria-label={t.reviewChanges}>
                        {hasUnsavedFile && fileTooLargeForDiff ? (
                          <p className="tool-hint">{t.diffPreviewSkippedLarge}</p>
                        ) : reviewRows.length ? (
                          <div className="diff-rows" role="list">
                            {reviewRows.map((row, index) => (
                              <code className={cx("diff-row", row.type)} role="listitem" key={`${row.type}-${index}-${row.text}`}>
                                <span>{row.type === "add" ? "+" : row.type === "delete" ? "-" : " "}</span>
                                <b>{row.text || " "}</b>
                              </code>
                            ))}
                          </div>
                        ) : (
                          <div className="editor-empty compact-empty">
                            <FileText size={20} />
                            <p>{hasUnsavedFile ? t.noFileChanges : t.noChangesToReview}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <textarea value={fileDraft} onChange={(event) => setFileDraft(event.target.value)} spellCheck="false" aria-label={file.path} />
                    )}
                    {(hasUnsavedFile || saveStatus === "saved") && (
                      <div className={cx("editor-change-bar", saveStatus === "saved" && "saved", reviewBeforeSaveRequired && "needs-review")}>
                        <div>
                          <strong>{changeBarTitle}</strong>
                          <span>{changeBarHint}</span>
                        </div>
                        <div className="editor-change-actions">
                          {hasUnsavedFile && fileView !== "review" && (
                            <button type="button" className="plain-action review-primary-action" onClick={() => setFileView("review")} disabled={workspaceBusy || fileTooLargeForDiff} title={fileTooLargeForDiff ? t.diffPreviewSkippedLarge : t.reviewChanges}>
                              <FileText size={14} />
                              {t.reviewFile}
                            </button>
                          )}
                          {hasUnsavedFile && fileView === "review" && (
                            <button type="button" className="plain-action subtle-action" onClick={() => setFileView("edit")} disabled={workspaceBusy} title={workspaceBusy ? t.workingHint : t.keepEditing}>
                              <FileText size={14} />
                              {t.editFile}
                            </button>
                          )}
                          {hasUnsavedFile && (
                            <button type="button" className="plain-action subtle-action" onClick={discardFileChanges} disabled={workspaceBusy} title={workspaceBusy ? t.workingHint : t.discardChanges}>
                              <X size={14} />
                              {t.revertChanges}
                            </button>
                          )}
                          {(hasUnsavedFile || saveStatus === "saved") && (
                            <button
                              type="button"
                              className={cx("plain-action", saveStatus === "saved" && "save-success")}
                              onClick={saveFile}
                              disabled={workspaceBusy || !canSaveFile}
                              title={saveStatus === "saving" ? t.workingHint : reviewBeforeSaveRequired ? t.reviewFirstToSave : !hasUnsavedFile ? t.noChangesToSave : t.saveChanges}
                            >
                              {saveStatus === "saving" ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
                              {saveStatus === "saving" ? t.saving : saveStatus === "saved" ? t.saved : t.save}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : openingPath ? (
                  <div className="editor-empty" aria-busy="true">
                    <RefreshCw size={22} className="spin" />
                    <p>{t.openingFile}</p>
                  </div>
                ) : (
                  <div className="editor-empty workspace-empty-editor">
                    <div className="workspace-empty-icon">
                      <FileText size={24} />
                    </div>
                    <strong>{t.noFileOpenTitle}</strong>
                    <p>{t.noFileOpenHint}</p>
                    <span className="workspace-empty-project" title={activeProject?.path || t.noProjectPath}>
                      <Folder size={14} />
                      {activeProject?.path ? compactPath(activeProject.path, 42) : t.noProjectPath}
                    </span>
                    <div className="workspace-empty-actions">
                      <button type="button" className="plain-action subtle-action" onClick={loadTree} disabled={workspaceBusy} title={workspaceBusy ? t.workingHint : t.refresh}>
                        <RefreshCw size={14} className={workspaceBusy ? "spin" : undefined} />
                        {t.refresh}
                      </button>
                      <button type="button" className="plain-action subtle-action" onClick={onOpenProject} disabled={!activeProject?.path} title={activeProject?.path ? t.openProject : t.noProjectPath}>
                        <Folder size={14} />
                        {t.openFolderShort}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="command-runner">
              <label>
                <span>{t.runCommand}</span>
                <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={t.commandPlaceholder} disabled={commandIsRunning} />
              </label>
              <button
                type="button"
                className={cx("plain-action", commandIsRunning && "danger-action")}
                onClick={commandIsRunning ? cancelWorkspaceCommand : runCommand}
                disabled={!commandIsRunning && (workspaceBusy || !command.trim())}
                title={commandIsRunning ? t.cancelCommand : workspaceBusy ? t.workingHint : !command.trim() ? t.commandPlaceholder : t.runCommand}
              >
                {commandIsRunning ? <X size={14} /> : <SquareTerminal size={14} />}
                {commandIsRunning ? t.cancelCommand : t.runCommandShort}
              </button>
            </div>
            <div className="command-history-slot" ref={workspaceOutputRef}>
              <CommandHistory
                title={t.commandHistory}
                liveEntry={workspaceLiveEntry}
                entries={commandHistory}
                onClear={() => {
                  setCommandHistory([]);
                  setCommandResult(null);
                }}
                t={t}
              />
            </div>
          </div>
        )}
        {selectedTool === "browser" && (
          <div className="tool-detail browser-detail" id="browser-tool-detail" ref={selectedToolDetailRef}>
            <div className="tool-detail-head">
              <p>{t.browserHelp}</p>
              <ExternalLink size={15} />
            </div>
            <form className="browser-toolbar" onSubmit={submitBrowserPreview}>
              <div className="browser-nav-actions" aria-label={t.browserPreview}>
                <button type="button" className="icon-only mini-icon" onClick={browserBack} title={t.browserBack} aria-label={t.browserBack} disabled={!browserPreviewUrl}>
                  <ArrowLeft size={14} />
                </button>
                <button type="button" className="icon-only mini-icon" onClick={browserForward} title={t.browserForward} aria-label={t.browserForward} disabled={!browserPreviewUrl}>
                  <ArrowRight size={14} />
                </button>
                <button type="button" className="icon-only mini-icon" onClick={browserReload} title={t.browserReload} aria-label={t.browserReload} disabled={!browserPreviewUrl}>
                  <RefreshCw size={14} className={browserStatus === "loading" ? "spin" : undefined} />
                </button>
              </div>
              <label>
                <span>URL</span>
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t.urlPlaceholder} />
              </label>
              <button type="submit" className="plain-action browser-preview-action" disabled={!url.trim()}>
                <Globe2 size={14} />
                {t.browserPreview}
              </button>
              <button type="button" className="plain-action subtle-action browser-external-action" onClick={() => onOpenBrowserUrl(normalizeBrowserUrl(url))} disabled={!url.trim()}>
                <ExternalLink size={14} />
                {t.openExternal}
              </button>
            </form>
            <div className={cx("browser-frame", browserStatus === "error" && "has-error")}>
              {!browserPreviewUrl && (
                <div className="browser-empty-panel">
                  <Globe2 size={18} />
                  <strong>{t.browserEmptyTitle}</strong>
                  <span>{t.browserEmptyHint}</span>
                </div>
              )}
              {browserError && (
                <div className="browser-error-panel">
                  <AlertTriangle size={16} />
                  <div>
                    <strong>{t.browserFailed}</strong>
                    <span>{browserError}</span>
                  </div>
                  <button type="button" className="plain-action subtle-action" data-browser-error-action="retry" onClick={browserReload}>
                    <RefreshCw size={13} />
                    {t.retry}
                  </button>
                  <button type="button" className="plain-action subtle-action" data-browser-error-action="external" onClick={() => onOpenBrowserUrl(browserPreviewUrl)}>
                    <ExternalLink size={13} />
                    {t.openExternal}
                  </button>
                </div>
              )}
              {browserPreviewUrl && <webview ref={browserWebviewRef} src={browserPreviewUrl} allowpopups="true" />}
            </div>
            <div className={cx("browser-status-row", browserStatus)}>
              <span>{browserStatus === "loading" ? t.browserLoading : browserStatus === "error" ? t.browserFailed : browserStatus === "idle" ? t.browserIdle : t.browserReady}</span>
              <small>{t.browserExternalHint}</small>
            </div>
            <section className="browser-history-section" aria-label={t.browserEvidence}>
              <div className="structured-registry-head">
                <div>
                  <span>{t.browserHistory}</span>
                  <strong>{browserVisits?.length ? t.browserVisitCount.replace("{count}", browserVisits.length) : t.browserNoHistory}</strong>
                </div>
              </div>
              <BrowserEvidenceList
                visits={browserVisits}
                onOpenVisit={(visit) => openBrowserPreviewUrl(visit?.url || browserVisitFinalUrl(visit), visit?.id)}
                onOpenExternalVisit={onOpenBrowserUrl ? (visit) => onOpenBrowserUrl(browserVisitFinalUrl(visit) || visit?.url) : null}
                t={t}
              />
            </section>
          </div>
        )}
        {selectedTool === "claude" && (
          <div className="tool-detail claude-command-detail" id="claude-tool-detail" ref={selectedToolDetailRef}>
            <div className="tool-detail-head">
              <p>{t.claudeCodeHelp}</p>
              <Bot size={15} />
            </div>
            <section className="claude-primary-card" aria-label={t.primaryActions}>
              <div className="primary-action-row">
                <button type="button" className="plain-action subtle-action" onClick={openInteractiveClaude}>
                  <SquareTerminal size={15} />
                  {t.interactiveClaude}
                </button>
                <button type="button" className="primary-action compact-action" onClick={() => runClaude()} disabled={claudeBusy || !claudeArgs.trim()} title={claudeBusy ? t.workingHint : !claudeArgs.trim() ? t.claudeArgsPlaceholder : undefined}>
                  {claudeBusy && claudeRequestId ? <RefreshCw size={14} className="spin" /> : <Bot size={14} />}
                  {claudeBusy && claudeRequestId ? t.commandRunning : t.runClaude}
                </button>
              </div>
              <label>
                <span>{t.claudeArgs}</span>
                <input value={claudeArgs} onChange={(event) => setClaudeArgs(event.target.value)} placeholder={t.claudeArgsPlaceholder} />
              </label>
              <div className="quick-command-row" aria-label={t.quickClaudeCommands}>
                {quickClaudeCommands.map((item) => (
                  <button
                    type="button"
                    className="plain-action subtle-action"
                    key={item.args}
                    onClick={() => {
                      setClaudeArgs(item.args);
                      runClaude(item.args);
                    }}
                    disabled={claudeBusy}
                    title={claudeBusy ? t.workingHint : item.args}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="tool-hint">{t.interactiveClaudeHelp}</p>
            </section>
            <RuntimeHealthCard
              claudeStatus={claudeStatus}
              settings={settings}
              activeProject={activeProject}
              t={t}
              onRetry={loadClaudeStatus}
              onOpenClaudePanel={openInteractiveClaude}
              onOpenRow={openRuntimeHealthTarget}
              onOpenIssue={openRuntimeHealthIssue}
              onRecordEvidence={recordRuntimeHealthEvidence}
              busy={statusBusy}
              compact
            />
            <dl className="tool-runtime-list">
              <div><dt>{t.auth}</dt><dd>{statusText}</dd></div>
              <div><dt>{t.model}</dt><dd>{settings?.model || "claude-sonnet-4-5-20250929"}</dd></div>
              {statusBaseUrl && <div><dt>{t.cliEnvSource}</dt><dd title={statusBaseUrl}>{compactPath(statusBaseUrl, 38)}</dd></div>}
            </dl>
            <details className="tool-subsection">
              <summary>{t.commandReference}</summary>
              <div className="tool-actions">
                <button type="button" className="plain-action" onClick={() => runClaude("--help")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.help}</button>
                <button type="button" className="plain-action" onClick={() => runClaude("auth status")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.auth}</button>
                <button type="button" className="plain-action" onClick={() => runClaude("agents --help")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.agents}</button>
                <button type="button" className="plain-action" onClick={() => runClaude("project --help")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.projectCommand}</button>
                <button type="button" className="plain-action" onClick={() => runClaude("plugin list")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.plugins}</button>
                <button type="button" className="plain-action" onClick={() => runClaude("plugin --help")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.pluginHelp}</button>
                <button type="button" className="plain-action" onClick={() => runClaude("plugin marketplace --help")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.marketplaceHelp}</button>
                <button type="button" className="plain-action" onClick={() => runClaude("plugin marketplace list")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.marketplace}</button>
                <button type="button" className="plain-action" onClick={() => runClaude("mcp list")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>MCP</button>
                <button type="button" className="plain-action" onClick={() => runClaude("mcp --help")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.mcpHelp}</button>
                <button type="button" className="plain-action" onClick={() => runClaude("doctor")} disabled={claudeBusy} title={claudeBusy ? t.workingHint : undefined}>{t.doctor}</button>
              </div>
            </details>
            <details className="tool-subsection">
              <summary>{t.pluginActions}</summary>
              <div className="plugin-installer">
                <label>
                  <span>{t.pluginName}</span>
                  <input value={pluginName} onChange={(event) => setPluginName(event.target.value)} placeholder={t.pluginNamePlaceholder} />
                </label>
                <div className="tool-actions">
                  <button type="button" className="plain-action" onClick={() => pluginName.trim() && runClaudeAndRefreshPlugins(`plugin install ${pluginName.trim()}`)} disabled={claudeBusy || !pluginName.trim()} title={claudeBusy ? t.workingHint : !pluginName.trim() ? t.pluginNameRequired : undefined}>{t.installPlugin}</button>
                  <button type="button" className="plain-action" onClick={() => pluginName.trim() && runClaudeAndRefreshPlugins(`plugin update ${pluginName.trim()}`)} disabled={claudeBusy || !pluginName.trim()} title={claudeBusy ? t.workingHint : !pluginName.trim() ? t.pluginNameRequired : undefined}>{t.updatePlugin}</button>
                  <button type="button" className="plain-action danger-action" onClick={() => pluginName.trim() && setConfirmingPluginAction(pluginName.trim())} disabled={claudeBusy || !pluginName.trim()} title={claudeBusy ? t.workingHint : !pluginName.trim() ? t.pluginNameRequired : undefined}>{t.disablePlugin}</button>
                </div>
                {confirmingPluginAction && (
                  <div className="dirty-confirm-banner" role="alertdialog">
                    <span>{t.confirmDisableWarning.replace("{name}", confirmingPluginAction)}</span>
                    <div className="dirty-confirm-actions">
                      <button type="button" className="plain-action" onClick={() => setConfirmingPluginAction(null)}>{t.dismissAction}</button>
                      <button
                        type="button"
                        className="danger-action"
                        onClick={() => {
                          runClaudeAndRefreshPlugins(`plugin disable ${confirmingPluginAction}`);
                          setConfirmingPluginAction(null);
                        }}
                      >
                        {t.confirmDisableButton}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="plugin-status-list">
                <div className="plugin-status-header">
                  <span>{t.installedPlugins}</span>
                  <button type="button" className="icon-only" onClick={loadPlugins} disabled={pluginsLoading} title={pluginsLoading ? t.workingHint : t.pluginRefresh} aria-label={t.pluginRefresh}>
                    <RefreshCw size={14} className={pluginsLoading ? "spin" : undefined} />
                  </button>
                </div>
                {pluginsLoading && !pluginItems && <p className="empty-list">{t.pluginsLoading}</p>}
                {pluginsError && <p className="empty-list">{pluginsError}</p>}
                {!pluginsLoading && !pluginsError && installedPluginItems.length === 0 && <p className="empty-list">{t.pluginsEmpty}</p>}
                {installedPluginItems.length > 0 && (
                  <div className="plugin-status-items">
                    {installedPluginItems.map((plugin) => (
                      <div className="plugin-status-item" key={plugin.id}>
                        <div>
                          <strong>{plugin.id}</strong>
                          <span title={plugin.installPath || ""}>
                            {[plugin.version && plugin.version !== "unknown" ? `v${plugin.version}` : "", plugin.scope, plugin.marketplace].filter(Boolean).join(" · ") || t.installedLocal}
                          </span>
                        </div>
                        <em className={cx("plugin-status-badge", plugin.enabled ? "enabled" : "disabled")}>
                          {plugin.enabled ? t.pluginStatusEnabled : t.pluginStatusDisabled}
                        </em>
                        {plugin.enabled ? (
                          <button
                            type="button"
                            className="plain-action"
                            onClick={() => setConfirmingPluginAction(plugin.id)}
                            disabled={claudeBusy}
                            title={claudeBusy ? t.workingHint : undefined}
                          >
                            {t.disablePlugin}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="plain-action"
                            onClick={() => runClaudeAndRefreshPlugins(`plugin enable ${plugin.id}`)}
                            disabled={claudeBusy}
                            title={claudeBusy ? t.workingHint : undefined}
                          >
                            {t.enablePlugin}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
            <section className="plugin-status-list claude-panel-structured-status" aria-label={t.mcpServers}>
              <div className="plugin-status-header">
                <span>{t.mcpServers}</span>
                <button type="button" className="icon-only" onClick={loadClaudeStatus} disabled={statusBusy} title={statusBusy ? t.workingHint : t.refreshStatus} aria-label={t.refreshStatus}>
                  <RefreshCw size={14} className={statusBusy ? "spin" : undefined} />
                </button>
              </div>
              {mcpPanelItems.length === 0 && <p className="empty-list">{t.noMcpServers}</p>}
              {mcpPanelItems.length > 0 && (
                <div className="plugin-status-items">
                  {mcpPanelItems.slice(0, 8).map((server) => {
                    const display = mcpPanelDisplay(server, t);
                    const rowKey = `${display.name}:${server?.raw || server?.detail || ""}`;
                    const meta = [
                      display.detail,
                      typeof server.tools === "number" ? `${t.tools}: ${server.tools}` : "",
                      server.transport,
                      server.source,
                      server.error,
                    ].filter(Boolean).join(" · ");
                    return (
                      <div className="plugin-status-item claude-panel-mcp-row" key={rowKey}>
                        <div>
                          <strong>{display.name}</strong>
                          <span title={server.raw || server.detail || meta}>{meta || server.detail || server.raw || t.mcpServers}</span>
                        </div>
                        <em className={cx("plugin-status-badge", server.status)}>{mcpStatusLabel(server.status, t)}</em>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="plugin-status-list claude-panel-structured-status" aria-label={t.marketplace}>
              <div className="plugin-status-header">
                <span>{t.marketplace}</span>
                <button type="button" className="icon-only" onClick={loadClaudeStatus} disabled={statusBusy} title={statusBusy ? t.workingHint : t.refreshStatus} aria-label={t.refreshStatus}>
                  <RefreshCw size={14} className={statusBusy ? "spin" : undefined} />
                </button>
              </div>
              {marketplacePanelSources.length === 0 && marketplacePanelPlugins.length === 0 && <p className="empty-list">{t.noCliOutputYet}</p>}
              {marketplacePanelSources.length > 0 && (
                <div className="plugin-status-items">
                  {marketplacePanelSources.slice(0, 6).map((marketplace) => (
                    <div className="plugin-status-item claude-panel-marketplace-row" key={marketplace.name}>
                      <div>
                        <strong>{marketplace.name}</strong>
                        <span title={marketplace.repo || marketplace.installLocation || marketplace.source}>
                          {[marketplace.version, marketplace.status, marketplace.repo || marketplace.installLocation || marketplace.source].filter(Boolean).join(" · ") || t.marketplaceSources}
                        </span>
                      </div>
                      <em className="plugin-status-badge enabled">{marketplace.status || marketplace.source || t.source}</em>
                    </div>
                  ))}
                </div>
              )}
              {marketplacePanelPlugins.length > 0 && (
                <div className="plugin-status-items">
                  {marketplacePanelPlugins.slice(0, 8).map((plugin) => (
                    <div className="plugin-status-item claude-panel-marketplace-plugin" key={plugin.id}>
                      <div>
                        <strong>{plugin.name || plugin.id}</strong>
                        <span title={summarizePanelPluginField(plugin.source || plugin.description || plugin.permissions)}>
                          {[plugin.version && plugin.version !== "unknown" ? `v${plugin.version}` : "", plugin.marketplace, plugin.author, summarizePanelPluginField(plugin.permissions)].filter(Boolean).join(" · ") || t.marketplaceCatalog}
                        </span>
                      </div>
                      <em className={cx("plugin-status-badge", plugin.installed ? "enabled" : "disabled")}>{plugin.installed ? t.installedLocal : t.marketplace}</em>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <div className="command-history-slot" ref={claudeOutputRef}>
              <CommandHistory
                title={t.commandHistory}
                liveEntry={claudeLiveEntry}
                entries={claudeHistory}
                onRetryEntry={(entry) => {
                  const args = claudeArgsFromRun(entry);
                  if (args) runClaude(args);
                }}
                retryDisabled={claudeBusy}
                onClear={() => {
                  setClaudeHistory([]);
                  setClaudeResult(null);
                }}
                t={t}
              />
            </div>
          </div>
        )}
        {selectedTool === "terminal" && (
          <div className="tool-detail" id="terminal-tool-detail" ref={selectedToolDetailRef}>
            <div className="tool-detail-head">
              <p>{t.terminalHelp}</p>
              <SquareTerminal size={15} />
            </div>
            <p className="tool-hint">{t.opensExternalTerminal}</p>
            <dl>
              <div><dt>{t.activeProject}</dt><dd>{projectLabel(activeProject, t)}</dd></div>
              <div className="path-row">
                <dt>{t.path}</dt>
                <dd title={activeProject?.path || t.noProjectPath}>{activeProject?.path ? compactPath(activeProject.path, 36) : t.noProjectPath}</dd>
                {activeProject?.path && (
                  <button type="button" className="icon-only mini-icon" onClick={copyProjectPath} title={pathCopied ? t.copiedPath : t.copyPath} aria-label={pathCopied ? t.copiedPath : t.copyPath}>
                    {pathCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
              </div>
            </dl>
            <div className="tool-actions">
              <button type="button" className="plain-action" onClick={onOpenTerminal}><SquareTerminal size={15} />{t.openTerminal}</button>
              <button type="button" className="plain-action" onClick={onOpenProject}><Folder size={15} />{t.openProject}</button>
            </div>
          </div>
        )}

        <details className="status-details">
          <summary>{t.pluginsAndMcp}</summary>
          <pre>{`${claudeStatus?.plugins || ""}\n\n${claudeStatus?.mcp || ""}`.trim() || "No plugin or MCP output yet."}</pre>
        </details>
      </section>
    </aside>
  );
}

function FileTreeItem({ item, activePath, onOpenFile, depth = 0, expandedDirs, lazyChildren, onToggleDir }) {
  const isDirectory = item.type === "directory";
  const isExpanded = isDirectory && expandedDirs.has(item.path);
  const children = lazyChildren[item.path] ?? item.children;
  const childrenLoading = lazyChildren[item.path] === "loading";

  return (
    <div className="tree-node" style={{ "--depth": depth }}>
      <button
        type="button"
        className={cx("tree-item", activePath === item.path && "active")}
        onClick={() => {
          if (isDirectory) onToggleDir(item);
          else onOpenFile(item);
        }}
        title={item.path}
      >
        {isDirectory ? (
          <ChevronRight size={12} className={cx("tree-chevron", isExpanded && "expanded")} />
        ) : (
          <span className="tree-chevron-spacer" />
        )}
        {isDirectory ? <Folder size={14} /> : <FileText size={14} />}
        <span>{item.name}</span>
        {!isDirectory && typeof item.size === "number" && <small>{item.size < 1024 ? `${item.size}b` : `${Math.round(item.size / 1024)}kb`}</small>}
      </button>
      {isDirectory && isExpanded && (
        <div className="tree-children">
          {childrenLoading && <p className="empty-list tree-loading">Loading…</p>}
          {!childrenLoading && Array.isArray(children) && children.length === 0 && (
            <p className="empty-list tree-loading">Empty</p>
          )}
          {!childrenLoading && Array.isArray(children) && children.length > 0 && children.map((child) => (
            <FileTreeItem
              item={child}
              activePath={activePath}
              onOpenFile={onOpenFile}
              depth={depth + 1}
              key={child.path}
              expandedDirs={expandedDirs}
              lazyChildren={lazyChildren}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsModal({
  state,
  lang,
  t,
  onClose,
  onSaved,
  onOpenTool,
  onOpenBottomPanel,
  onOpenCapabilities,
  onOpenProjects,
  surface = false,
  initialSection = "general",
}) {
  const initialForm = {
    provider: state.settings.provider,
    model: state.settings.model,
    baseUrl: state.settings.baseUrl,
    temperature: state.settings.temperature,
    timeoutMs: state.settings.timeoutMs || 600000,
    language: state.settings.language === "system" ? "system" : "zh",
    appearance: {
      fontSize: state.settings.appearance?.fontSize || "compact",
      density: state.settings.appearance?.density || "compact",
    },
    systemPrompt: state.settings.systemPrompt,
    claudeCode: {
      executionMode: state.settings.claudeCode?.executionMode || "claude-code",
      claudeCommand: state.settings.claudeCode?.claudeCommand || "claude",
      permissionMode: state.settings.claudeCode?.permissionMode || "default",
      effort: state.settings.claudeCode?.effort || "",
      agent: state.settings.claudeCode?.agent || "",
      allowedTools: state.settings.claudeCode?.allowedTools || "",
      disallowedTools: state.settings.claudeCode?.disallowedTools || "",
      tools: state.settings.claudeCode?.tools || "",
      addDirs: state.settings.claudeCode?.addDirs || "",
      mcpConfig: state.settings.claudeCode?.mcpConfig || "",
      pluginDir: state.settings.claudeCode?.pluginDir || "",
      pluginUrl: state.settings.claudeCode?.pluginUrl || "",
      settings: state.settings.claudeCode?.settings || "",
      settingSources: state.settings.claudeCode?.settingSources || "",
      fallbackModel: state.settings.claudeCode?.fallbackModel || "",
      maxBudgetUsd: state.settings.claudeCode?.maxBudgetUsd || "",
      sessionName: state.settings.claudeCode?.sessionName || "",
      extraArgs: state.settings.claudeCode?.extraArgs || "",
      safeMode: Boolean(state.settings.claudeCode?.safeMode),
      bareMode: Boolean(state.settings.claudeCode?.bareMode),
      ide: Boolean(state.settings.claudeCode?.ide),
      chromeMode: state.settings.claudeCode?.chromeMode || "default",
      strictMcpConfig: Boolean(state.settings.claudeCode?.strictMcpConfig),
      noSessionPersistence: Boolean(state.settings.claudeCode?.noSessionPersistence),
      axScreenReader: Boolean(state.settings.claudeCode?.axScreenReader),
      verbose: Boolean(state.settings.claudeCode?.verbose),
    },
    apiKey: "",
    customMarketplaces: Array.isArray(state.settings.customMarketplaces) ? state.settings.customMarketplaces : [],
  };
  const [form, setForm] = useState(initialForm);
  const initialSnapshotRef = useRef(JSON.stringify(initialForm));
  const [saveStatus, setSaveStatus] = useState("idle");
  const [error, setError] = useState("");
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [settingsQuery, setSettingsQuery] = useState("");
  const [settingsEnvironment, setSettingsEnvironment] = useState(null);
  const [settingsClaudeStatus, setSettingsClaudeStatus] = useState(null);
  const [settingsStatusBusy, setSettingsStatusBusy] = useState(false);
  const [settingsStatusError, setSettingsStatusError] = useState("");
  const activeProvider = providerDefaults(form.provider);
  const directApiActive = form.claudeCode.executionMode === "api";
  const savedKey = Boolean(state.settings.apiKeys?.[form.provider]);
  const providerNeedsApiKey = activeProvider.authMode !== "none";
  const runtimeModelLabel = form.model || activeProvider.model;
  const runtimeAuthLabel = directApiActive
    ? !providerNeedsApiKey
      ? t.apiKeyNone
      : savedKey
        ? t.savedKey
        : t.missingKey
    : authLabel(null, state.settings);
  const runtimeEnvLabel = directApiActive
    ? form.baseUrl || activeProvider.baseUrl
    : cliBaseUrl(state.settings) || t.claudeCodeDefaultEnv;
  const runtimeHealthSettings = {
    ...state.settings,
    model: form.model,
    claudeCode: {
      ...state.settings.claudeCode,
      ...form.claudeCode,
    },
  };
  const saving = saveStatus === "saving";
  const isDirty = JSON.stringify(form) !== initialSnapshotRef.current;
  const modalRef = useRef(null);
  useFocusTrap(modalRef, !surface);
  const settingsSections = [
    ["general", t.settingsGeneral, Settings],
    ["profile", t.settingsProfile, UserRound],
    ["appearance", t.settingsAppearance, Monitor],
    ["configuration", t.settingsConfiguration, Wrench],
    ["personalization", t.settingsPersonalization, Shield],
    ["mcp", t.settingsMcpServers, Blocks],
    ["browser", t.settingsBrowser, Globe2],
    ["computer", t.settingsComputerUse, Monitor],
    ["hooks", t.settingsHooks, Plug],
    ["connections", t.settingsConnections, ExternalLink],
    ["git", t.settingsGit, GitBranch],
    ["environments", t.settingsEnvironments, HardDrive],
    ["worktrees", t.settingsWorktrees, Folder],
    ["archived", t.settingsArchivedChats, Archive],
  ];
  const validSettingsSectionIds = new Set(settingsSections.map(([id]) => id));
  const normalizedInitialSection = validSettingsSectionIds.has(initialSection) ? initialSection : "general";
  const [activeSection, setActiveSection] = useState(normalizedInitialSection);
  const filteredSettingsSections = settingsSections.filter(([id, label]) => {
    const normalized = settingsQuery.trim().toLowerCase();
    return !normalized || `${id} ${label}`.toLowerCase().includes(normalized);
  });
  const backedSettingsSections = new Set([
    "profile",
    "personalization",
    "mcp",
    "browser",
    "computer",
    "hooks",
    "connections",
    "git",
    "environments",
    "worktrees",
    "archived",
  ]);

  async function refreshSettingsStatus() {
    if (!desktopApi) return;
    setSettingsStatusBusy(true);
    setSettingsStatusError("");
    try {
      const [environmentResult, claudeResult] = await Promise.allSettled([
        desktopApi.getEnvironment?.({ projectPath: state.activeProject?.path }),
        desktopApi.getClaudeStatus?.({ projectPath: state.activeProject?.path }),
      ]);
      if (environmentResult.status === "fulfilled" && environmentResult.value) {
        setSettingsEnvironment(environmentResult.value);
      }
      if (claudeResult.status === "fulfilled" && claudeResult.value) {
        setSettingsClaudeStatus(claudeResult.value);
      }
      const failures = [environmentResult, claudeResult].filter((result) => result.status === "rejected");
      if (failures.length) setSettingsStatusError(failures.map((result) => result.reason?.message || String(result.reason)).join("\n"));
    } catch (statusError) {
      setSettingsStatusError(statusError.message || String(statusError));
    } finally {
      setSettingsStatusBusy(false);
    }
  }

  useEffect(() => {
    refreshSettingsStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeProject?.path]);
  useEffect(() => {
    setActiveSection(normalizedInitialSection);
  }, [normalizedInitialSection]);

  function updateProvider(providerId) {
    const next = providerDefaults(providerId);
    setForm((current) => ({
      ...current,
      provider: providerId,
      model: next.model,
      baseUrl: next.baseUrl,
      apiKey: "",
    }));
  }

  function requestClose() {
    if (isDirty && saveStatus !== "saved") {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }

  function requestDeepLink(action) {
    if (isDirty && saveStatus !== "saved") {
      setConfirmingClose(true);
      return;
    }
    action?.();
  }

  function openRuntimeHealthTargetName(target) {
    if (target === "plugins" || target === "skills" || target === "mcp" || target === "marketplace") {
      requestDeepLink(() => onOpenCapabilities?.(target));
      return;
    }
    if (target === "claude") {
      requestDeepLink(() => onOpenTool?.("claude"));
    }
  }

  function openRuntimeHealthTarget(row) {
    openRuntimeHealthTargetName(runtimeHealthTargetForRow(row));
  }

  function openRuntimeHealthIssue(issue) {
    openRuntimeHealthTargetName(runtimeHealthTargetForIssue(issue));
  }

  const settingsBody = (
      <form
        ref={modalRef}
        tabIndex={-1}
        role={surface ? "region" : "dialog"}
        aria-modal={surface ? undefined : "true"}
        aria-label={t.settingsTitle}
        className={surface ? "settings-surface" : "settings-modal"}
        onMouseDown={(event) => {
          if (!surface) event.stopPropagation();
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          setSaveStatus("saving");
          setError("");
          try {
            const nextState = await desktopApi.saveSettings(form);
            onSaved(nextState);
            setSaveStatus("saved");
            initialSnapshotRef.current = JSON.stringify(form);
            if (!surface) setTimeout(onClose, 450);
          } catch (saveError) {
            setSaveStatus("error");
            setError(saveError.message || "Could not save settings.");
          }
        }}
      >
        <header>
          <div>
            {surface && (
              <button type="button" className="surface-back" onClick={requestClose}>
                <ArrowLeft size={15} />
                {t.backToApp}
              </button>
            )}
            <span>{t.settingsSubtitle}</span>
            <h2>{t.settingsTitle}</h2>
            {isDirty && saveStatus === "idle" && <em className="dirty-flag" title={t.unsavedChangesHint}>{t.unsavedChanges}</em>}
          </div>
          <button type="button" className="icon-only" onClick={requestClose} title={t.close}>
            <X size={18} />
          </button>
        </header>
        {confirmingClose && (
          <div className="dirty-confirm-banner" role="alertdialog">
            <span>{t.unsavedChangesWarning}</span>
            <div className="dirty-confirm-actions">
              <button type="button" className="plain-action" onClick={() => setConfirmingClose(false)}>{t.keepEditing}</button>
              <button type="button" className="danger-action" onClick={onClose}>{t.discardChanges}</button>
            </div>
          </div>
        )}

        <div className="settings-shell">
          <nav className="settings-nav" aria-label={t.settingsTitle}>
            <label className="settings-search">
              <Search size={15} />
              <input value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder={t.searchSettings} />
            </label>
            {filteredSettingsSections.map(([id, label, Icon]) => (
              <button type="button" key={id} className={cx(activeSection === id && "active")} data-settings-section={id} onClick={() => setActiveSection(id)}>
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {activeSection === "general" || activeSection === "configuration" ? (
        <div className="settings-layout">
          <section className="settings-section settings-runtime-section">
            <div className="settings-section-head">
              <div>
                <span>{t.activeRuntime}</span>
                <h3>{directApiActive ? t.apiMode : t.claudeCodeManagedTitle}</h3>
              </div>
              <em className={cx("settings-badge", directApiActive ? "api" : "cli")}>
                {directApiActive ? t.apiMode : t.claudeCodeMode}
              </em>
            </div>
            <div className="settings-runtime-card">
              {!directApiActive && <p>{t.claudeCodeManagedHint}</p>}
              <dl className="settings-summary runtime-summary">
                <div><dt>{t.auth}</dt><dd>{runtimeAuthLabel}</dd></div>
                <div><dt>{t.model}</dt><dd>{runtimeModelLabel}</dd></div>
                <div><dt>{directApiActive ? t.baseUrl : t.cliEnvSource}</dt><dd title={runtimeEnvLabel}>{runtimeEnvLabel}</dd></div>
              </dl>
            </div>
            {!directApiActive && (
              <RuntimeHealthCard
                claudeStatus={settingsClaudeStatus}
                settings={runtimeHealthSettings}
                activeProject={state.activeProject}
                t={t}
                onRetry={refreshSettingsStatus}
                onOpenClaudePanel={() => requestDeepLink(() => onOpenTool?.("claude"))}
                onOpenRow={openRuntimeHealthTarget}
                onOpenIssue={openRuntimeHealthIssue}
                busy={settingsStatusBusy}
              />
            )}
            <div className="settings-grid runtime-control-grid">
              <label>
                <span>{t.language}</span>
                <select value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}>
                  <option value="system">{t.followSystem}</option>
                  <option value="zh">{t.chinese}</option>
                </select>
              </label>
              <label>
                <span>{t.executionMode}</span>
                <select value={form.claudeCode.executionMode} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, executionMode: event.target.value } }))}>
                  <option value="claude-code">{t.claudeCodeMode}</option>
                  <option value="api">{t.apiMode}</option>
                </select>
              </label>
              <label>
                <span>{t.permissionMode}</span>
                <select value={form.claudeCode.permissionMode} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, permissionMode: event.target.value } }))}>
                  <option value="default">{t.permissionModeDefault}</option>
                  <option value="acceptEdits">{t.permissionModeAcceptEdits}</option>
                  <option value="auto">{t.permissionModeAuto}</option>
                  <option value="plan">{t.permissionModePlan}</option>
                  <option value="dontAsk">{t.permissionModeDontAsk}</option>
                  <option value="bypassPermissions">{t.permissionModeBypassPermissions}</option>
                </select>
              </label>
            </div>
            {!directApiActive && (
              <details className="settings-inline-disclosure">
                <summary>
                  <span>{t.settingsAdvancedClaude}</span>
                  <em>{t.showMore}</em>
                </summary>
                <div className="settings-grid compact-settings-grid">
                  <label>
                    <span>{t.claudeModel}</span>
                    <input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder={activeProvider.model} />
                  </label>
                  <label>
                    <span>{t.effort}</span>
                    <select value={form.claudeCode.effort} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, effort: event.target.value } }))}>
                      <option value="">{t.effortDefault}</option>
                      <option value="low">{t.effortLow}</option>
                      <option value="medium">{t.effortMedium}</option>
                      <option value="high">{t.effortHigh}</option>
                      <option value="xhigh">{t.effortXhigh}</option>
                      <option value="max">{t.effortMax}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t.claudeCommand}</span>
                    <input value={form.claudeCode.claudeCommand} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, claudeCommand: event.target.value } }))} placeholder="claude" />
                  </label>
                  <label>
                    <span>{t.claudeAgent}</span>
                    <input value={form.claudeCode.agent} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, agent: event.target.value } }))} placeholder={t.claudeAgentPlaceholder} />
                  </label>
                  <label>
                    <span>{t.timeout}</span>
                    <input type="number" min="1000" step="1000" value={form.timeoutMs} onChange={(event) => setForm((current) => ({ ...current, timeoutMs: event.target.value }))} />
                  </label>
                  <label>
                    <span>{t.sessionName}</span>
                    <input value={form.claudeCode.sessionName} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, sessionName: event.target.value } }))} placeholder={t.sessionNamePlaceholder} />
                  </label>
                  <label>
                    <span>{t.allowedTools}</span>
                    <input value={form.claudeCode.allowedTools} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, allowedTools: event.target.value } }))} placeholder={t.toolsPlaceholder} />
                  </label>
                  <label>
                    <span>{t.disallowedTools}</span>
                    <input value={form.claudeCode.disallowedTools} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, disallowedTools: event.target.value } }))} placeholder={t.toolsPlaceholder} />
                  </label>
                  <label>
                    <span>{t.toolsList}</span>
                    <input value={form.claudeCode.tools} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, tools: event.target.value } }))} placeholder={t.toolsListPlaceholder} />
                  </label>
                  <label>
                    <span>{t.fallbackModel}</span>
                    <input value={form.claudeCode.fallbackModel} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, fallbackModel: event.target.value } }))} placeholder={t.fallbackModelPlaceholder} />
                  </label>
                  <label>
                    <span>{t.maxBudgetUsd}</span>
                    <input type="number" min="0" step="0.01" value={form.claudeCode.maxBudgetUsd} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, maxBudgetUsd: event.target.value } }))} placeholder="0.00" />
                  </label>
                  <label>
                    <span>{t.chromeMode}</span>
                    <select value={form.claudeCode.chromeMode} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, chromeMode: event.target.value } }))}>
                      <option value="default">{t.chromeDefault}</option>
                      <option value="on">{t.chromeOn}</option>
                      <option value="off">{t.chromeOff}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t.settingSources}</span>
                    <input value={form.claudeCode.settingSources} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, settingSources: event.target.value } }))} placeholder={t.settingSourcesPlaceholder} />
                  </label>
                  <label className="span-2">
                    <span>{t.settingsFile}</span>
                    <input value={form.claudeCode.settings} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, settings: event.target.value } }))} placeholder={t.settingsFilePlaceholder} />
                  </label>
                  <label className="span-2">
                    <span>{t.addDirs}</span>
                    <textarea value={form.claudeCode.addDirs} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, addDirs: event.target.value } }))} placeholder={t.addDirsPlaceholder} />
                  </label>
                  <label className="span-2">
                    <span>{t.mcpConfig}</span>
                    <textarea value={form.claudeCode.mcpConfig} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, mcpConfig: event.target.value } }))} placeholder={t.mcpConfigPlaceholder} />
                  </label>
                  <label className="span-2">
                    <span>{t.pluginDir}</span>
                    <textarea value={form.claudeCode.pluginDir} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, pluginDir: event.target.value } }))} placeholder={t.pluginDirPlaceholder} />
                  </label>
                  <label className="span-2">
                    <span>{t.pluginUrl}</span>
                    <textarea value={form.claudeCode.pluginUrl} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, pluginUrl: event.target.value } }))} placeholder={t.pluginUrlPlaceholder} />
                  </label>
                  <label className="span-2">
                    <span>{t.extraClaudeArgs}</span>
                    <textarea value={form.claudeCode.extraArgs} onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, extraArgs: event.target.value } }))} placeholder={t.extraClaudeArgsPlaceholder} />
                  </label>
                </div>
                <div className="settings-grid checkbox-settings-grid">
                  {[
                    ["safeMode", t.safeMode],
                    ["bareMode", t.bareMode],
                    ["ide", t.autoIde],
                    ["strictMcpConfig", t.strictMcpConfig],
                    ["noSessionPersistence", t.noSessionPersistence],
                    ["axScreenReader", t.axScreenReader],
                    ["verbose", t.verboseOutput],
                  ].map(([key, label]) => (
                    <label className="settings-checkbox" key={key}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.claudeCode[key])}
                        onChange={(event) => setForm((current) => ({ ...current, claudeCode: { ...current.claudeCode, [key]: event.target.checked } }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="settings-section-copy">{t.cliFlagsHint}</p>
                <p className="settings-section-copy">{t.slashCommandHint}</p>
              </details>
            )}
          </section>

          <details className={cx("settings-section", "settings-disclosure", !directApiActive && "inactive")} open={directApiActive}>
            <summary>
              <div>
                <span>{t.settingsDirectApi}</span>
                <strong>{directApiActive ? form.baseUrl || activeProvider.baseUrl : t.settingsDirectApiInactive}</strong>
              </div>
              <em>{directApiActive ? t.enabled : t.inactiveInClaudeCode}</em>
            </summary>
            <p className="settings-section-copy">{directApiActive ? t.settingsDirectApiHint : t.settingsDirectApiInactiveHint}</p>
            {directApiActive && (
              <p className="settings-section-copy">
                {t.providerPresetHint
                  .replace("{style}", activeProvider.apiStyle || "OpenAI-compatible")
                  .replace("{auth}", providerAuthLabel(activeProvider, t))
                  .replace("{note}", activeProvider.note || "")}
              </p>
            )}
            <div className="settings-grid direct-api-grid">
              <label>
                <span>{t.provider}</span>
                <select value={form.provider} onChange={(event) => updateProvider(event.target.value)} disabled={!directApiActive} title={!directApiActive ? t.inactiveInClaudeCode : undefined}>
                  {providers.map((provider) => (
                    <option value={provider.id} key={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                <span>{t.model}</span>
                <input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder={activeProvider.model} disabled={!directApiActive} title={!directApiActive ? t.inactiveInClaudeCode : undefined} />
              </label>
              <label className="span-2">
                <span>{t.baseUrl}</span>
                <input value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder={activeProvider.baseUrl} disabled={!directApiActive} title={!directApiActive ? t.inactiveInClaudeCode : undefined} />
              </label>
              <label>
                <span>{t.apiKey}</span>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                  placeholder={!providerNeedsApiKey ? t.apiKeyNone : savedKey ? t.apiKeySaved : t.apiKeyPlaceholder}
                  disabled={!directApiActive || !providerNeedsApiKey}
                  title={!directApiActive ? t.inactiveInClaudeCode : !providerNeedsApiKey ? t.apiKeyNone : undefined}
                />
              </label>
            </div>
            <details className="settings-inline-disclosure">
              <summary>
                <span>{t.settingsAdvancedApi}</span>
                <em>{t.showMore}</em>
              </summary>
              <div className="settings-grid compact-settings-grid">
                <label>
                  <span>{t.temperature}</span>
                  <input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => setForm((current) => ({ ...current, temperature: event.target.value }))} disabled={!directApiActive} title={!directApiActive ? t.inactiveInClaudeCode : undefined} />
                </label>
                <label>
                  <span>{t.timeout}</span>
                  <input type="number" min="1000" step="1000" value={form.timeoutMs} onChange={(event) => setForm((current) => ({ ...current, timeoutMs: event.target.value }))} disabled={!directApiActive} title={!directApiActive ? t.inactiveInClaudeCode : undefined} />
                </label>
              </div>
            </details>
          </details>

          <details className="settings-section settings-disclosure">
            <summary>
              <div>
                <span>{t.settingsPrompt}</span>
                <strong>{t.systemPrompt}</strong>
              </div>
              <em>{t.showMore}</em>
            </summary>
            <label className="settings-prompt-field">
              <span>{t.systemPrompt}</span>
              <textarea value={form.systemPrompt} onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))} />
            </label>
          </details>

          <details className="settings-section settings-disclosure">
            <summary>
              <div>
                <span>{t.settingsStorage}</span>
                <strong>{state.settings.encryptionAvailable ? t.savedKey : t.missingKey}</strong>
              </div>
              <em>{t.showMore}</em>
            </summary>
            <div className="settings-note">
              <KeyRound size={15} />
              <span>
                {t.encryption}: {state.settings.encryptionAvailable ? "是" : "否"} · {t.dataFile}: {state.settings.dataFile}
              </span>
            </div>
            <div className="settings-note">
              <Languages size={15} />
              <span>
                {t.env}: Anthropic {state.settings.env?.anthropicKey ? "已找到" : "未找到"}, OpenAI {state.settings.env?.openaiKey ? "已找到" : "未找到"} · 系统语言 {state.settings.appLocale || navigator.language}
              </span>
            </div>
          </details>
        </div>
            ) : activeSection === "appearance" ? (
        <div className="settings-layout">
          <section className="settings-section">
            <div className="settings-section-head">
              <div>
                <span>{t.settingsAppearance}</span>
                <h3>{t.interfaceLanguage}</h3>
              </div>
              <em className="settings-badge">{form.language === "system" ? t.followSystem : t.chinese}</em>
            </div>
            <div className="settings-grid runtime-control-grid">
              <label>
                <span>{t.interfaceLanguage}</span>
                <select value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}>
                  <option value="system">{t.followSystem}</option>
                  <option value="zh">{t.chinese}</option>
                </select>
              </label>
              <label>
                <span>{t.fontSize}</span>
                <select
                  value={form.appearance.fontSize}
                  onChange={(event) => setForm((current) => ({ ...current, appearance: { ...current.appearance, fontSize: event.target.value } }))}
                >
                  <option value="compact">{t.fontSizeCompact}</option>
                  <option value="default">{t.fontSizeDefault}</option>
                  <option value="large">{t.fontSizeLarge}</option>
                </select>
              </label>
              <label>
                <span>{t.density}</span>
                <select
                  value={form.appearance.density}
                  onChange={(event) => setForm((current) => ({ ...current, appearance: { ...current.appearance, density: event.target.value } }))}
                >
                  <option value="compact">{t.densityCompact}</option>
                  <option value="comfortable">{t.densityComfortable}</option>
                </select>
              </label>
            </div>
          </section>
          <section className="settings-section">
            <div className="settings-section-head">
              <div>
                <span>{t.settingsGeneral}</span>
                <h3>{t.defaultPermissions}</h3>
              </div>
              <em className="settings-badge cli">{t.claudeCodeMode}</em>
            </div>
            <p className="settings-section-copy">{t.claudeCodeManagedHint}</p>
          </section>
        </div>
            ) : (
              backedSettingsSections.has(activeSection) ? (
                <SettingsBackedStatus
                  activeSection={activeSection}
                  settingsSections={settingsSections}
                  state={state}
                  form={form}
                  environment={settingsEnvironment}
                  claudeStatus={settingsClaudeStatus}
                  busy={settingsStatusBusy}
                  error={settingsStatusError}
                  onRefresh={refreshSettingsStatus}
                  onOpenTool={(tool) => requestDeepLink(() => onOpenTool?.(tool))}
                  onOpenBottomPanel={(panel) => requestDeepLink(() => onOpenBottomPanel?.(panel))}
                  onOpenCapabilities={(target) => requestDeepLink(() => onOpenCapabilities?.(target))}
                  onOpenProjects={() => requestDeepLink(onOpenProjects)}
                  t={t}
                />
              ) : (
              <section className="settings-placeholder">
                <div>
                  <span>{settingsSections.find(([id]) => id === activeSection)?.[1]}</span>
                  <h3>{t.notImplementedYet}</h3>
                  <p>{t.notImplementedHint}</p>
                </div>
              </section>
              )
            )}
          </div>
        </div>

        {error && <p className="settings-error">{error}</p>}
        <footer className="settings-footer">
          <span>{isDirty ? t.unsavedChangesHint : t.noChangesToSave}</span>
          <button className={cx("primary-action", saveStatus === "saved" && "save-success")} type="submit" disabled={saving || (!isDirty && saveStatus !== "error")} title={saving ? t.workingHint : undefined}>
            <Check size={17} />
            {saveStatus === "saving" ? t.saving : saveStatus === "saved" ? t.saved : t.save}
          </button>
        </footer>
      </form>
  );
  if (surface) {
    return <main className="workspace settings-workspace">{settingsBody}</main>;
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={requestClose}>
      {settingsBody}
    </div>
  );
}

function ShellModal({ title, subtitle, onClose, children, className = "", closeLabel = "关闭", surface = false }) {
  const modalRef = useRef(null);
  useFocusTrap(modalRef, !surface);
  const shellBody = (
      <section
        ref={modalRef}
        tabIndex={-1}
        role={surface ? "region" : "dialog"}
        aria-modal={surface ? undefined : "true"}
        aria-label={title}
        className={cx(surface ? "surface-panel" : "settings-modal", "shell-modal", className)}
        onMouseDown={(event) => {
          if (!surface) event.stopPropagation();
        }}
      >
        <header>
          <div>
            {surface && (
              <button type="button" className="surface-back" onClick={onClose}>
                <ArrowLeft size={15} />
                {closeLabel}
              </button>
            )}
            {subtitle && <span>{subtitle}</span>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-only" onClick={onClose} title={closeLabel} aria-label={closeLabel}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
  );
  if (surface) return <main className="workspace shell-workspace">{shellBody}</main>;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      {shellBody}
    </div>
  );
}

function CapabilityModal({ state, lang, t, onClose, onToggle, onSaved, onOpenClaudePanel, onNotice, onRunEvent, onOpenBottomPanel, onOpenWorkspaceFile, onCommandRuns, onStatus, surface = false, initialTab = "plugins", focus = null }) {
  const tabs = [
    ["plugins", t.plugins],
    ["mcp", t.mcps],
    ["skills", t.skills],
    ["marketplace", t.marketplace],
  ];
  const [activeTab, setActiveTab] = useState(initialTab || "plugins");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [cliStatus, setCliStatus] = useState(null);
  const [cliBusy, setCliBusy] = useState(false);
  const [cliError, setCliError] = useState("");
  const [cliAction, setCliAction] = useState("");
  const [cliActionEvidence, setCliActionEvidence] = useState(null);
  const [confirmingCliCommand, setConfirmingCliCommand] = useState(null);
  const [copiedPluginId, setCopiedPluginId] = useState("");
  const [copiedSkillId, setCopiedSkillId] = useState("");
  const [copiedMarketplacePluginId, setCopiedMarketplacePluginId] = useState("");
  const [copiedMarketplaceSourceId, setCopiedMarketplaceSourceId] = useState("");
  const [copiedMcpServerKey, setCopiedMcpServerKey] = useState("");
  const [copiedMcpEvidenceKey, setCopiedMcpEvidenceKey] = useState("");
  const [copiedCustomMarketplace, setCopiedCustomMarketplace] = useState("");
  const [marketplaceOutput, setMarketplaceOutput] = useState("");
  const [marketplaceBusy, setMarketplaceBusy] = useState(false);
  const [customMarketplaceUrl, setCustomMarketplaceUrl] = useState("");
  const [capabilityActionFocus, setCapabilityActionFocus] = useState({ tab: "", kind: "", id: "", query: "", nonce: 0 });
  const manualCapabilityTabSwitchRef = useRef(0);
  const activeProject = state.activeProject || { name: t.localWorkspace, path: "" };
  const customMarketplaces = Array.isArray(state.settings.customMarketplaces) ? state.settings.customMarketplaces : [];
  const capabilityRows = capabilityCatalog.map((item) => ({
    ...item,
    enabled: capabilityEnabled(state.settings, item.id),
  }));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = capabilityRows.filter((item) => {
    const matchesQuery = !normalizedQuery || [item.id, item.type, item.name, item.description]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
    const matchesFilter =
      filter === "all" ||
      (filter === "enabled" && item.enabled) ||
      (filter === "disabled" && !item.enabled);
    return matchesQuery && matchesFilter;
  });
  const tabRows = {
    plugins: visibleRows.filter((item) => item.type === "plugin"),
    skills: visibleRows.filter((item) => item.type === "skill"),
    mcp: visibleRows.filter((item) => item.type === "tool" && /mcp/i.test(item.id + item.name + item.description)),
  };
  const installedPluginRows = (Array.isArray(cliStatus?.pluginItems) ? cliStatus.pluginItems : []).filter((item) => structuredQueryMatch(item, normalizedQuery));
  const marketplaceRows = (Array.isArray(cliStatus?.marketplaces) ? cliStatus.marketplaces : []).filter((item) => structuredQueryMatch(item, normalizedQuery));
  const marketplacePluginRows = (Array.isArray(cliStatus?.marketplacePlugins) ? cliStatus.marketplacePlugins : []).filter((item) => structuredQueryMatch(item, normalizedQuery));
  const mcpServerRows = (Array.isArray(cliStatus?.mcpServers) ? cliStatus.mcpServers : []).filter((item) => structuredQueryMatch(item, normalizedQuery));
  const rawSkillRows = Array.isArray(cliStatus?.skillItems) ? cliStatus.skillItems : Array.isArray(cliStatus?.skills) ? cliStatus.skills : [];
  const skillRegistryRoots = Array.isArray(cliStatus?.skillRoots) ? cliStatus.skillRoots.filter(Boolean) : [];
  const skillRegistryTruncated = Boolean(cliStatus?.skillsTruncated);
  const skillRegistryKnown = Boolean(cliStatus);
  const hasRegisteredSkills = rawSkillRows.length > 0;
  const skillRegistryRows = rawSkillRows.filter((item) => structuredQueryMatch(item, normalizedQuery));
  const fallbackSkillRows = skillRegistryKnown && !hasRegisteredSkills ? tabRows.skills : [];
  const skillTabRows = hasRegisteredSkills ? skillRegistryRows : fallbackSkillRows;
  const enabledCount = capabilityRows.filter((item) => item.type !== "skill" && item.enabled).length
    + (hasRegisteredSkills ? rawSkillRows.length : skillRegistryKnown ? capabilityRows.filter((item) => item.type === "skill" && item.enabled).length : 0);
  const totalCount = capabilityRows.filter((item) => item.type !== "skill").length
    + (hasRegisteredSkills ? rawSkillRows.length : skillRegistryKnown ? capabilityRows.filter((item) => item.type === "skill").length : 0);
  const installedCapabilityRows = [
    ...capabilityRows.filter((item) => item.type !== "skill" && item.enabled),
    ...(hasRegisteredSkills
      ? rawSkillRows.map((skill) => ({ ...skill, type: "skill", enabled: true }))
      : skillRegistryKnown ? capabilityRows.filter((item) => item.type === "skill" && item.enabled) : []),
  ];
  const customMarketplaceRows = customMarketplaces.filter((item) => structuredQueryMatch({ name: item, repo: item, source: item }, normalizedQuery));
  const marketplaceTabCount = marketplacePluginRows.length + marketplaceRows.length + customMarketplaceRows.length;
  const recentCapabilityRuns = useMemo(() => capabilityRunsNewestFirst(state.commandRuns), [state.commandRuns]);
  const recentMarketplaceActionRun = findRecentMarketplaceActionRun(recentCapabilityRuns);
  const recentMcpActionRun = findRecentMcpActionRun(recentCapabilityRuns);
  const cliWorking = cliBusy || marketplaceBusy || Boolean(cliAction);
  const cliStatusIssueByTab = {
    plugins: cliStatusIssue(t.plugins, "plugin list", cliStatus?.pluginCommand, t, "plugin list --json"),
    mcp: cliStatusIssue(t.mcps, "mcp list", cliStatus?.mcpCommand, t),
    marketplace: cliStatusIssue(t.marketplace, "plugin marketplace list", cliStatus?.marketplaceCommand, t, "plugin marketplace list --json"),
  };
  const cliStatusIssues = Object.values(cliStatusIssueByTab).filter(Boolean);
  const searchPlaceholder =
    activeTab === "skills" ? t.searchSkills : activeTab === "marketplace" ? t.searchMarketplace : t.searchPlugins;
  const focusedCapabilityKind = String(focus?.kind || "").trim();
  const focusedCapabilityId = String(focus?.id || "").trim();
  const actionFocusedCapabilityKind = String(capabilityActionFocus?.kind || "").trim();
  const actionFocusedCapabilityId = String(capabilityActionFocus?.id || "").trim();
  const hasFocusedCapability = Boolean(
    (focusedCapabilityKind && focusedCapabilityId) ||
    (actionFocusedCapabilityKind && actionFocusedCapabilityId),
  );

  function capabilityFocusMatches(kind, ...ids) {
    const normalizedIds = ids.map((id) => String(id || "").trim()).filter(Boolean);
    if (!normalizedIds.length) return false;
    return [
      [focusedCapabilityKind, focusedCapabilityId],
      [actionFocusedCapabilityKind, actionFocusedCapabilityId],
    ].some(([focusKind, focusId]) => (
      focusKind === kind &&
      Boolean(focusId) &&
      normalizedIds.includes(String(focusId || "").trim())
    ));
  }

  function selectCapabilityTab(id) {
    if (id !== activeTab) {
      manualCapabilityTabSwitchRef.current += 1;
      if (capabilityActionFocus?.nonce) {
        const actionQuery = String(capabilityActionFocus.query || capabilityActionFocus.id || "").trim();
        if (!actionQuery || query.trim() === actionQuery) {
          setQuery("");
          setFilter("all");
          setCapabilityActionFocus({ tab: "", kind: "", id: "", query: "", nonce: 0 });
        }
      }
    }
    setActiveTab(id);
  }

  function recordCapabilityNotice(title, detail, key = "", focus = null) {
    onNotice?.({
      level: "error",
      source: "plugin/mcp",
      title,
      detail,
      key: key || `capability:${title}:${detail}`,
      action: capabilityActionFromFocus(focus),
      projectPath: activeProject?.path || "",
    });
  }

  function recordRuntimeHealthNotice(summary) {
    const payload = runtimeHealthNoticePayload(summary, activeProject, t);
    if (!payload) return;
    const alreadyKnown = (state.notices || []).some((notice) => notice.key === payload.key);
    if (alreadyKnown) return;
    onNotice?.(payload);
  }

  async function refreshCliStatus() {
    if (!desktopApi?.getClaudeStatus) return;
    setCliBusy(true);
    setCliError("");
    try {
      const result = await desktopApi.getClaudeStatus({ projectPath: activeProject?.path });
      setCliStatus(result);
      onStatus?.(result);
      recordRuntimeHealthNotice(runtimeHealthSummary(result, state.settings, activeProject, t));
    } catch (error) {
      const message = error.message || String(error);
      setCliError(message);
      recordCapabilityNotice(`${t.capabilities}: ${t.refreshCliStatus}`, message, "capability:refresh-status");
    } finally {
      setCliBusy(false);
    }
  }

  async function fetchMarketplace() {
    if (!desktopApi?.runClaudeCommand) return;
    const args = "plugin marketplace list";
    const requestId = `marketplace_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setMarketplaceBusy(true);
    setCliError("");
    onRunEvent?.({
      id: requestId,
      type: "capability-cli",
      status: "running",
      title: `${t.marketplace}: claude ${args}`,
      detail: projectLabel(activeProject, t),
      commandLine: `claude ${args}`,
      cwd: activeProject?.path || "",
    });
    let result = null;
    try {
      result = await desktopApi.runClaudeCommand({
        projectPath: activeProject?.path,
        args,
        requestId,
        persistCommandRun: true,
        commandRunKind: "capability",
      });
      if (Array.isArray(result.commandRuns)) onCommandRuns?.(result.commandRuns);
      const evidence = cliActionEvidenceFromResult(args, result);
      setCliActionEvidence(evidence);
      onRunEvent?.({
        id: requestId,
        type: "capability-cli",
        status: evidence.status,
        title: `${t.marketplace}: claude ${args}`,
        detail: cliActionEvidenceDetail(evidence, t),
        commandLine: `claude ${args}`,
        cwd: result.cwd || activeProject?.path || "",
        stdout: evidence.stdout,
        stderr: evidence.stderr,
        code: evidence.code,
        durationMs: evidence.durationMs,
        suppressNotice: true,
      });
      onOpenBottomPanel?.("outputs");
      if (result.code !== 0) throw new Error(result.stderr || result.stdout || t.pluginsLoadError);
      setMarketplaceOutput(result.stdout || result.stderr || t.noCliOutputYet);
      await refreshCliStatus();
    } catch (error) {
      const message = error.message || String(error);
      if (!result) {
        const evidence = cliActionEvidenceFromResult(args, null, { code: 1, stderr: message });
        setCliActionEvidence(evidence);
        onRunEvent?.({
          id: requestId,
          type: "capability-cli",
          status: "error",
          title: `${t.marketplace}: claude ${args}`,
          detail: cliActionEvidenceDetail(evidence, t),
          commandLine: `claude ${args}`,
          cwd: activeProject?.path || "",
          stderr: evidence.stderr,
          code: evidence.code,
          durationMs: evidence.durationMs,
          suppressNotice: true,
        });
        onOpenBottomPanel?.("outputs");
      }
      setCliError(message);
      recordCapabilityNotice(`${t.marketplace}: ${t.fetchMarketplace}`, message, "capability:fetch-marketplace", { tab: "marketplace" });
      setMarketplaceOutput(result?.stdout || result?.stderr || message);
    } finally {
      setMarketplaceBusy(false);
    }
  }

  async function runCapabilityClaude(args) {
    const nextArgs = String(args || "").trim();
    if (!desktopApi?.runClaudeCommand || !nextArgs) return;
    const requestId = `capability_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const nextActionFocus = capabilityActionFocusForCommand(nextArgs, {
      marketplaces: Array.isArray(cliStatus?.marketplaces) ? cliStatus.marketplaces : marketplaceRows,
    });
    const actionTabSwitchGeneration = manualCapabilityTabSwitchRef.current;
    setCliAction(nextArgs);
    setCliError("");
    onRunEvent?.({
      id: requestId,
      type: "capability-cli",
      status: "running",
      title: `${t.pluginActions}: claude ${nextArgs}`,
      detail: projectLabel(activeProject, t),
      commandLine: `claude ${nextArgs}`,
      cwd: activeProject?.path || "",
    });
    let result = null;
    try {
      result = await desktopApi.runClaudeCommand({
        projectPath: activeProject?.path,
        args: nextArgs,
        requestId,
        persistCommandRun: true,
        commandRunKind: "capability",
      });
      if (Array.isArray(result.commandRuns)) onCommandRuns?.(result.commandRuns);
      const evidence = cliActionEvidenceFromResult(nextArgs, result);
      setCliActionEvidence(evidence);
      onRunEvent?.({
        id: requestId,
        type: "capability-cli",
        status: evidence.status,
        title: `${t.pluginActions}: claude ${nextArgs}`,
        detail: cliActionEvidenceDetail(evidence, t),
        commandLine: `claude ${nextArgs}`,
        cwd: result.cwd || activeProject?.path || "",
        stdout: evidence.stdout,
        stderr: evidence.stderr,
        code: evidence.code,
        durationMs: evidence.durationMs,
        suppressNotice: true,
      });
      onOpenBottomPanel?.("outputs");
      if (result.code !== 0) throw new Error(result.stderr || result.stdout || t.pluginsLoadError);
      if (/plugin marketplace/i.test(nextArgs)) setMarketplaceOutput(result.stdout || result.stderr || "");
      await refreshCliStatus();
      if (nextActionFocus && manualCapabilityTabSwitchRef.current === actionTabSwitchGeneration) {
        setActiveTab(nextActionFocus.tab);
        setFilter("all");
        setQuery(nextActionFocus.query || nextActionFocus.id || "");
        setCapabilityActionFocus({ ...nextActionFocus, nonce: Date.now() });
      }
    } catch (error) {
      const message = error.message || String(error);
      if (!result) {
        const evidence = cliActionEvidenceFromResult(nextArgs, null, { code: 1, stderr: message });
        setCliActionEvidence(evidence);
        onRunEvent?.({
          id: requestId,
          type: "capability-cli",
          status: "error",
          title: `${t.pluginActions}: claude ${nextArgs}`,
          detail: cliActionEvidenceDetail(evidence, t),
          commandLine: `claude ${nextArgs}`,
          cwd: activeProject?.path || "",
          stderr: evidence.stderr,
          code: evidence.code,
          durationMs: evidence.durationMs,
          suppressNotice: true,
        });
        onOpenBottomPanel?.("outputs");
      }
      setCliError(message);
      recordCapabilityNotice(`${t.pluginActions}: ${nextArgs}`, message, `capability:action:${nextArgs}`, nextActionFocus);
      if (nextActionFocus && manualCapabilityTabSwitchRef.current === actionTabSwitchGeneration) {
        setActiveTab(nextActionFocus.tab);
        setFilter("all");
        setQuery(nextActionFocus.query || nextActionFocus.id || "");
        setCapabilityActionFocus({ ...nextActionFocus, nonce: Date.now() });
      }
    } finally {
      setCliAction("");
    }
  }

  function marketplaceInstallReviewRows(item) {
    return [
      [t.marketplace, item.marketplace || t.marketplaceSourceClaude],
      item.version && item.version !== "unknown" ? [t.version, item.version] : null,
      item.author ? [t.author, item.author] : null,
      item.category ? [t.category, item.category] : null,
      item.source ? [t.source, item.source] : null,
      item.permissions ? [t.allowedTools, item.permissions] : null,
      [t.marketplaceRisk, item.risk || t.marketplaceInstallRisk],
    ].filter(Boolean);
  }

  function marketplaceUpdateReviewRows() {
    const sourceRows = marketplaceRows.slice(0, 4).map((item, index) => [
      `${t.marketplace} ${index + 1}`,
      [item.name, item.status, item.source, item.repo || item.installLocation].filter(Boolean).join(" · ") || item.name,
    ]);
    return [
      [t.commandCwd, activeProject?.path || t.localWorkspace],
      ...sourceRows,
      customMarketplaceRows.length ? [t.customMarketplaces, `${customMarketplaceRows.length} · ${t.customMarketplaceNotInjected}`] : null,
      [t.marketplaceRisk, t.marketplaceUpdateRisk],
    ].filter(Boolean);
  }

  function requestCapabilityClaude(args, label = "", reviewRows = []) {
    const nextArgs = String(args || "").trim();
    if (!nextArgs || cliWorking) return;
    setConfirmingCliCommand({ args: nextArgs, label: label || nextArgs, reviewRows });
  }

  async function confirmCapabilityClaude() {
    const command = confirmingCliCommand?.args;
    setConfirmingCliCommand(null);
    await runCapabilityClaude(command);
  }

  function mcpServerKey(server) {
    return `${server?.name || ""}:${server?.raw || server?.detail || ""}`;
  }

  async function copyPluginEvidence(plugin) {
    const id = String(plugin?.id || plugin?.name || "").trim();
    const evidence = pluginEvidenceText(plugin, t);
    if (!id || !evidence) return;
    try {
      await navigator.clipboard?.writeText(evidence);
    } catch (_error) {
      // Clipboard permissions vary by shell; visible feedback still records the copy intent.
    }
    setCopiedPluginId(id);
    window.setTimeout(() => setCopiedPluginId((current) => (current === id ? "" : current)), 1200);
  }

  async function copySkillEvidence(skill) {
    const id = String(skill?.id || skill?.name || skill?.path || "").trim();
    const evidence = skillEvidenceText(skill, t);
    if (!id || !evidence) return;
    try {
      await navigator.clipboard?.writeText(evidence);
    } catch (_error) {
      // Clipboard permissions vary by shell; visible feedback still records the copy intent.
    }
    setCopiedSkillId(id);
    window.setTimeout(() => setCopiedSkillId((current) => (current === id ? "" : current)), 1200);
  }

  function openSkillWorkspaceFile(skill) {
    const relativePath = String(skill?.relativePath || "").trim();
    const root = String(skill?.root || "").trim();
    if (!relativePath || !root) return;
    onOpenWorkspaceFile?.(relativePath, {
      projectPath: root,
      projectLabel: skill?.name || skill?.id || t.skills,
      force: true,
    });
    onClose?.();
  }

  function pinSkillEvidence(skill) {
    const skillId = String(skill?.id || skill?.name || skill?.path || "").trim();
    const evidence = skillEvidenceText(skill, t);
    if (!skillId || !evidence) return;
    const eventId = `skill_registry_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    onRunEvent?.({
      id: eventId,
      type: "skill-registry",
      status: "ok",
      title: `${t.skillRegistryEvidence}: ${skill.name || skillId}`,
      detail: skill.description || skill.path || "",
      cwd: skill.root || activeProject?.path || "",
      path: skill.relativePath || skill.path || "",
      stdout: evidence,
      project: skill.root ? { name: skill.name || t.skills, path: skill.root } : activeProject,
      action: skill.relativePath && skill.root ? `workspace:file:${encodeURIComponent(skill.relativePath)}` : "",
      suppressNotice: true,
    });
    onOpenBottomPanel?.("outputs");
    onClose?.();
  }

  async function copyMarketplacePluginEvidence(plugin) {
    const id = String(plugin?.id || plugin?.name || "").trim();
    const evidence = marketplacePluginEvidenceText(plugin, t);
    if (!id || !evidence) return;
    try {
      await navigator.clipboard?.writeText(evidence);
    } catch (_error) {
      // Clipboard permissions vary by shell; visible feedback still records the copy intent.
    }
    setCopiedMarketplacePluginId(id);
    window.setTimeout(() => setCopiedMarketplacePluginId((current) => (current === id ? "" : current)), 1200);
  }

  async function copyMarketplaceSourceEvidence(source) {
    const id = String(source?.name || source?.repo || source?.source || "").trim();
    const evidence = marketplaceSourceEvidenceText(source, t);
    if (!id || !evidence) return;
    try {
      await navigator.clipboard?.writeText(evidence);
    } catch (_error) {
      // Clipboard permissions vary by shell; visible feedback still records the copy intent.
    }
    setCopiedMarketplaceSourceId(id);
    window.setTimeout(() => setCopiedMarketplaceSourceId((current) => (current === id ? "" : current)), 1200);
  }

  async function copyMcpServerRaw(server) {
    const raw = String(server?.raw || server?.detail || server?.name || "").trim();
    const key = mcpServerKey(server);
    try {
      await navigator.clipboard?.writeText(raw);
    } catch (_error) {
      // Clipboard permissions vary by shell; the visible UI feedback still records the user's copy intent.
    }
    setCopiedMcpServerKey(key);
    window.setTimeout(() => setCopiedMcpServerKey((current) => (current === key ? "" : current)), 1200);
  }

  async function copyMcpServerEvidence(server) {
    const key = mcpServerKey(server);
    const evidence = mcpServerEvidenceText(server, t);
    if (!key || !evidence) return;
    try {
      await navigator.clipboard?.writeText(evidence);
    } catch (_error) {
      // Clipboard permissions vary by shell; visible feedback still records the copy intent.
    }
    setCopiedMcpEvidenceKey(key);
    window.setTimeout(() => setCopiedMcpEvidenceKey((current) => (current === key ? "" : current)), 1200);
  }

  async function copyCustomMarketplaceUrl(url) {
    const value = String(url || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard?.writeText(value);
    } catch (_error) {
      // Clipboard permissions vary by shell; keep visible feedback for the user's copy intent.
    }
    setCopiedCustomMarketplace(value);
    window.setTimeout(() => setCopiedCustomMarketplace((current) => (current === value ? "" : current)), 1200);
  }

  async function saveCustomMarketplaces(items) {
    if (!desktopApi?.saveSettings) return;
    try {
      const nextState = await desktopApi.saveSettings({
        ...state.settings,
        customMarketplaces: items,
        apiKey: "",
      });
      onSaved?.(nextState);
    } catch (error) {
      const message = error.message || String(error);
      setCliError(message);
      recordCapabilityNotice(`${t.marketplace}: ${t.customMarketplaces}`, message, "capability:save-custom-marketplaces");
    }
  }

  async function addCustomMarketplace(event) {
    event.preventDefault();
    const value = customMarketplaceUrl.trim();
    if (!value || customMarketplaces.includes(value)) return;
    await saveCustomMarketplaces([value, ...customMarketplaces].slice(0, 12));
    setCustomMarketplaceUrl("");
  }

  function openRuntimeHealthTargetName(target) {
    if (target === "plugins" || target === "skills" || target === "mcp" || target === "marketplace") {
      setQuery("");
      setActiveTab(target);
      return;
    }
    if (target === "claude") onOpenClaudePanel?.();
  }

  function openRuntimeHealthTarget(row) {
    openRuntimeHealthTargetName(runtimeHealthTargetForRow(row));
  }

  function openRuntimeHealthIssue(issue) {
    openRuntimeHealthTargetName(runtimeHealthTargetForIssue(issue));
  }

  function openCapabilityOutputs() {
    onOpenBottomPanel?.("outputs");
    onClose?.();
  }

  function recordRuntimeHealthEvidence(summary, evidenceText) {
    const eventId = `runtime_health_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    onRunEvent?.({
      id: eventId,
      type: "runtime-health",
      status: summary?.status === "ok" ? "ok" : summary?.status === "pending" ? "running" : "error",
      title: t.runtimeHealthEvidence,
      detail: summary?.headline || "",
      cwd: activeProject?.path || "",
      stdout: evidenceText,
      code: Array.isArray(summary?.issues) ? summary.issues.length : null,
      suppressNotice: true,
    });
    onOpenBottomPanel?.("outputs");
  }

  useEffect(() => {
    refreshCliStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.path]);
  useEffect(() => {
    if (tabs.some(([id]) => id === initialTab)) setActiveTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);
  useEffect(() => {
    if (!capabilityActionFocus?.nonce || activeTab === capabilityActionFocus.tab) return;
    setQuery("");
    setFilter("all");
    setCapabilityActionFocus({ tab: "", kind: "", id: "", query: "", nonce: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  useEffect(() => {
    if (!focus?.nonce) return;
    if (tabs.some(([id]) => id === focus.tab)) setActiveTab(focus.tab);
    setFilter("all");
    setQuery(String(focus.query || focus.id || "").trim());
    setCapabilityActionFocus({ tab: "", kind: "", id: "", query: "", nonce: 0 });
    if (focus.confirmCommand?.args) {
      setConfirmingCliCommand({
        args: String(focus.confirmCommand.args || "").trim(),
        label: String(focus.confirmCommand.label || focus.confirmCommand.args || "").trim(),
        reviewRows: Array.isArray(focus.confirmCommand.reviewRows) ? focus.confirmCommand.reviewRows : [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  useEffect(() => {
    if (!hasFocusedCapability) return undefined;
    const timer = window.setTimeout(() => {
      document.querySelector(".focused-capability-row")?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focus?.nonce, capabilityActionFocus?.nonce, hasFocusedCapability, focusedCapabilityKind, focusedCapabilityId, actionFocusedCapabilityKind, actionFocusedCapabilityId, activeTab, cliStatus, normalizedQuery]);
  return (
    <ShellModal title={t.capabilities} subtitle={t.capabilitiesSubtitle} onClose={onClose} closeLabel={surface ? t.backToApp : t.close} className="capability-modal plugin-manager-modal" surface={surface}>
      <div className="installed-capability-strip" aria-label={t.installed}>
        {installedCapabilityRows.slice(0, 14).map((item) => (
          <button
            type="button"
            key={item.path || item.id}
            className={cx("installed-capability-icon", item.type)}
            title={item.name}
            onClick={() => {
              setQuery(item.name);
              setActiveTab(item.type === "skill" ? "skills" : item.type === "plugin" ? "plugins" : "mcp");
            }}
          >
            {item.type === "plugin" ? <Plug size={15} /> : item.type === "skill" ? <Blocks size={15} /> : <SquareTerminal size={15} />}
          </button>
        ))}
      </div>
      <section className="plugin-cli-summary" aria-label={t.installedCliState}>
        <div>
          <span>{t.installedCliState}</span>
          <strong>{cliBusy ? `${t.loading}...` : cliStatus?.available ? cliStatus.version || t.ready : t.needsKey}</strong>
          <small>{projectLabel(activeProject, t)}</small>
        </div>
        <button type="button" className="plain-action subtle-action" onClick={refreshCliStatus} disabled={cliWorking} title={cliWorking ? t.workingHint : t.refreshCliStatus}>
          <RefreshCw size={14} className={cliBusy ? "spin" : undefined} />
          {t.refresh}
        </button>
      </section>
      <RuntimeHealthCard
        claudeStatus={cliStatus}
        settings={state.settings}
        activeProject={activeProject}
        t={t}
        onRetry={refreshCliStatus}
        onOpenClaudePanel={onOpenClaudePanel}
        onOpenRow={openRuntimeHealthTarget}
        onOpenIssue={openRuntimeHealthIssue}
        onRecordEvidence={recordRuntimeHealthEvidence}
        busy={cliWorking}
      />
      {cliStatusIssues.length > 0 && (
        <section className="plugin-status-issues" aria-label={t.capabilityStatusIssues}>
          <div className="plugin-status-issues-head">
            <AlertTriangle size={15} />
            <div>
              <span>{t.capabilityStatusIssues}</span>
              <strong>{t.capabilityStatusIssueCount.replace("{count}", cliStatusIssues.length)}</strong>
            </div>
            <div className="plugin-status-issues-actions">
              <button type="button" className="plain-action subtle-action" onClick={refreshCliStatus} disabled={cliWorking} title={cliWorking ? t.workingHint : t.refreshCliStatus}>
                <RefreshCw size={13} className={cliBusy ? "spin" : undefined} />
                {t.retryCliStatus}
              </button>
              <button type="button" className="plain-action subtle-action" onClick={onOpenClaudePanel}>
                <Bot size={13} />
                {t.openClaudePanel}
              </button>
            </div>
          </div>
          <p>{t.capabilityStatusBackedByStatus}</p>
          <div className="plugin-status-issue-list">
            {cliStatusIssues.map((issue) => (
              <article className="plugin-status-issue-row" key={issue.id}>
                <div>
                  <strong>{issue.label}</strong>
                  <span>claude {issue.commandLine}</span>
                </div>
                <em>{t.commandExit}: {issue.code}</em>
                {issue.error && <code title={issue.error}>{messageExcerpt(issue.error, 220)}</code>}
              </article>
            ))}
          </div>
        </section>
      )}
      {cliError && <p className="plugin-cli-error">{cliError}</p>}
      {cliActionEvidence && (
        <section className={cx("plugin-cli-action-evidence", cliActionEvidence.status)} aria-label={t.pluginActionEvidence}>
          <div className="plugin-cli-action-head">
            <div>
              <span>{t.pluginActionEvidence}</span>
              <strong>{cliActionEvidence.status === "ok" ? t.commandSucceeded : t.commandFailed}</strong>
            </div>
            <time>{formatDate(cliActionEvidence.endedAt, lang)}</time>
          </div>
          <dl className="plugin-cli-action-meta">
            <div><dt>{t.commandLine}</dt><dd title={cliActionEvidence.args}>claude {messageExcerpt(cliActionEvidence.args, 96)}</dd></div>
            <div><dt>{t.commandExit}</dt><dd>{cliActionEvidence.code}</dd></div>
            <div><dt>{t.commandDuration}</dt><dd>{typeof cliActionEvidence.durationMs === "number" ? `${cliActionEvidence.durationMs}ms` : "-"}</dd></div>
          </dl>
          {(cliActionEvidence.stdout || cliActionEvidence.stderr) && (
            <details className="plugin-cli-action-output">
              <summary>{t.rawOutput}</summary>
              {cliActionEvidence.stdout && (
                <section>
                  <span>{t.commandStdout}</span>
                  <pre>{messageExcerpt(cliActionEvidence.stdout, 1400)}</pre>
                </section>
              )}
              {cliActionEvidence.stderr && (
                <section>
                  <span>{t.commandStderr}</span>
                  <pre>{messageExcerpt(cliActionEvidence.stderr, 1400)}</pre>
                </section>
              )}
            </details>
          )}
        </section>
      )}
      {confirmingCliCommand && (
        <div className="dirty-confirm-banner plugin-cli-confirm" role="alertdialog" aria-label={t.confirmCliActionTitle}>
          <div className="plugin-cli-confirm-body">
            <span>{t.confirmCliActionWarning.replace("{command}", confirmingCliCommand.label || confirmingCliCommand.args)}</span>
            <code>{confirmingCliCommand.args}</code>
            {Array.isArray(confirmingCliCommand.reviewRows) && confirmingCliCommand.reviewRows.length > 0 && (
              <dl className="plugin-cli-confirm-meta" aria-label={t.marketplaceInstallReview}>
                {confirmingCliCommand.reviewRows.map(([label, value]) => (
                  <div key={`${label}:${value}`}>
                    <dt>{label}</dt>
                    <dd title={value}>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className="dirty-confirm-actions">
            <button type="button" className="plain-action" onClick={() => setConfirmingCliCommand(null)}>{t.dismissAction}</button>
            <button type="button" className="danger-action" onClick={confirmCapabilityClaude} disabled={cliWorking} title={cliWorking ? t.workingHint : undefined}>
              {t.confirmCliActionButton}
            </button>
          </div>
        </div>
      )}
      <div className="capability-toolbar">
        <label className="command-search capability-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />
        </label>
        <div className="segmented-control" aria-label={t.capabilities}>
          {[
            ["all", t.capabilityAll],
            ["enabled", t.capabilityEnabled],
            ["disabled", t.capabilityDisabled],
          ].map(([id, label]) => (
            <button type="button" key={id} className={cx(filter === id && "active")} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <p>{t.capabilitySummary.replace("{enabled}", enabledCount).replace("{total}", totalCount)}</p>
      </div>
      <div className="plugin-manager-tabs" role="tablist" aria-label={t.capabilities}>
        {tabs.map(([id, label]) => {
          const count = id === "plugins" ? installedPluginRows.length || capabilityRows.filter((item) => item.type === "plugin").length
            : id === "skills" ? (hasRegisteredSkills ? rawSkillRows.length : skillRegistryKnown ? capabilityRows.filter((item) => item.type === "skill").length : 0)
              : id === "mcp" ? mcpServerRows.length || tabRows.mcp.length
                : marketplaceTabCount;
          const issue = cliStatusIssueByTab[id];
          return (
            <button type="button" key={id} className={cx(activeTab === id && "active", issue && "status-error")} onClick={() => selectCapabilityTab(id)} role="tab" aria-selected={activeTab === id}>
              <span>{label}</span>
              <em>{count}</em>
              {issue && <em className="plugin-tab-status-badge" title={`${issue.commandLine}: ${issue.error || issue.code}`}>!</em>}
            </button>
          );
        })}
      </div>
      <div className="plugin-manager-list">
        {activeTab === "marketplace" ? (
          <div className="marketplace-workbench">
            <CliStatusDetail
              issue={cliStatusIssueByTab.marketplace}
              t={t}
              onRetry={refreshCliStatus}
              onOpenClaudePanel={onOpenClaudePanel}
              disabled={cliWorking}
              spinning={cliBusy}
            />
            <section className="marketplace-card">
              <div className="marketplace-card-head">
                <div>
                  <span>{t.marketplaceSourceClaude}</span>
                  <strong>{t.marketplaceSources}</strong>
                </div>
                <div className="marketplace-actions">
                  <button type="button" className="plain-action subtle-action" onClick={onOpenClaudePanel}>
                    <Bot size={14} />
                    {t.openClaudePanel}
                  </button>
                  <button type="button" className="plain-action subtle-action" onClick={() => requestCapabilityClaude("plugin marketplace update", `${t.updatePlugin}: ${t.marketplace}`, marketplaceUpdateReviewRows())} disabled={cliWorking} title={cliWorking ? t.workingHint : undefined}>
                    <RefreshCw size={14} className={cliAction === "plugin marketplace update" ? "spin" : undefined} />
                    {t.updatePlugin}
                  </button>
                  <button type="button" className="plain-action" onClick={fetchMarketplace} disabled={cliWorking} title={cliWorking ? t.workingHint : t.fetchMarketplace}>
                    <RefreshCw size={14} className={marketplaceBusy ? "spin" : undefined} />
                    {marketplaceBusy ? t.loading : t.fetchMarketplace}
                  </button>
                </div>
              </div>
              <p>{t.marketplaceHint}</p>
              <div className="marketplace-source-list structured-source-list">
                {marketplaceRows.length === 0 && <p className="empty-list">{t.noCliOutputYet}</p>}
                {marketplaceRows.map((item) => {
                  const sourceFocused = capabilityFocusMatches("marketplace-source", item.name);
                  const sourceRetry = sourceFocused && recentMarketplaceActionRun && recentMarketplaceActionRun.code !== 0
                    ? () => requestCapabilityClaude("plugin marketplace update", `${t.updatePlugin}: ${t.marketplace}`, marketplaceUpdateReviewRows())
                    : null;
                  const sourceMeta = [
                    item.version ? [t.version, item.version] : null,
                    item.status ? [t.status, item.status] : null,
                    item.installLocation ? [t.installPath, compactPath(item.installLocation, 72), item.installLocation] : null,
                    item.permissions ? [t.allowedTools, messageExcerpt(item.permissions, 72), item.permissions] : null,
                    item.tools ? [t.tools, messageExcerpt(item.tools, 72), item.tools] : null,
                    item.error ? [t.mcpError, messageExcerpt(item.error, 72), item.error] : null,
                  ].filter(Boolean);
                  return (
                    <article
                      className={cx("marketplace-source-row structured-source-row", sourceFocused && "focused-capability-row")}
                      key={item.name}
                      data-marketplace-source-id={item.name}
                    >
                      <div>
                        <strong>{item.name}</strong>
                        <span title={item.repo || item.source}>{item.repo || item.source || t.marketplaceSourceClaude}</span>
                        {sourceMeta.length > 0 && (
                          <dl className="structured-row-meta marketplace-source-meta" aria-label={`${item.name} marketplace metadata`}>
                            {sourceMeta.map(([label, value, title]) => (
                              <div key={`${label}:${value}`}>
                                <dt>{label}</dt>
                                <dd title={title || value}>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                      <div className="marketplace-source-actions">
                        <em>{item.status || item.source || t.source}</em>
                        <button type="button" className="plain-action subtle-action" data-marketplace-source-action="copy-evidence" onClick={() => copyMarketplaceSourceEvidence(item)} disabled={cliWorking} title={cliWorking ? t.workingHint : copiedMarketplaceSourceId === item.name ? t.copied : t.copyEvidence}>
                          {copiedMarketplaceSourceId === item.name ? <Check size={13} /> : <Copy size={13} />}
                          {copiedMarketplaceSourceId === item.name ? t.copied : t.copyEvidence}
                        </button>
                      </div>
                      <RowCliActionEvidence run={sourceFocused ? recentMarketplaceActionRun : null} t={t} onOpenOutputs={openCapabilityOutputs} onRetry={sourceRetry} />
                    </article>
                  );
                })}
              </div>
              <details className="raw-output-details">
                <summary>{t.rawOutput}</summary>
                <pre className="settings-raw-output marketplace-output">{marketplaceOutput || cliStatus?.marketplaceOutput || t.noCliOutputYet}</pre>
              </details>
              <RowCliActionEvidence run={recentMarketplaceActionRun} t={t} onOpenOutputs={openCapabilityOutputs} />
            </section>
            <section className="marketplace-card">
              <div className="marketplace-card-head">
                <div>
                  <span>{t.marketplaceSourceClaude}</span>
                  <strong>{t.marketplaceCatalog}</strong>
                </div>
                <em className="settings-badge">{t.marketplacePluginCount.replace("{count}", marketplacePluginRows.length)}</em>
              </div>
              <div className="marketplace-plugin-grid">
                {marketplacePluginRows.length === 0 && <p className="empty-list">{t.noMarketplacePlugins}</p>}
                {marketplacePluginRows.slice(0, 80).map((item) => {
                  const recentRun = findRecentPluginActionRun(recentCapabilityRuns, [item.id, item.name], ["install", "update"]);
                  const pluginFocused = capabilityFocusMatches("marketplace-plugin", item.id, item.name);
                  const pluginRetry = pluginFocused && recentRun && recentRun.code !== 0
                    ? () => requestCapabilityClaude(`plugin install ${item.id}`, `${t.installFromMarketplace}: ${item.name || item.id}`, marketplaceInstallReviewRows(item))
                    : null;
                  return (
                    <article
                      className={cx("marketplace-plugin-card", item.installed && "installed", pluginFocused && "focused-capability-row")}
                      key={item.id}
                      data-marketplace-plugin-id={item.id}
                    >
                    <div className="marketplace-plugin-card-head">
                      <div>
                        <strong>{item.name}</strong>
                        <span>{[item.marketplace, item.category].filter(Boolean).join(" · ") || t.marketplace}</span>
                      </div>
                      <em>{item.installed ? t.installedLocal : t.marketplace}</em>
                    </div>
                    <p>{messageExcerpt(item.description, 150) || item.source || item.id}</p>
                    <dl className="marketplace-plugin-meta">
                      {item.version && item.version !== "unknown" && <div><dt>{t.version}</dt><dd>{item.version}</dd></div>}
                      {item.author && <div><dt>{t.author}</dt><dd>{item.author}</dd></div>}
                      {item.source && <div><dt>{t.source}</dt><dd title={item.source}>{messageExcerpt(item.source, 76)}</dd></div>}
                      {item.permissions && <div><dt>{t.allowedTools}</dt><dd title={item.permissions}>{messageExcerpt(item.permissions, 54)}</dd></div>}
                    </dl>
                    <div className="marketplace-card-actions">
                      <button type="button" className="plain-action" onClick={() => requestCapabilityClaude(`plugin install ${item.id}`, `${t.installFromMarketplace}: ${item.name || item.id}`, marketplaceInstallReviewRows(item))} disabled={cliWorking || item.installed} title={item.installed ? t.installedLocal : cliWorking ? t.workingHint : t.installFromMarketplace}>
                        <Download size={14} />
                        {item.installed ? t.installedLocal : t.installFromMarketplace}
                      </button>
                      {item.homepage && (
                        <button type="button" className="plain-action subtle-action" onClick={() => desktopApi?.openBrowserUrl?.(item.homepage)}>
                          <ExternalLink size={13} />
                          {t.openHomepage}
                        </button>
                      )}
                      <button type="button" className="plain-action subtle-action" data-marketplace-plugin-action="copy-evidence" onClick={() => copyMarketplacePluginEvidence(item)} disabled={cliWorking} title={cliWorking ? t.workingHint : copiedMarketplacePluginId === item.id ? t.copied : t.copyEvidence}>
                        {copiedMarketplacePluginId === item.id ? <Check size={13} /> : <Copy size={13} />}
                        {copiedMarketplacePluginId === item.id ? t.copied : t.copyEvidence}
                      </button>
                    </div>
                    <RowCliActionEvidence run={recentRun} t={t} onOpenOutputs={openCapabilityOutputs} onRetry={pluginRetry} />
                  </article>
                  );
                })}
              </div>
            </section>
            <section className="marketplace-card">
              <div className="marketplace-card-head">
                <div>
                  <span>{t.marketplaceSourceCustom}</span>
                  <strong>{t.customMarketplaces}</strong>
                </div>
                <em className="settings-badge">{customMarketplaceRows.length}</em>
              </div>
              <p className="marketplace-local-note">{t.customMarketplaceLocalOnly} · {t.customMarketplaceNotInjected} · {t.customMarketplaceLocalHint}</p>
              <p className="marketplace-local-note subtle">{t.customMarketplaceCliHelpHint}</p>
              <form className="marketplace-form" onSubmit={addCustomMarketplace}>
                <label>
                  <span>{t.marketplaceUrl}</span>
                  <input value={customMarketplaceUrl} onChange={(event) => setCustomMarketplaceUrl(event.target.value)} placeholder="https://..." />
                </label>
                <button type="submit" className="plain-action" disabled={!customMarketplaceUrl.trim()}>
                  <Plus size={14} />
                  {t.addMarketplace}
                </button>
              </form>
              <div className="marketplace-source-list">
                {customMarketplaceRows.length === 0 && <p className="empty-list">{t.noCustomMarketplaces}</p>}
                {customMarketplaceRows.map((item) => {
                  const customFocused = capabilityFocusMatches("custom-marketplace", item);
                  return (
                    <div
                      className={cx("marketplace-source-row", customFocused && "focused-capability-row")}
                      key={item}
                      data-custom-marketplace-row
                      data-custom-marketplace-id={item}
                    >
                      <div>
                        <strong title={item}>{compactPath(item, 76)}</strong>
                        <span>{t.customMarketplaceLocalOnly} · {t.customMarketplaceNotInjected} · {t.settings}</span>
                      </div>
                      <div className="marketplace-source-actions">
                        <button
                          type="button"
                          className="plain-action subtle-action"
                          onClick={() => copyCustomMarketplaceUrl(item)}
                          title={item}
                        >
                          <Copy size={13} />
                          {copiedCustomMarketplace === item ? t.copiedMarketplaceUrl : t.copyMarketplaceUrl}
                        </button>
                        <button
                          type="button"
                          className="plain-action subtle-action"
                          onClick={() => runCapabilityClaude("plugin marketplace --help")}
                          disabled={cliWorking}
                          title={cliWorking ? t.workingHint : "claude plugin marketplace --help"}
                        >
                          <Bot size={13} />
                          {t.checkMarketplaceCliSupport}
                        </button>
                        <button type="button" className="plain-action subtle-action" onClick={onOpenClaudePanel}>
                          <PanelRight size={13} />
                          {t.openClaudePanel}
                        </button>
                        <button
                          type="button"
                          className="plain-action subtle-action"
                          onClick={() => saveCustomMarketplaces(customMarketplaces.filter((source) => source !== item))}
                        >
                          <X size={13} />
                          {t.remove}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          <>
            {activeTab === "plugins" && (
              <CliStatusDetail
                issue={cliStatusIssueByTab.plugins}
                t={t}
                onRetry={refreshCliStatus}
                onOpenClaudePanel={onOpenClaudePanel}
                disabled={cliWorking}
                spinning={cliBusy}
              />
            )}
            {activeTab === "plugins" && (
              <section className="structured-registry-section" aria-label={t.installedCliPlugins}>
                <div className="structured-registry-head">
                  <span>{t.installedCliPlugins}</span>
                  <strong>{installedPluginRows.length}</strong>
                </div>
                {installedPluginRows.length === 0 && <p className="empty-list">{t.pluginsEmpty}</p>}
                {installedPluginRows.map((plugin) => {
                  const recentRun = findRecentPluginActionRun(recentCapabilityRuns, [plugin.id, plugin.name], ["enable", "disable", "update", "install"]);
                  const pluginFocused = capabilityFocusMatches("plugin", plugin.id, plugin.name);
                  const pluginRetryArgs = pluginFocused && recentRun && recentRun.code !== 0
                    ? pluginActionArgsFromRun(recentRun, plugin.id)
                    : "";
                  const pluginRetry = pluginRetryArgs
                    ? () => requestCapabilityClaude(pluginRetryArgs, `${t.pluginActions}: ${plugin.id}`)
                    : null;
                  const pluginMeta = [
                    plugin.version && plugin.version !== "unknown" ? [t.version, plugin.version] : null,
                    plugin.scope ? [t.scope, plugin.scope] : null,
                    plugin.source ? [t.source, messageExcerpt(plugin.source, 72), plugin.source] : null,
                    plugin.installPath ? [t.installPath, compactPath(plugin.installPath, 72), plugin.installPath] : null,
                    plugin.tools ? [t.tools, messageExcerpt(plugin.tools, 72), plugin.tools] : null,
                    plugin.permissions ? [t.allowedTools, messageExcerpt(plugin.permissions, 72), plugin.permissions] : null,
                    plugin.error ? [t.mcpError, messageExcerpt(plugin.error, 72), plugin.error] : null,
                  ].filter(Boolean);
                  return (
                    <article
                      className={cx("structured-plugin-row", pluginFocused && "focused-capability-row")}
                      key={plugin.id}
                      data-plugin-id={plugin.id}
                    >
                    <span className="plugin-manager-icon"><Plug size={17} /></span>
                    <div className="plugin-manager-copy">
                      <strong>{plugin.id}</strong>
                      <small title={plugin.installPath || ""}>{[plugin.version && plugin.version !== "unknown" ? `${t.version}: ${plugin.version}` : "", plugin.scope && `${t.scope}: ${plugin.scope}`, plugin.marketplace].filter(Boolean).join(" · ") || t.installedLocal}</small>
                      {pluginMeta.length > 0 && (
                        <dl className="structured-row-meta" aria-label={`${plugin.id} plugin metadata`}>
                          {pluginMeta.map(([label, value, title]) => (
                            <div key={`${label}:${value}`}>
                              <dt>{label}</dt>
                              <dd title={title || value}>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                    <em className={cx("plugin-status-badge", plugin.enabled ? "enabled" : "disabled")}>{plugin.enabled ? t.pluginStatusEnabled : t.pluginStatusDisabled}</em>
                    <div className="structured-row-actions">
                      {plugin.enabled ? (
                        <button type="button" className="plain-action subtle-action" onClick={() => requestCapabilityClaude(`plugin disable ${plugin.id}`, `${t.disablePlugin}: ${plugin.id}`)} disabled={cliWorking} title={cliWorking ? t.workingHint : undefined}>{t.disablePlugin}</button>
                      ) : (
                        <button type="button" className="plain-action subtle-action" onClick={() => requestCapabilityClaude(`plugin enable ${plugin.id}`, `${t.enablePlugin}: ${plugin.id}`)} disabled={cliWorking} title={cliWorking ? t.workingHint : undefined}>{t.enablePlugin}</button>
                      )}
                      <button type="button" className="plain-action subtle-action" onClick={() => requestCapabilityClaude(`plugin update ${plugin.id}`, `${t.updatePlugin}: ${plugin.id}`)} disabled={cliWorking} title={cliWorking ? t.workingHint : undefined}>{t.updatePlugin}</button>
                      <button type="button" className="plain-action subtle-action" data-plugin-action="copy-evidence" onClick={() => copyPluginEvidence(plugin)} title={copiedPluginId === plugin.id ? t.copied : t.copyEvidence}>
                        {copiedPluginId === plugin.id ? <Check size={13} /> : <Copy size={13} />}
                        {copiedPluginId === plugin.id ? t.copied : t.copyEvidence}
                      </button>
                    </div>
                    <RowCliActionEvidence run={recentRun} t={t} onOpenOutputs={openCapabilityOutputs} onRetry={pluginRetry} />
                  </article>
                  );
                })}
              </section>
            )}
            {activeTab === "mcp" && (
              <CliStatusDetail
                issue={cliStatusIssueByTab.mcp}
                t={t}
                onRetry={refreshCliStatus}
                onOpenClaudePanel={onOpenClaudePanel}
                disabled={cliWorking}
                spinning={cliBusy}
              />
            )}
            {activeTab === "mcp" && (
              <section className="structured-registry-section" aria-label={t.mcpServers}>
                <div className="structured-registry-head">
                  <span>{t.mcpServers}</span>
                  <div className="structured-registry-head-actions">
                    <strong>{mcpServerRows.length}</strong>
                    <button
                      type="button"
                      className="plain-action subtle-action"
                      onClick={() => runCapabilityClaude("mcp list")}
                      disabled={cliWorking}
                      title={cliWorking ? t.workingHint : undefined}
                    >
                      <RefreshCw size={13} className={cliAction === "mcp list" ? "spin" : undefined} />
                      {t.recordMcpStatus}
                    </button>
                  </div>
                </div>
                <RowCliActionEvidence
                  run={recentMcpActionRun}
                  t={t}
                  onOpenOutputs={openCapabilityOutputs}
                  onRetry={recentMcpActionRun && recentMcpActionRun.code !== 0 && !cliWorking ? () => runCapabilityClaude("mcp list") : null}
                />
                {mcpServerRows.length === 0 && <p className="empty-list">{t.noMcpServers}</p>}
                {mcpServerRows.map((server) => {
                  const rowKey = mcpServerKey(server);
                  const rowRecording = cliAction === "mcp list";
                  const rowMeta = [
                    typeof server.tools === "number" ? [t.tools, String(server.tools)] : null,
                    server.transport ? [t.mcpTransport, server.transport] : null,
                    server.source ? [t.source, compactPath(server.source, 62), server.source] : null,
                    server.error ? [t.mcpError, messageExcerpt(server.error, 72), server.error] : null,
                  ].filter(Boolean);
                  return (
                    <article
                      className={cx("structured-plugin-row", capabilityFocusMatches("mcp", server.name, rowKey) && "focused-capability-row")}
                      key={rowKey}
                      data-mcp-server-id={server.name}
                      data-mcp-server-key={rowKey}
                    >
                      <span className="plugin-manager-icon"><Blocks size={17} /></span>
                      <div className="plugin-manager-copy">
                        <strong>{server.name}</strong>
                        <small title={server.raw}>{server.detail || server.raw}</small>
                        {rowMeta.length > 0 && (
                          <dl className="structured-row-meta" aria-label={`${server.name} MCP metadata`}>
                            {rowMeta.map(([label, value, title]) => (
                              <div key={`${label}:${value}`}>
                                <dt>{label}</dt>
                                <dd title={title || value}>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                      <em className={cx("plugin-status-badge", server.status)}>{mcpStatusLabel(server.status, t)}</em>
                      <div className="structured-row-actions">
                        <button type="button" className="plain-action subtle-action" onClick={onOpenClaudePanel}>
                          <Bot size={13} />
                          {t.openClaudePanel}
                        </button>
                        <button type="button" className="plain-action subtle-action" onClick={() => copyMcpServerRaw(server)} title={server.raw || server.detail || server.name}>
                          {copiedMcpServerKey === rowKey ? <Check size={13} /> : <Copy size={13} />}
                          {copiedMcpServerKey === rowKey ? t.copied : t.copyRawMcpStatus}
                        </button>
                        <button type="button" className="plain-action subtle-action" data-mcp-server-action="copy-evidence" onClick={() => copyMcpServerEvidence(server)} title={copiedMcpEvidenceKey === rowKey ? t.copied : t.copyEvidence}>
                          {copiedMcpEvidenceKey === rowKey ? <Check size={13} /> : <Copy size={13} />}
                          {copiedMcpEvidenceKey === rowKey ? t.copied : t.copyEvidence}
                        </button>
                        <button type="button" className="plain-action subtle-action" onClick={() => runCapabilityClaude("mcp list")} disabled={cliWorking} title={cliWorking ? t.workingHint : undefined}>
                          <RefreshCw size={13} className={rowRecording ? "spin" : undefined} />
                          {t.recordMcpStatus}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
            {activeTab === "skills" && (
              <section className="structured-registry-section skill-registry-section" aria-label={t.localSkillRegistry}>
                <div className="structured-registry-head">
                  <div>
                    <span>{t.localSkillRegistry}</span>
                    <strong>{hasRegisteredSkills ? `${rawSkillRows.length} ${t.installedLocal}` : t.runtimeHealthUnknown}</strong>
                    <small>{hasRegisteredSkills ? t.localSkillRegistryHint : skillRegistryKnown ? t.localSkillRegistryFallback : t.runtimeHealthUnknown}</small>
                  </div>
                  <button type="button" className="plain-action subtle-action" onClick={refreshCliStatus} disabled={cliWorking} title={cliWorking ? t.workingHint : t.refreshCliStatus}>
                    <RefreshCw size={13} className={cliBusy ? "spin" : undefined} />
                    {t.refresh}
                  </button>
                </div>
                {skillRegistryKnown && (
                  <dl className="structured-row-meta skill-registry-source-meta" aria-label={`${t.localSkillRegistry} metadata`}>
                    <div>
                      <dt>{t.skillRegistryRoots}</dt>
                      <dd title={skillRegistryRoots.join("\n")}>{skillRegistryRoots.length ? skillRegistryRoots.map((root) => compactPath(root, 54)).join(" · ") : "-"}</dd>
                    </div>
                    <div>
                      <dt>{t.status}</dt>
                      <dd data-skill-registry-truncated={String(skillRegistryTruncated)}>{skillRegistryTruncated ? t.skillRegistryTruncated : t.skillRegistryComplete}</dd>
                    </div>
                  </dl>
                )}
                {hasRegisteredSkills && skillRegistryRows.length === 0 && <p className="empty-list">{t.noCapabilities}</p>}
                {hasRegisteredSkills && skillRegistryRows.map((skill) => {
                  const skillId = String(skill.id || skill.name || skill.path || "").trim();
                  const skillMeta = [
                    skill.source ? [t.source, skill.source] : null,
                    skill.status ? [t.status, skill.status] : null,
                    skill.path ? [t.skillPath, compactPath(skill.path, 72), skill.path] : null,
                    skill.root ? [t.skillRoot, compactPath(skill.root, 72), skill.root] : null,
                    skill.relativePath ? [t.path, compactPath(skill.relativePath, 72), skill.relativePath] : null,
                    skill.updatedAt ? [t.fileUpdatedAt, formatDate(skill.updatedAt, lang), skill.updatedAt] : null,
                  ].filter(Boolean);
                  const copied = copiedSkillId === skillId;
                  return (
                    <article
                      className={cx("structured-plugin-row skill-registry-row", capabilityFocusMatches("skill", skill.id, skill.name, skill.path) && "focused-capability-row")}
                      key={skill.path || skillId}
                      data-skill-id={skillId}
                      data-skill-path={skill.path || ""}
                    >
                      <span className="plugin-manager-icon"><Blocks size={17} /></span>
                      <div className="plugin-manager-copy">
                        <strong>{skill.name || skillId}</strong>
                        <small title={skill.description}>{skill.description || t.localSkillRegistry}</small>
                        {skillMeta.length > 0 && (
                          <dl className="structured-row-meta skill-row-meta" aria-label={`${skill.name || skillId} skill metadata`}>
                            {skillMeta.map(([label, value, title]) => (
                              <div key={`${label}:${value}`}>
                                <dt>{label}</dt>
                                <dd title={title || value}>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                      <em className="plugin-status-badge ok">{t.installedLocal}</em>
                      <div className="structured-row-actions">
                        <button type="button" className="plain-action subtle-action" data-skill-action="open-workspace" onClick={() => openSkillWorkspaceFile(skill)} disabled={!skill.relativePath || !skill.root}>
                          <FileText size={13} />
                          {t.openSkillFile}
                        </button>
                        <button type="button" className="plain-action subtle-action" data-skill-action="pin-evidence" onClick={() => pinSkillEvidence(skill)}>
                          <Pin size={13} />
                          {t.pinSkillEvidence}
                        </button>
                        <button type="button" className="plain-action subtle-action" data-skill-action="copy-evidence" onClick={() => copySkillEvidence(skill)} title={copied ? t.copied : t.copyEvidence}>
                          {copied ? <Check size={13} /> : <Copy size={13} />}
                          {copied ? t.copied : t.copyEvidence}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!hasRegisteredSkills && fallbackSkillRows.map((item) => (
                  <PluginManagerRow
                    key={item.id}
                    icon={<Blocks size={17} />}
                    title={item.name}
                    subtitle={item.description}
                    enabled={item.enabled}
                    onToggle={() => onToggle(item.id, !item.enabled)}
                    t={t}
                  />
                ))}
              </section>
            )}
            {activeTab !== "skills" && (activeTab === "mcp" ? tabRows.mcp : tabRows.plugins).map((item) => (
              <PluginManagerRow
                key={item.id}
                icon={item.type === "plugin" ? <Plug size={17} /> : item.type === "skill" ? <Blocks size={17} /> : <SquareTerminal size={17} />}
                title={item.name}
                subtitle={item.description}
                enabled={item.enabled}
                onToggle={() => onToggle(item.id, !item.enabled)}
                t={t}
              />
            ))}
          </>
        )}
        {activeTab !== "marketplace" && activeTab === "skills" && skillRegistryKnown && !hasRegisteredSkills && skillTabRows.length === 0 && (
          <p className="empty-list">{t.noCapabilities}</p>
        )}
        {activeTab === "plugins" && (
          <details className="plugin-cli-output raw-output-details">
            <summary>{t.cliPluginOutput} · {t.rawOutput}</summary>
            <pre>{cliStatus?.plugins || t.noCliOutputYet}</pre>
          </details>
        )}
        {activeTab === "mcp" && (
          <details className="plugin-cli-output raw-output-details">
            <summary>{t.cliMcpOutput} · {t.rawOutput}</summary>
            <pre>{cliStatus?.mcp || t.noCliOutputYet}</pre>
          </details>
        )}
      </div>
    </ShellModal>
  );
}

function PluginManagerRow({ icon, title, subtitle, enabled, onToggle, actionLabel, onAction, t }) {
  return (
    <button
      type="button"
      className={cx("plugin-manager-row", enabled && "enabled")}
      onClick={onAction || onToggle}
      disabled={!onToggle && !onAction}
      aria-pressed={Boolean(enabled)}
    >
      <span className="plugin-manager-icon">{icon}</span>
      <span className="plugin-manager-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      {actionLabel ? (
        <span className="plain-action subtle-action plugin-row-action">{actionLabel}</span>
      ) : (
        <span className={cx("capability-state", enabled ? "enabled" : "disabled")}>{enabled ? t.enabled : t.disabled}</span>
      )}
    </button>
  );
}

function ProjectModal({ state, t, onClose, onSelectProject, onSetProject, onOpenProject, onOpenTerminal }) {
  const activeProject = state.activeProject || { name: t.localWorkspace, path: "" };
  const projects = visibleProjectsForUi(state, t);
  const hasProjectPath = Boolean(activeProject?.path);
  return (
    <ShellModal title={t.selectProject} subtitle={t.activeProject} onClose={onClose} closeLabel={t.close} className="project-modal">
      <section className="project-current" aria-label={t.activeProject}>
        <span>{t.activeProject}</span>
        <strong>{projectLabel(activeProject, t)}</strong>
        <code title={activeProject?.path || t.noProjectPath}>{activeProject?.path ? compactPath(activeProject.path, 92) : t.noProjectPath}</code>
      </section>
      <div className="project-modal-actions">
        <button type="button" className="primary-action" onClick={onSelectProject}><Folder size={16} />{t.selectProject}</button>
        <button type="button" className="plain-action" onClick={onOpenTerminal} disabled={!hasProjectPath} title={hasProjectPath ? t.openTerminal : t.noProjectPath}><SquareTerminal size={16} />{t.openTerminal}</button>
        <button type="button" className="plain-action" onClick={onOpenProject} disabled={!hasProjectPath} title={hasProjectPath ? t.openProject : t.noProjectPath}><ExternalLink size={16} />{t.openProject}</button>
      </div>
      <div className="project-list-large">
        {projects.map((project) => (
          <button type="button" key={project.path || project.name} className={cx((state.activeProject?.path || state.activeProject?.name) === (project.path || project.name) && "active")} onClick={() => onSetProject(project)}>
            <Folder size={16} />
            <div>
              <strong>{projectLabel(project, t)}</strong>
              <span>{project.path || t.noProjectPath}</span>
            </div>
          </button>
        ))}
      </div>
    </ShellModal>
  );
}

function SettingsBackedStatus({
  activeSection,
  settingsSections,
  state,
  form,
  environment,
  claudeStatus,
  busy,
  error,
  onRefresh,
  onOpenTool,
  onOpenBottomPanel,
  onOpenCapabilities,
  onOpenProjects,
  t,
}) {
  const label = settingsSections.find(([id]) => id === activeSection)?.[1] || t.settings;
  const activeProject = state.activeProject || { name: t.localWorkspace, path: "" };
  const git = environment?.git;
  const directApiActive = form.claudeCode?.executionMode === "api";
  const ideNames = (environment?.ideOptions || []).map((item) => item.label).join(", ") || t.ideUnavailable;
  const customMarketplaces = Array.isArray(form.customMarketplaces) ? form.customMarketplaces : [];
  const env = state.settings.env || {};
  const runtimeHealthSettings = {
    ...state.settings,
    model: form.model,
    claudeCode: {
      ...state.settings.claudeCode,
      ...form.claudeCode,
    },
  };
  const showRuntimeHealth = ["profile", "mcp", "connections", "hooks", "computer"].includes(activeSection);
  const rowsBySection = {
    profile: [
      [t.localRuntime, t.claudeCodeMode],
      [t.model, displayModelLabel(form.model)],
      [t.activeProject, projectLabel(activeProject, t)],
      [t.dataFile, state.settings.dataFile || t.desktopOnly],
    ],
    personalization: [
      [t.interfaceLanguage, form.language === "system" ? t.followSystem : t.chinese],
      [t.fontSize, form.appearance?.fontSize || t.fontSizeCompact],
      [t.density, form.appearance?.density || t.densityCompact],
      [t.defaultPermissions, permissionModeLabel(form.claudeCode?.permissionMode, t)],
      [t.effort, form.claudeCode?.effort || t.effortDefault],
    ],
    git: [
      [t.activeProject, projectLabel(activeProject, t)],
      [t.branch, git?.available ? git.branch || "main" : t.gitUnavailable],
      [t.changes, git?.available ? String(git.changes || 0) : t.gitUnavailable],
      ["cwd", environment?.cwd || activeProject.path || t.noProjectPath],
    ],
    environments: [
      ["cwd", environment?.cwd || activeProject.path || t.noProjectPath],
      [t.defaultFileOpenDestination, ideNames],
      [t.agentEnvironment, "Windows 原生"],
      [t.integratedShell, "PowerShell / cmd"],
    ],
    connections: [
      [t.executionMode, directApiActive ? t.apiMode : t.claudeCodeMode],
      [t.provider, providerDefaults(form.provider).name],
      [t.baseUrl, directApiActive ? form.baseUrl || providerDefaults(form.provider).baseUrl : cliBaseUrl(state.settings) || t.claudeCodeDefaultEnv],
      [t.env, `Anthropic ${env.anthropicKey ? "已找到" : "缺失"} · OpenAI ${env.openaiKey ? "已找到" : "缺失"}`],
    ],
    browser: [
      [t.browserPreview, "Electron 内嵌浏览器"],
      [t.openExternal, "系统浏览器"],
      [t.activeProject, projectLabel(activeProject, t)],
      [t.localCapability, capabilityEnabled(state.settings, "terminal-helper") ? t.enabled : t.disabled],
    ],
    computer: [
      [t.settingsComputerUse, t.settingsRouteThroughCli],
      [t.executionMode, t.claudeCodeMode],
      [t.permissionMode, permissionModeLabel(form.claudeCode?.permissionMode, t)],
      [t.interactiveClaude, t.enabled],
    ],
    hooks: [
      [t.settingsHooks, t.settingsRouteThroughCli],
      [t.claudeCommand, form.claudeCode?.claudeCommand || "claude"],
      [t.cliStatus, claudeStatus?.available ? t.ready : t.needsKey],
      [t.model, displayModelLabel(form.model)],
      [t.effort, form.claudeCode?.effort || t.effortDefault],
    ],
    worktrees: [
      [t.settingsWorktrees, t.settingsRouteThroughCli],
      [t.activeProject, projectLabel(activeProject, t)],
      [t.branch, git?.available ? git.branch || "main" : t.gitUnavailable],
      [t.path, activeProject.path || t.noProjectPath],
    ],
    archived: [
      [t.settingsArchivedChats, `${state.sessions?.filter((session) => session.archived).length || 0}`],
      [t.localHistory, `${state.sessions?.length || 0}`],
      [t.dataFile, state.settings.dataFile || t.desktopOnly],
      [t.encryption, state.settings.encryptionAvailable ? "是" : "否"],
    ],
    mcp: [
      [t.cliStatus, claudeStatus?.available ? t.ready : t.needsKey],
      [t.claudeCommand, form.claudeCode?.claudeCommand || "claude"],
      [t.plugins, capabilityEnabled(state.settings, "plugin-router") ? t.enabled : t.disabled],
      [t.mcps, capabilityEnabled(state.settings, "mcp-runtime") ? t.enabled : t.disabled],
    ],
  };
  const rows = rowsBySection[activeSection] || [];
  const settingsPluginItems = Array.isArray(claudeStatus?.pluginItems) ? claudeStatus.pluginItems : [];
  const settingsMcpServers = Array.isArray(claudeStatus?.mcpServers) ? claudeStatus.mcpServers : [];
  const settingsMarketplaceSources = Array.isArray(claudeStatus?.marketplaces) ? claudeStatus.marketplaces : [];
  const settingsMarketplacePlugins = Array.isArray(claudeStatus?.marketplacePlugins) ? claudeStatus.marketplacePlugins : [];
  const rawCliOutput = activeSection === "mcp"
    ? `${claudeStatus?.plugins || ""}\n\n${claudeStatus?.mcp || ""}\n\n${claudeStatus?.marketplaceOutput || ""}`.trim()
    : activeSection === "git"
      ? git?.raw || ""
      : "";
  function openRuntimeHealthTargetName(target) {
    if (target === "plugins" || target === "skills" || target === "mcp" || target === "marketplace") {
      onOpenCapabilities?.(target);
      return;
    }
    if (target === "claude") onOpenTool?.("claude");
  }

  function openRuntimeHealthTarget(row) {
    openRuntimeHealthTargetName(runtimeHealthTargetForRow(row));
  }

  function openRuntimeHealthIssue(issue) {
    openRuntimeHealthTargetName(runtimeHealthTargetForIssue(issue));
  }
  const actionsBySection = {
    profile: [
      { label: t.openProjectSurface, icon: Folder, onClick: onOpenProjects },
      { label: t.openEnvironmentPanel, icon: HardDrive, onClick: () => onOpenBottomPanel?.("environment") },
    ],
    personalization: [
      { label: t.openClaudeTool, icon: Bot, onClick: () => onOpenTool?.("claude") },
    ],
    mcp: [
      { label: t.openMcpWorkbench, icon: Blocks, onClick: onOpenCapabilities },
      { label: t.openClaudeTool, icon: Bot, onClick: () => onOpenTool?.("claude") },
    ],
    browser: [
      { label: t.openBrowserTool, icon: Globe2, onClick: () => onOpenTool?.("browser") },
      { label: t.openBrowserEvidence, icon: PanelBottom, onClick: () => onOpenBottomPanel?.("browser") },
    ],
    computer: [
      { label: t.openClaudeTool, icon: Bot, onClick: () => onOpenTool?.("claude") },
      { label: t.openTerminalTool, icon: SquareTerminal, onClick: () => onOpenTool?.("terminal") },
    ],
    hooks: [
      { label: t.openClaudeTool, icon: Bot, onClick: () => onOpenTool?.("claude") },
    ],
    connections: [
      { label: t.openMcpWorkbench, icon: Blocks, onClick: onOpenCapabilities },
      { label: t.openClaudeTool, icon: Bot, onClick: () => onOpenTool?.("claude") },
    ],
    git: [
      { label: t.openChangesPanel, icon: GitBranch, onClick: () => onOpenBottomPanel?.("changes") },
      { label: t.openEnvironmentPanel, icon: HardDrive, onClick: () => onOpenBottomPanel?.("environment") },
    ],
    environments: [
      { label: t.openEnvironmentPanel, icon: HardDrive, onClick: () => onOpenBottomPanel?.("environment") },
      { label: t.openTerminalTool, icon: SquareTerminal, onClick: () => onOpenTool?.("terminal") },
    ],
    worktrees: [
      { label: t.openChangesPanel, icon: GitBranch, onClick: () => onOpenBottomPanel?.("changes") },
      { label: t.openClaudeTool, icon: Bot, onClick: () => onOpenTool?.("claude") },
    ],
    archived: [
      { label: t.openWorkspaceTool, icon: FileText, onClick: () => onOpenTool?.("workspace") },
    ],
  };
  const quickActions = (actionsBySection[activeSection] || []).filter((action) => action.onClick);

  return (
    <div className="settings-layout">
      <section className="settings-section settings-backed-section">
        <div className="settings-section-head">
          <div>
            <span>{label}</span>
            <h3>{t.backedLocalState}</h3>
          </div>
          <button type="button" className="plain-action subtle-action" onClick={onRefresh} disabled={busy} title={busy ? t.workingHint : t.refreshCliStatus}>
            <RefreshCw size={14} className={busy ? "spin" : undefined} />
            {busy ? t.loading : t.refresh}
          </button>
        </div>
        <p className="settings-section-copy">{activeSection === "git" && !git?.available ? t.noGitProject : t.settingsStatusHint}</p>
        {error && <p className="tool-error">{error}</p>}
        <dl className="settings-status-grid">
          {rows.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd title={String(value || "")}>{String(value || "")}</dd>
            </div>
          ))}
        </dl>
        {showRuntimeHealth && (
          <RuntimeHealthCard
            claudeStatus={claudeStatus}
            settings={runtimeHealthSettings}
            activeProject={activeProject}
            t={t}
            onRetry={onRefresh}
            onOpenClaudePanel={() => onOpenTool?.("claude")}
            onOpenRow={openRuntimeHealthTarget}
            onOpenIssue={openRuntimeHealthIssue}
            busy={busy}
            compact
          />
        )}
        {quickActions.length > 0 && (
          <div className="settings-quick-actions" aria-label={t.settingsQuickLinks}>
            <span>{t.settingsQuickLinks}</span>
            <div>
              {quickActions.map(({ label: actionLabel, icon: Icon, onClick }) => (
                <button type="button" className="plain-action subtle-action" key={actionLabel} onClick={onClick}>
                  <Icon size={14} />
                  {actionLabel}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      {activeSection === "mcp" && (
        <section className="settings-section settings-mcp-structured-section">
          <div className="settings-section-head">
            <div>
              <span>{t.installedCliState}</span>
              <h3>{t.pluginsAndMcp}</h3>
            </div>
            <em className="settings-badge cli">{t.claudeCodeMode}</em>
          </div>
          <div className="structured-registry-section settings-mcp-status-group" aria-label={t.installedPlugins}>
            <div className="structured-registry-head">
              <span>{t.installedPlugins}</span>
              <strong>{settingsPluginItems.length}</strong>
            </div>
            {settingsPluginItems.length === 0 && <p className="empty-list">{t.pluginsEmpty}</p>}
            {settingsPluginItems.slice(0, 6).map((plugin) => (
              <article className="structured-plugin-row settings-mcp-plugin-row" key={plugin.id}>
                <span className="plugin-manager-icon"><Plug size={17} /></span>
                <div className="plugin-manager-copy">
                  <strong>{plugin.name || plugin.id}</strong>
                  <small title={plugin.installPath || plugin.source || ""}>
                    {[plugin.version && plugin.version !== "unknown" ? `${t.version}: ${plugin.version}` : "", plugin.scope && `${t.scope}: ${plugin.scope}`, plugin.marketplace].filter(Boolean).join(" · ") || t.installedLocal}
                  </small>
                </div>
                <em className={cx("plugin-status-badge", plugin.enabled ? "enabled" : "disabled")}>{plugin.enabled ? t.pluginStatusEnabled : t.pluginStatusDisabled}</em>
              </article>
            ))}
          </div>
          <div className="structured-registry-section settings-mcp-status-group" aria-label={t.mcpServers}>
            <div className="structured-registry-head">
              <span>{t.mcpServers}</span>
              <strong>{settingsMcpServers.length}</strong>
            </div>
            {settingsMcpServers.length === 0 && <p className="empty-list">{t.noMcpServers}</p>}
            {settingsMcpServers.slice(0, 6).map((server) => {
              const display = mcpPanelDisplay(server, t);
              const rowMeta = [
                display.detail ? [t.cliStatus, messageExcerpt(display.detail, 72), display.detail] : null,
                typeof server.tools === "number" ? [t.tools, String(server.tools)] : null,
                server.transport ? [t.mcpTransport, server.transport] : null,
                server.source ? [t.source, compactPath(server.source, 62), server.source] : null,
                server.error ? [t.mcpError, messageExcerpt(server.error, 72), server.error] : null,
              ].filter(Boolean);
              return (
                <article className="structured-plugin-row settings-mcp-server-row" key={`${display.name}:${server.raw || server.detail || ""}`}>
                  <span className="plugin-manager-icon"><Blocks size={17} /></span>
                  <div className="plugin-manager-copy">
                    <strong>{display.name}</strong>
                    <small title={server.raw || display.detail}>{display.detail || server.raw || t.mcpServers}</small>
                    {rowMeta.length > 0 && (
                      <dl className="structured-row-meta" aria-label={`${display.name} MCP metadata`}>
                        {rowMeta.map(([metaLabel, value, title]) => (
                          <div key={`${metaLabel}:${value}`}>
                            <dt>{metaLabel}</dt>
                            <dd title={title || value}>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  <em className={cx("plugin-status-badge", server.status)}>{mcpStatusLabel(server.status, t)}</em>
                </article>
              );
            })}
          </div>
          <div className="structured-registry-section settings-mcp-status-group" aria-label={t.marketplace}>
            <div className="structured-registry-head">
              <span>{t.marketplace}</span>
              <strong>{settingsMarketplaceSources.length + settingsMarketplacePlugins.length}</strong>
            </div>
            {settingsMarketplaceSources.length === 0 && settingsMarketplacePlugins.length === 0 && <p className="empty-list">{t.noMarketplacePlugins}</p>}
            {settingsMarketplaceSources.slice(0, 4).map((marketplace) => (
              <article className="structured-plugin-row settings-mcp-marketplace-row" key={marketplace.name || marketplace.repo || marketplace.source}>
                <span className="plugin-manager-icon"><ExternalLink size={17} /></span>
                <div className="plugin-manager-copy">
                  <strong>{marketplace.name || t.marketplaceSources}</strong>
                  <small title={marketplace.repo || marketplace.installLocation || marketplace.source}>
                    {[marketplace.version, marketplace.status, marketplace.repo || marketplace.installLocation || marketplace.source].filter(Boolean).join(" · ") || t.marketplaceSources}
                  </small>
                </div>
                <em className="plugin-status-badge enabled">{marketplace.status || marketplace.source || t.source}</em>
              </article>
            ))}
            {settingsMarketplacePlugins.slice(0, 6).map((plugin) => (
              <article className="structured-plugin-row settings-mcp-marketplace-plugin-row" key={plugin.id || plugin.name}>
                <span className="plugin-manager-icon"><Plug size={17} /></span>
                <div className="plugin-manager-copy">
                  <strong>{plugin.name || plugin.id}</strong>
                  <small title={summarizePanelPluginField(plugin.source || plugin.description || plugin.permissions)}>
                    {[plugin.version && plugin.version !== "unknown" ? `${t.version}: ${plugin.version}` : "", plugin.marketplace, plugin.author, summarizePanelPluginField(plugin.permissions)].filter(Boolean).join(" · ") || t.marketplaceCatalog}
                  </small>
                </div>
                <em className={cx("plugin-status-badge", plugin.installed ? "enabled" : "disabled")}>{plugin.installed ? t.installedLocal : t.marketplace}</em>
              </article>
            ))}
          </div>
          <details className="raw-output-details settings-mcp-raw-details">
            <summary>{t.rawOutput}</summary>
            <pre className="settings-raw-output">{rawCliOutput || t.noCliOutputYet}</pre>
          </details>
        </section>
      )}
      {activeSection === "git" && rawCliOutput && (
        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <span>{t.settingsGit}</span>
              <h3>git status --short --branch</h3>
            </div>
          </div>
          <pre className="settings-raw-output">{rawCliOutput}</pre>
        </section>
      )}
      {activeSection === "connections" && (
        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <span>{t.customMarketplaces}</span>
              <h3>{customMarketplaces.length ? `${customMarketplaces.length}` : t.noCustomMarketplaces}</h3>
            </div>
            <em className="settings-badge">{t.customMarketplaceLocalOnly}</em>
          </div>
          <p>{t.customMarketplaceNotInjected} · {t.customMarketplaceLocalHint}</p>
          <div className="settings-chip-list">
            {customMarketplaces.length
              ? customMarketplaces.map((item) => <span key={item} title={item}>{compactPath(item, 62)}</span>)
              : <p className="empty-list">{t.noCustomMarketplaces}</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function commandSearchText(command) {
  return [command.id, command.title, command.subtitle, command.group, command.kbd, command.keywords]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function commandMatchesQuery(command, query) {
  return commandMatchScore(command, query) > 0;
}

function commandMatchScore(command, query) {
  const tokens = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const haystack = commandSearchText(command);
  if (!tokens.every((token) => haystack.includes(token))) return 0;
  const title = String(command.title || "").toLowerCase();
  const subtitle = String(command.subtitle || "").toLowerCase();
  const group = String(command.group || "").toLowerCase();
  const phrase = tokens.join(" ");
  let score = 10 + Number(command.priority || 0);
  if (title.includes(phrase)) score += 120;
  if (subtitle.includes(phrase)) score += 70;
  if (haystack.includes(phrase)) score += 40;
  for (const token of tokens) {
    if (title.includes(token)) score += 8;
    else if (subtitle.includes(token)) score += 4;
    else if (group.includes(token)) score += 2;
    else score += 1;
  }
  return score;
}

function CommandPalette({ commands, t, onClose }) {
  const [commandQuery, setCommandQuery] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const filtered = commands
    .map((command, index) => ({ command, index, score: commandMatchScore(command, commandQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.command);
  return (
    <ShellModal title={t.commandPalette} onClose={onClose} closeLabel={t.close} className="command-modal">
      <label className="command-search">
        <Search size={16} />
        <input ref={inputRef} value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder={t.commandHint} />
      </label>
      <div className="command-list">
        {filtered.map((command) => (
          <button
            type="button"
            key={command.id}
            data-command-id={command.id}
            data-command-group={command.group || ""}
            onClick={() => {
              onClose();
              command.action();
            }}
          >
            <div className="command-copy">
              <strong>{command.title}</strong>
              <small>{command.subtitle}</small>
            </div>
            <div className="command-meta">
              {command.group && <em>{command.group}</em>}
              {command.kbd && <kbd>{command.kbd}</kbd>}
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="empty-list">{t.noCommands}</p>}
      </div>
    </ShellModal>
  );
}

function ScheduledModal({
  t,
  lang,
  activeProject,
  activeSession,
  sessions = [],
  automations = [],
  onClose,
  onCreate,
  onRunNow,
  onDelete,
  onToggleEnabled,
  onCopy,
  onOpenRunTimeline,
}) {
  const items = Array.isArray(automations) ? automations : [];
  const [prompt, setPrompt] = useState("");
  const [time, setTime] = useState("");
  const [scheduleType, setScheduleType] = useState("once");
  const [workingId, setWorkingId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedAutomationRunId, setCopiedAutomationRunId] = useState("");

  async function handleAction(id, action) {
    setWorkingId(id);
    try {
      await action();
    } catch {
      // The parent action already surfaces the error through the desktop toast.
    } finally {
      setWorkingId("");
    }
  }

  async function copyAutomationEvidence(item, entry = item?.lastRun) {
    if (!entry) return;
    await onCopy?.(automationEvidenceText(item, entry, t, sessions));
    const runId = String(entry?.id || item?.id || "").trim();
    if (runId) {
      setCopiedAutomationRunId(runId);
      window.setTimeout(() => setCopiedAutomationRunId((current) => (current === runId ? "" : current)), 1200);
    }
  }

  const scheduleCount = t.scheduleCount.replace("{count}", items.length);
  return (
    <ShellModal title={t.scheduledTitle} subtitle={t.scheduledSubtitle} onClose={onClose} closeLabel={t.close} className="scheduled-modal">
      <div className="schedule-workbench">
        <form className="schedule-form" onSubmit={(event) => {
          event.preventDefault();
          if (!prompt.trim()) return;
          setSubmitting(true);
          Promise.resolve(onCreate?.({
            prompt: prompt.trim(),
            runAt: time ? new Date(time).toISOString() : "",
            scheduleType,
            projectPath: activeProject?.path || "",
            threadId: activeSession?.id || "",
          })).then(() => {
            setPrompt("");
            setTime("");
            setScheduleType("once");
          }).catch(() => {}).finally(() => setSubmitting(false));
        }}>
          <label>
            <span>{t.schedulePrompt}</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t.schedulePromptPlaceholder}
            />
          </label>
          <label>
            <span>{t.scheduleTime}</span>
            <input type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <label>
            <span>{t.scheduleRepeat}</span>
            <select value={scheduleType} onChange={(event) => setScheduleType(event.target.value)} data-automation-repeat-select>
              <option value="once">{t.scheduleRepeatOnce}</option>
              <option value="daily">{t.scheduleRepeatDaily}</option>
              <option value="weekly">{t.scheduleRepeatWeekly}</option>
            </select>
          </label>
          <div className="schedule-form-context">
            <span>{t.scheduleProject}</span>
            <strong>{projectLabel(activeProject, t)}</strong>
            <small title={activeProject?.path || t.noProjectPath}>{activeProject?.path ? compactPath(activeProject.path, 58) : t.noProjectPath}</small>
          </div>
          <div className="schedule-form-context">
            <span>{t.scheduleThread}</span>
            <strong>{activeSession ? sessionDisplayTitle(activeSession, t) : t.newChat}</strong>
            <small>{t.scheduleBackedByLocalStore}</small>
          </div>
          <button type="submit" className="primary-action" disabled={!prompt.trim() || submitting} title={!prompt.trim() ? t.schedulePromptPlaceholder : undefined}>
            <Clock3 size={16} />
            {t.addSchedule}
          </button>
        </form>
        <section className="schedule-queue" aria-label={t.scheduleQueue}>
          <div className="schedule-list-head">
            <div>
              <span>{t.scheduleQueue}</span>
              <strong>{scheduleCount}</strong>
            </div>
          </div>
          <div className="schedule-list">
            {items.map((item) => (
              <article key={item.id} className="schedule-item">
                <div className="schedule-item-main">
                  <div className="schedule-item-title">
                    <strong>{item.prompt}</strong>
                    <span className={cx("automation-status-badge", item.status || "idle")}>
                      {automationStatusLabel(item.status, t)}
                    </span>
                  </div>
                  <dl className="schedule-meta">
                    <div>
                      <dt>{t.scheduleProject}</dt>
                      <dd title={item.project?.path || ""}>{automationProjectLabel(item, t)}</dd>
                    </div>
                    <div>
                      <dt>{t.scheduleThread}</dt>
                      <dd>{automationThreadLabel(item, sessions, t)}</dd>
                    </div>
                    <div>
                      <dt>{t.scheduleNextRun}</dt>
                      <dd>{item.nextRun ? formatDate(item.nextRun, lang) : t.scheduleAnytime}</dd>
                    </div>
                    <div>
                      <dt>{t.scheduleRepeat}</dt>
                      <dd>{automationScheduleTypeLabel(item.schedule?.type, t)}</dd>
                    </div>
                    <div>
                      <dt>{t.scheduleLastRun}</dt>
                      <dd>{item.lastRun?.endedAt ? formatDate(item.lastRun.endedAt, lang) : t.noAutomationHistory}</dd>
                    </div>
                  </dl>
                  <details className="schedule-history">
                    <summary>{t.scheduleHistory}</summary>
                    {item.history?.length ? (
                      <ul>
                        {item.history.slice(0, 4).map((entry) => (
                          <li key={entry.id} className={entry.status}>
                            <span>{automationStatusLabel(entry.status, t)}</span>
                            <time>{formatDate(entry.endedAt || entry.startedAt, lang)}</time>
                            <em>{automationTriggerLabel(entry.trigger, t)}</em>
                            <em>{typeof entry.code === "number" ? `${t.commandExit}: ${entry.code}` : t.commandExit}</em>
                            {typeof entry.durationMs === "number" && entry.durationMs > 0 && <em>{formatDurationMs(entry.durationMs)}</em>}
                            <div className="automation-history-actions">
                              <button
                                type="button"
                                data-automation-history-action="copy"
                                onClick={() => copyAutomationEvidence(item, entry)}
                                title={t.copyAutomationEvidence}
                              >
                                {copiedAutomationRunId === entry.id ? <Check size={12} /> : <Copy size={12} />}
                                {copiedAutomationRunId === entry.id ? t.copied : t.copyAutomationEvidence}
                              </button>
                              {entry.id && (
                                <button
                                  type="button"
                                  data-automation-history-action="timeline"
                                  onClick={() => onOpenRunTimeline?.(entry.id)}
                                  title={t.openRunTimeline}
                                >
                                  <FileText size={12} />
                                  {t.openRunTimeline}
                                </button>
                              )}
                            </div>
                            {(entry.detail || entry.error || entry.summary) && <p>{entry.detail || entry.error || entry.summary}</p>}
                            {(entry.stdout || entry.stderr || entry.sessionId || typeof entry.code === "number") && (
                              <details className="automation-run-evidence-details">
                                <summary>{t.automationRawEvidence}</summary>
                                <dl className="automation-run-evidence-meta">
                                  <div><dt>{t.automationSession}</dt><dd>{entry.sessionId || "-"}</dd></div>
                                  <div><dt>{t.commandExit}</dt><dd>{typeof entry.code === "number" ? entry.code : "-"}</dd></div>
                                  <div><dt>{t.commandDuration}</dt><dd>{formatDurationMs(entry.durationMs)}</dd></div>
                                </dl>
                                {entry.stdout && (
                                  <section>
                                    <span>{t.automationStdout}</span>
                                    <pre className="subagent-output secondary-output">{entry.stdout}</pre>
                                  </section>
                                )}
                                {entry.stderr && (
                                  <section>
                                    <span>{t.automationStderr}</span>
                                    <pre className="subagent-output secondary-output error-output">{entry.stderr}</pre>
                                  </section>
                                )}
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{t.noAutomationHistory}</p>
                    )}
                  </details>
                </div>
                <div className="schedule-item-actions">
                  <button
                    type="button"
                    onClick={() => handleAction(item.id, () => onRunNow?.(item))}
                    disabled={workingId === item.id || item.status === "running"}
                    title={t.runNow}
                  >
                    <Send size={14} />
                    {workingId === item.id ? t.automationRunning : t.runNow}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(item.id, () => onToggleEnabled?.(item, !item.enabled))}
                    disabled={!item.schedule?.runAt || workingId === item.id || item.status === "running"}
                    title={item.enabled ? t.pauseAutomation : t.resumeAutomation}
                  >
                    <Clock3 size={14} />
                    {item.enabled ? t.pauseAutomation : t.resumeAutomation}
                  </button>
                  {item.lastRun && (
                    <button type="button" data-automation-schedule-action="copy-evidence" onClick={() => copyAutomationEvidence(item)} title={copiedAutomationRunId === item.lastRun.id ? t.copied : t.copyAutomationEvidence}>
                      {copiedAutomationRunId === item.lastRun.id ? <Check size={14} /> : <Copy size={14} />}
                      {copiedAutomationRunId === item.lastRun.id ? t.copied : t.copyAutomationEvidence}
                    </button>
                  )}
                  {item.lastRun?.id && (
                    <button type="button" onClick={() => onOpenRunTimeline?.(item.lastRun.id)} title={t.openRunTimeline}>
                      <FileText size={14} />
                      {t.openRunTimeline}
                    </button>
                  )}
                  <button type="button" className="danger-action" onClick={() => handleAction(item.id, () => onDelete?.(item))} disabled={workingId === item.id} title={t.delete}>
                    <Trash2 size={14} />
                    {t.delete}
                  </button>
                </div>
              </article>
            ))}
            {items.length === 0 && (
              <div className="empty-panel">
                <Clock3 size={20} />
                <strong>{t.emptySchedule}</strong>
                <p>{t.emptyScheduleHint}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </ShellModal>
  );
}

export function App() {
  const [state, setState] = useState(fallbackState());
  const [activeSessionId, setActiveSessionId] = useState("browser-preview");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState("general");
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [capabilityInitialTab, setCapabilityInitialTab] = useState("plugins");
  const [capabilityFocus, setCapabilityFocus] = useState({ tab: "plugins", kind: "", id: "", query: "", nonce: 0 });
  const [capabilityCommandStatus, setCapabilityCommandStatus] = useState(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState("");
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const [loadError, setLoadError] = useState("");
  const [stateLoading, setStateLoading] = useState(true);
  const [projectScope, setProjectScope] = useState("current");
  const [currentRequestId, setCurrentRequestId] = useState("");
  const [streamingAssistant, setStreamingAssistant] = useState(null);
  const [optimisticUser, setOptimisticUser] = useState(null);
  const [environment, setEnvironment] = useState(null);
  const [ideOptions, setIdeOptions] = useState([]);
  const [selectedIdeId, setSelectedIdeId] = useState("");
  const [runEvents, setRunEvents] = useState(() => state.runEvents || []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!desktopApi) {
        if (!cancelled) setStateLoading(false);
        return;
      }
      try {
        const next = await desktopApi.getState();
        if (!cancelled) {
          setState(next);
          setRunEvents((current) => mergeRunEvents(current, next.runEvents || []));
          setActiveSessionId(next.sessions[0]?.id || "");
          setLoadError("");
        }
      } catch (error) {
        if (!cancelled) setLoadError(error.message || "无法加载桌面端状态。");
      } finally {
        if (!cancelled) setStateLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function retryLoadDesktopState() {
    if (!desktopApi) return;
    setStateLoading(true);
    setLoadError("");
    try {
      const next = await desktopApi.getState();
      setState(next);
      setActiveSessionId(next.sessions[0]?.id || "");
    } catch (error) {
      setLoadError(error.message || "无法加载桌面端状态。");
    } finally {
      setStateLoading(false);
    }
  }

  useEffect(() => {
    if (!desktopApi?.onChatStream) return undefined;
    return desktopApi.onChatStream((event) => {
      setStreamingAssistant((current) => {
        if (!current || current.requestId !== event.requestId) return current;
        if (event.type === "delta") {
          return { ...current, content: `${current.content}${event.text || ""}`, status: "" };
        }
        if (event.type === "status") {
          return { ...current, status: event.text || current.status };
        }
        if (event.type === "activity") {
          const activity = {
            id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            text: event.text || "",
          };
          return {
            ...current,
            activities: [...(current.activities || []), activity].filter((item) => item.text).slice(-8),
          };
        }
        return current;
      });
    });
  }, []);

  useEffect(() => {
    if (!desktopApi?.onStateUpdate) return undefined;
    return desktopApi.onStateUpdate((next) => {
      if (!next?.settings) return;
      setState(next);
      setRunEvents((current) => mergeRunEvents(current, next.runEvents || []));
      setActiveSessionId((current) => (
        next.sessions?.some((session) => session.id === current) ? current : next.sessions?.[0]?.id || ""
      ));
    });
  }, []);

  useEffect(() => {
    if (!desktopApi?.onSubagentStream) return undefined;
    return desktopApi.onSubagentStream((event) => {
      if (event.type === "chunk") {
        setState((current) => ({
          ...current,
          subagentRuns: appendSubagentChunkForUi(current.subagentRuns || [], event),
        }));
        setRunEvents((current) => appendSubagentChunkToRunEvents(current, event));
      }
      if (event.run) {
        setState((current) => ({
          ...current,
          subagentRuns: upsertSubagentRunForUi(current.subagentRuns || [], event.run),
        }));
        if (event.run.requestId || event.run.id) {
          setRunEvents((current) => prependRunEvent(current, {
            id: event.run.requestId || event.run.id,
            type: "subagent",
            status: event.run.status === "running" ? "running" : event.run.status === "done" ? "ok" : event.run.status === "cancelled" ? "cancelled" : "error",
            title: `${t.subagents}: ${event.run.nickname || "Subagent"}`,
            detail: event.run.summary || event.run.stderr || event.run.stdout || messageExcerpt(event.run.task, 120),
            commandLine: subagentCommandLine(event.run),
            cwd: event.run.cwd || event.run.project?.path || "",
            code: typeof event.run.code === "number" ? event.run.code : null,
            durationMs: typeof event.run.durationMs === "number" ? event.run.durationMs : null,
            stdout: event.run.stdout || "",
            stderr: event.run.stderr || "",
            project: event.run.project,
            sessionId: event.run.sessionId || "",
            createdAt: event.run.startedAt,
          }));
        }
      }
    });
  }, []);

  const lang = resolveLanguage(state.settings.language, state.settings.appLocale);
  const t = copy.zh;
  const activeProject = state.activeProject || { name: t.localWorkspace, path: "" };
  useEffect(() => {
    let cancelled = false;
    async function loadCapabilityCommandStatus() {
      if (stateLoading || !desktopApi?.getClaudeStatus) {
        if (!cancelled) setCapabilityCommandStatus(null);
        return;
      }
      try {
        const result = await desktopApi.getClaudeStatus({ projectPath: activeProject?.path });
        if (!cancelled) setCapabilityCommandStatus(result);
      } catch (_error) {
        if (!cancelled) setCapabilityCommandStatus(null);
      }
    }
    loadCapabilityCommandStatus();
    return () => {
      cancelled = true;
    };
  }, [activeProject?.path, stateLoading]);
  const projectPathMissing = Boolean(activeProject?.path && environment?.projectMissing);
  const visibleThreadItems = useMemo(() => sidebarThreadItems(state.sessions, t, activeProject, projectScope), [state.sessions, t, activeProject, projectScope]);
  const activeSession =
    state.sessions.find((session) => (
      session.id === activeSessionId &&
      (projectScope === "archived" ? session.archived : !session.archived) &&
      (projectScope === "all" || sessionMatchesProjectForUi(session, activeProject))
    ))
    || visibleThreadItems[0]?.session
    || state.sessions.find((session) => !session.archived)
    || state.sessions[0];
  const hasKey = Boolean(state.settings.apiKeys?.[state.settings.provider]);
  const streamingSessionId = busy ? optimisticUser?.sessionId : null;

  useEffect(() => {
    const nextSessionId = selectSessionIdForProject(state, t, activeProject, activeSessionId, projectScope);
    if (nextSessionId && nextSessionId !== activeSessionId) setActiveSessionId(nextSessionId);
  }, [state, activeProject, activeSessionId, projectScope, t]);

  async function refreshEnvironment() {
    if (!desktopApi?.getEnvironment) return null;
    try {
      const next = await desktopApi.getEnvironment({ projectPath: activeProject?.path });
      setEnvironment(next);
      const nextIdeOptions = Array.isArray(next?.ideOptions) ? next.ideOptions : [];
      setIdeOptions(nextIdeOptions);
      setSelectedIdeId((current) => current || nextIdeOptions[0]?.id || "");
      return next;
    } catch {
      setEnvironment(null);
      return null;
    }
  }

  useEffect(() => {
    refreshEnvironment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.path]);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2200);
  }

  async function recordNotice(payload = {}) {
    if (!desktopApi?.recordNotice) return null;
    try {
      const next = await desktopApi.recordNotice({
        projectPath: activeProject?.path || "",
        sessionId: activeSession?.id || "",
        ...payload,
      });
      if (Array.isArray(next?.notices)) {
        setState((current) => ({ ...current, notices: next.notices }));
      }
      return next?.notice || null;
    } catch {
      return null;
    }
  }

  async function dismissNotice(notice) {
    if (!desktopApi?.dismissNotice || !notice?.id) return;
    const next = await desktopApi.dismissNotice({ noticeId: notice.id });
    if (Array.isArray(next?.notices)) setState((current) => ({ ...current, notices: next.notices }));
  }

  async function clearNotices() {
    if (!desktopApi?.clearNotices) return;
    const next = await desktopApi.clearNotices();
    if (Array.isArray(next?.notices)) setState((current) => ({ ...current, notices: next.notices }));
  }

  function recordRunEvent(entry) {
    const optimisticEvent = {
      id: entry?.id || `run_event_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    setRunEvents((current) => prependRunEvent(current, optimisticEvent));
    let persistedRunEvent = Promise.resolve(null);
    if (desktopApi?.recordRunEvent) {
      persistedRunEvent = desktopApi.recordRunEvent({
        projectPath: activeProject?.path || "",
        sessionId: activeSession?.id || "",
        ...optimisticEvent,
      }).then((next) => {
        if (Array.isArray(next?.runEvents)) setRunEvents((current) => mergeRunEvents(current, next.runEvents));
        return next;
      }).catch(() => null);
    }
    if (entry?.status === "error" && !entry.suppressNotice) {
      const noticeAction = entry?.action
        || (entry?.type === "file-save" && entry?.path ? `workspace:file:${encodeURIComponent(entry.path)}` : "")
        || (entry?.type === "git-command" && optimisticEvent.id ? `git-run:${encodeURIComponent(optimisticEvent.id)}` : "")
        || (entry?.type === "subagent" && optimisticEvent.id ? `subagent:${encodeURIComponent(optimisticEvent.id)}` : "")
        || (optimisticEvent.id ? `run:${encodeURIComponent(optimisticEvent.id)}` : "");
      void persistedRunEvent.then(() => recordNotice({
        level: "error",
        source: entry.type || "run",
        title: entry.title || t.requestError,
        detail: entry.detail || "",
        action: noticeAction,
        key: `run:${entry.type || "unknown"}:${entry.title || ""}`,
      }));
    }
  }

  async function runPersistedClaudeCommand(args) {
    const nextArgs = String(args || "").trim();
    if (!nextArgs || !desktopApi?.runClaudeCommand) return null;
    const requestId = `claude_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const commandLine = `claude ${nextArgs}`;
    recordRunEvent({
      id: requestId,
      type: "claude-command",
      status: "running",
      title: `${t.runClaude}: ${commandLine}`,
      detail: activeProject?.path || "",
      commandLine,
      cwd: activeProject?.path || "",
    });
    try {
      const result = await desktopApi.runClaudeCommand({
        projectPath: activeProject?.path,
        args: nextArgs,
        requestId,
        persistCommandRun: true,
        commandRunKind: "claude",
      });
      if (Array.isArray(result.commandRuns)) {
        setState((current) => ({ ...current, commandRuns: result.commandRuns }));
      }
      const resolvedArgs = result.args?.join(" ") || nextArgs;
      recordRunEvent({
        id: requestId,
        type: "claude-command",
        status: result.code === 0 ? "ok" : "error",
        title: `${t.runClaude}: claude ${resolvedArgs}`,
        detail: `${t.commandExit}: ${result.code}`,
        commandLine: `claude ${resolvedArgs}`,
        cwd: result.cwd || activeProject?.path || "",
        code: result.code,
        durationMs: result.durationMs,
      });
      return result;
    } catch (error) {
      recordRunEvent({
        id: requestId,
        type: "claude-command",
        status: "error",
        title: `${t.runClaude}: ${commandLine}`,
        detail: error.message || String(error),
        commandLine,
        cwd: activeProject?.path || "",
      });
      throw error;
    }
  }

  async function runPersistedWorkspaceCommand({ command, projectPath } = {}) {
    const nextCommand = String(command || "").trim();
    const targetProjectPath = String(projectPath || activeProject?.path || "").trim();
    if (!nextCommand || !targetProjectPath || !desktopApi?.runWorkspaceCommand) return null;
    const requestId = `workspace_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setBottomPanel("outputs");
    recordRunEvent({
      id: requestId,
      type: "workspace-command",
      status: "running",
      title: `${t.runCommand}: ${nextCommand}`,
      detail: targetProjectPath,
      commandLine: nextCommand,
      cwd: targetProjectPath,
    });
    try {
      const result = await desktopApi.runWorkspaceCommand({
        projectPath: targetProjectPath,
        command: nextCommand,
        requestId,
      });
      if (Array.isArray(result.commandRuns)) {
        setState((current) => ({ ...current, commandRuns: result.commandRuns }));
      }
      const code = typeof result.code === "number" ? result.code : null;
      recordRunEvent({
        id: requestId,
        type: "workspace-command",
        status: result.cancelled ? "cancelled" : code === 0 ? "ok" : "error",
        title: `${t.runCommand}: ${result.command || nextCommand}`,
        detail: result.cancelled ? t.commandCancelled : `${t.commandExit}: ${code ?? "-"}`,
        commandLine: result.command || nextCommand,
        cwd: result.cwd || targetProjectPath,
        code,
        durationMs: result.durationMs,
      });
      await refreshEnvironment();
      return result;
    } catch (error) {
      recordRunEvent({
        id: requestId,
        type: "workspace-command",
        status: "error",
        title: `${t.runCommand}: ${nextCommand}`,
        detail: error.message || String(error),
        commandLine: nextCommand,
        cwd: targetProjectPath,
      });
      throw error;
    }
  }

  async function runPersistedCapabilityCommand(args) {
    const nextArgs = String(args || "").trim();
    if (!nextArgs || !desktopApi?.runClaudeCommand) return null;
    const requestId = `capability_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const commandLine = `claude ${nextArgs}`;
    setBottomPanel("outputs");
    recordRunEvent({
      id: requestId,
      type: "capability-cli",
      status: "running",
      title: `${t.pluginActions}: ${commandLine}`,
      detail: projectLabel(activeProject, t),
      commandLine,
      cwd: activeProject?.path || "",
    });
    try {
      const result = await desktopApi.runClaudeCommand({
        projectPath: activeProject?.path,
        args: nextArgs,
        requestId,
        persistCommandRun: true,
        commandRunKind: "capability",
      });
      if (Array.isArray(result.commandRuns)) {
        setState((current) => ({ ...current, commandRuns: result.commandRuns }));
      }
      const resolvedArgs = result.args?.join(" ") || nextArgs;
      recordRunEvent({
        id: requestId,
        type: "capability-cli",
        status: result.code === 0 ? "ok" : "error",
        title: `${t.pluginActions}: claude ${resolvedArgs}`,
        detail: `${t.commandExit}: ${result.code}`,
        commandLine: `claude ${resolvedArgs}`,
        cwd: result.cwd || activeProject?.path || "",
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        code: result.code,
        durationMs: result.durationMs,
        suppressNotice: true,
      });
      return result;
    } catch (error) {
      recordRunEvent({
        id: requestId,
        type: "capability-cli",
        status: "error",
        title: `${t.pluginActions}: ${commandLine}`,
        detail: error.message || String(error),
        commandLine,
        cwd: activeProject?.path || "",
        suppressNotice: true,
      });
      throw error;
    }
  }

  function openCapabilityRetryConfirmation(args) {
    const nextArgs = String(args || "").trim();
    if (!mutatingCapabilityRetryArgsFromRun({ commandLine: `claude ${nextArgs}` })) return;
    const focus = capabilityRetryFocusForArgs(nextArgs);
    const nextTab = focus?.tab || "plugins";
    openCapabilitiesSurface(nextTab, {
      ...focus,
      confirmCommand: {
        args: nextArgs,
        label: `${t.retry}: claude ${nextArgs}`,
        reviewRows: [
          [t.commandLine, `claude ${nextArgs}`],
          [t.commandCwd, activeProject?.path || t.localWorkspace],
        ],
      },
    });
  }

  function applySessionState(next, preferredId = "", scope = projectScope) {
    setState(next);
    if (Array.isArray(next?.runEvents)) setRunEvents((current) => mergeRunEvents(current, next.runEvents));
    setActiveSessionId(selectSessionIdForProject(next, t, next.activeProject || activeProject, preferredId, scope));
  }

  function focusComposer() {
    setComposerFocusToken((current) => current + 1);
  }

  async function createSession() {
    if (!desktopApi) return;
    const next = await desktopApi.createSession();
    applySessionState(next, next.sessions[0]?.id || "");
    setDraft("");
  }

  async function renameThread(session) {
    if (!desktopApi?.updateSession || !session) return;
    const currentTitle = sessionDisplayTitle(session, t);
    const nextTitle = window.prompt(t.renameThreadPrompt, currentTitle);
    if (nextTitle === null) return;
    const title = String(nextTitle || "").trim();
    if (!title || title === currentTitle) return;
    try {
      const next = await desktopApi.updateSession({ sessionId: session.id, title });
      applySessionState(next, session.id);
      showToast(t.renameThread);
    } catch (error) {
      showToast(error.message || String(error));
    }
  }

  async function togglePinThread(session) {
    if (!desktopApi?.updateSession || !session) return;
    try {
      const nextPinned = !session.pinned;
      const next = await desktopApi.updateSession({ sessionId: session.id, pinned: nextPinned });
      applySessionState(next, session.id);
      showToast(nextPinned ? t.threadPinned : t.threadUnpinned);
    } catch (error) {
      showToast(error.message || String(error));
    }
  }

  async function archiveThread(session) {
    if (!desktopApi?.updateSession || !session) return;
    try {
      const nextArchived = !session.archived;
      const next = await desktopApi.updateSession({ sessionId: session.id, archived: nextArchived });
      const nextScope = nextArchived ? projectScope : "current";
      if (!nextArchived && projectScope === "archived") setProjectScope("current");
      applySessionState(next, nextArchived && session.id === activeSession?.id ? "" : session.id, nextScope);
      showToast(nextArchived ? t.threadArchived : t.restoreThread);
    } catch (error) {
      showToast(error.message || String(error));
    }
  }

  async function forkThread(session) {
    if (!desktopApi?.forkSession || !session) return;
    try {
      const next = await desktopApi.forkSession(session.id);
      applySessionState(next, next.selectedSessionId || "");
      showToast(t.threadForked);
    } catch (error) {
      showToast(error.message || String(error));
    }
  }

  async function deleteThread(session) {
    if (!desktopApi?.deleteSession || !session) return;
    if (!window.confirm(t.deleteThreadConfirm)) return;
    try {
      const next = await desktopApi.deleteSession(session.id);
      applySessionState(next, session.id === activeSession?.id ? "" : activeSession?.id);
      showToast(t.threadDeleted);
    } catch (error) {
      showToast(error.message || String(error));
    }
  }

  async function resumeThread(session) {
    if (!session) return;
    const targetScope = session.archived ? "archived" : "current";
    setSettingsOpen(false);
    setCapabilitiesOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    setBottomPanel("");
    setSidebarVisible(true);
    setProjectScope(targetScope);
    setDraft("");
    try {
      const targetProject = {
        name: session.project || activeProject?.name || t.localWorkspace,
        path: session.projectPath || "",
      };
      const currentKey = String(activeProject?.path || activeProject?.name || "").trim().toLowerCase();
      const targetKey = String(targetProject.path || targetProject.name || "").trim().toLowerCase();
      if (desktopApi?.setActiveProject && targetKey && targetKey !== currentKey) {
        const next = await desktopApi.setActiveProject(targetProject);
        applySessionState(next, session.id, targetScope);
      } else {
        setActiveSessionId(session.id);
      }
      focusComposer();
      recordRunEvent({
        id: `thread:${session.id}:resume:${Date.now()}`,
        type: "thread-action",
        status: "ok",
        title: `聊天：${t.resumeThread} · ${sessionDisplayTitle(session, t)}`,
        detail: [
          projectLabel(targetProject, t),
          t.threadMessageCount.replace("{count}", sessionMessages(session).length),
        ].filter(Boolean).join(" · "),
        commandLine: "",
        cwd: targetProject.path || "",
        code: null,
        durationMs: 0,
        stdout: [
          "action=resume",
          `sessionId=${session.id}`,
          `title=${sessionDisplayTitle(session, t)}`,
          `project=${targetProject.name || ""}`,
          targetProject.path ? `projectPath=${targetProject.path}` : "",
          `messageCount=${sessionMessages(session).length}`,
        ].filter(Boolean).join("\n"),
        project: targetProject,
        projectPath: targetProject.path || "",
        sessionId: session.id,
      });
      showToast(t.threadResumed);
    } catch (error) {
      showToast(error.message || String(error));
    }
  }

  const stateDeepLinkCommands = useMemo(() => {
    const projectCommands = (state.projects || [])
      .filter((project) => project?.path || project?.name)
      .slice(0, 12)
      .map((project) => {
        const label = projectLabel(project, t);
        const key = project.path || project.name;
        return {
          id: `project:${commandIdSegment(key)}`,
          title: `${t.projects}: ${label}`,
          subtitle: project.path || t.noProjectPath,
          group: t.projects,
          keywords: [
            "project workspace folder switch open",
            project.name,
            project.path,
          ].filter(Boolean).join(" "),
          action: () => {
            setProjectScope("current");
            void setActiveProject(project);
          },
        };
      });

    const threadCommandSessions = (state.sessions || [])
      .filter((session) => session?.id)
      .slice(0, 24);

    const threadMetaForCommand = (session) => [
      sessionProjectLabel(session, t),
      sessionMetaLabel(session, t, false),
      session.archived ? t.showArchivedChats : "",
      session.pinned ? t.threadPinned : "",
    ].filter(Boolean).join(" · ");

    const threadSearchParts = (session, title) => [
      session.id,
      title,
      session.title,
      session.project,
      session.projectPath,
      ...sessionMessages(session).map((message) => message.content),
    ].filter(Boolean);

    const threadCommands = threadCommandSessions
      .map((session) => {
        const title = sessionDisplayTitle(session, t);
        const meta = threadMetaForCommand(session);
        return {
          id: `thread:${commandIdSegment(session.id)}`,
          title: `${t.activeThread}: ${title}`,
          subtitle: meta,
          group: t.chats,
          keywords: [
            "thread chat session resume history",
            ...threadSearchParts(session, title),
          ].join(" "),
          action: () => resumeThread(session),
        };
      });

    const threadActionCommands = threadCommandSessions
      .flatMap((session) => {
        const title = sessionDisplayTitle(session, t);
        const meta = threadMetaForCommand(session);
        const searchParts = threadSearchParts(session, title);
        const pinAction = session.pinned
          ? { id: "unpin", verb: "unpin", label: t.unpinThread, keywords: "unpin thread chat session pinned 取消置顶", action: () => togglePinThread(session) }
          : { id: "pin", verb: "pin", label: t.pinThread, keywords: "pin thread chat session pinned 置顶", action: () => togglePinThread(session) };
        const archiveAction = session.archived
          ? { id: "restore", verb: "restore", label: t.restoreThread, keywords: "restore thread chat session archived 恢复 归档", action: () => archiveThread(session) }
          : { id: "archive", verb: "archive", label: t.archiveThread, keywords: "archive thread chat session archived 归档", action: () => archiveThread(session) };
        return [
          { id: "rename", verb: "rename", label: t.renameThread, keywords: "rename thread chat session title 重命名 标题", action: () => renameThread(session) },
          pinAction,
          archiveAction,
          { id: "fork", verb: "fork", label: t.forkThread, keywords: "fork thread chat session copy branch 分叉 复制", action: () => forkThread(session) },
          { id: "delete", verb: "delete", label: t.deleteThread, keywords: "delete thread chat session remove 删除", action: () => deleteThread(session) },
          { id: "resume", verb: "resume", label: t.resumeThread, keywords: "resume thread chat session open continue 继续 打开", action: () => resumeThread(session) },
        ].map((spec) => ({
          id: `thread-action:${spec.id}:${commandIdSegment(session.id)}`,
          title: `${spec.label}: ${title}`,
          subtitle: meta,
          group: t.chats,
          keywords: [
            `${spec.verb} ${title}`,
            `${spec.label} ${title}`,
            spec.keywords,
            ...searchParts,
          ].join(" "),
          action: spec.action,
        }));
      });

    const runEvidenceCommands = (runEvents || [])
      .filter((event) => event?.id)
      .slice(0, 16)
      .map((event) => {
        const evidence = runTimelineEvidenceForEvent(event, {
          commandRuns: state.commandRuns,
          automations: state.automations,
          subagentRuns: state.subagentRuns,
          sessions: state.sessions,
          t,
        });
        const artifactSearchParts = Array.isArray(evidence?.artifacts)
          ? evidence.artifacts.map((artifact, index) => [
            subagentArtifactLabel(artifact, index, t),
            artifact?.path,
            artifact?.type,
            subagentArtifactContent(artifact),
          ].filter(Boolean).join(" "))
          : [];
        return {
          id: `run:${commandIdSegment(event.id)}`,
          title: `${t.openRunTimeline}: ${event.title || t.outputs}`,
          subtitle: [
            event.detail || evidence?.summary,
            runTimelineStatusLabel(event.status, t),
            evidence?.commandLine || event.commandLine,
          ].filter(Boolean).join(" · "),
          group: t.bottomPanel,
          keywords: [
            "run timeline evidence output command stdout stderr artifact",
            event.type === "automation-action" ? "automation action create pause resume delete schedule task center 自动化 创建 暂停 恢复 删除 证据" : "",
            event.type === "subagent-action" ? "subagent action archive restore task center 子代理 关闭 恢复 证据" : "",
            event.type === "thread-action" ? "thread action rename pin unpin archive restore fork delete resume chat history 聊天 操作 重命名 置顶 归档 恢复 Fork 删除 继续 证据" : "",
            event.id,
            event.type,
            event.title,
            event.detail,
            event.stdout,
            event.stderr,
            event.commandLine,
            event.cwd,
            event.project?.name,
            event.project?.path,
            event.sessionId,
            evidence?.summary,
            evidence?.stdout,
            evidence?.stderr,
            evidence?.commandLine,
            evidence?.cwd,
            evidence?.sessionId,
            ...artifactSearchParts,
          ].filter(Boolean).join(" "),
          action: () => openRunTimeline(event.id),
        };
      });

    const runEventIds = new Set((runEvents || []).flatMap((event) => [
      event?.id,
      event?.requestId,
    ].filter(Boolean)));
    const commandRunCommands = (Array.isArray(state.commandRuns) ? state.commandRuns : [])
      .filter((run) => {
        const event = commandRunTimelineEvent(run, t);
        return event && !runEventIds.has(event.id);
      })
      .slice(0, 16)
      .map((run) => {
        const event = commandRunTimelineEvent(run, t);
        const commandLine = event.commandLine || run.command || run.commandLine || "";
        return {
          id: `command-run:${commandIdSegment(event.id)}`,
          title: `${t.openRunTimeline}: ${messageExcerpt(commandLine, 72)}`,
          subtitle: [
            runTimelineStatusLabel(event.status, t),
            run.kind || "workspace",
            event.cwd,
            typeof event.code === "number" ? `${t.commandExit}: ${event.code}` : "",
          ].filter(Boolean).join(" · "),
          group: t.bottomPanel,
          keywords: [
            "command run timeline evidence output selected stdout stderr workspace claude capability",
            event.id,
            run.id,
            run.requestId,
            run.kind,
            commandLine,
            run.stdout,
            run.stderr,
            run.cwd,
            run.project?.name,
            run.project?.path,
          ].filter(Boolean).join(" "),
          action: () => openRunTimeline(event.id),
        };
      });

    const noticeCommands = (state.notices || [])
      .filter((notice) => notice?.id && notice?.title && !notice.dismissedAt)
      .slice(0, 16)
      .map((notice) => ({
        id: `notice:${commandIdSegment(notice.id)}`,
        title: `${t.noticeCenter}: ${notice.title}`,
        subtitle: [
          noticeLevelLabel(notice.level, t),
          notice.source || t.noticeSource,
          notice.detail,
          projectLabel(notice.project, t),
        ].filter(Boolean).join(" · "),
        group: t.notices,
        keywords: [
          "notice error warning failure alert status action deep link",
          notice.id,
          notice.key,
          notice.level,
          notice.source,
          notice.title,
          notice.detail,
          notice.action,
          notice.project?.name,
          notice.project?.path,
        ].filter(Boolean).join(" "),
        action: () => openNoticeTarget(notice),
      }));

    const gitFileCommands = (Array.isArray(environment?.git?.files) ? environment.git.files : [])
      .filter((file) => file?.path || file?.previousPath)
      .slice(0, 24)
      .map((file) => {
        const filePath = file.path || file.previousPath || "";
        const previousLabel = file.previousPath && file.previousPath !== filePath ? `${file.previousPath} -> ${filePath}` : "";
        return {
          id: `git-file:${commandIdSegment(filePath)}`,
          title: `${t.focusFileDiff}: ${filePath}`,
          subtitle: [
            gitChangeKindLabel(file.kind, t),
            file.status,
            typeof file.additions === "number" || typeof file.deletions === "number" ? `+${file.additions || 0} -${file.deletions || 0}` : "",
            previousLabel,
          ].filter(Boolean).join(" · "),
          group: t.changes,
          keywords: [
            "git file diff changes status evidence focus changed file",
            filePath,
            file.previousPath,
            file.status,
            file.kind,
            environment?.git?.branch,
            environment?.git?.root,
            environment?.git?.raw,
            environment?.git?.stat,
          ].filter(Boolean).join(" "),
          action: () => openGitFileDiff(filePath),
        };
      });

    const gitHunkCommands = (Array.isArray(environment?.git?.diff?.fileDiffs) ? environment.git.diff.fileDiffs : [])
      .filter((fileDiff) => fileDiff?.text && (fileDiff.path || fileDiff.previousPath))
      .slice(0, 16)
      .flatMap((fileDiff) => {
        const filePath = fileDiff.path || fileDiff.previousPath || "";
        return buildGitHunks(fileDiff.text)
          .slice(0, 6)
          .map((hunk, index) => ({
            id: `git-hunk:${commandIdSegment(filePath)}:${commandIdSegment(hunk.id || String(index))}`,
            title: `${t.focusHunk}: ${filePath}`,
            subtitle: [
              `${index + 1}. ${hunk.header}`,
              `+${hunk.additions || 0} -${hunk.deletions || 0}`,
              messageExcerpt(hunk.text, 96),
            ].filter(Boolean).join(" · "),
            group: t.changes,
            keywords: [
              "git hunk diff changes status evidence focus selected hunk patch",
              filePath,
              fileDiff.previousPath,
              hunk.header,
              hunk.text,
              environment?.git?.branch,
              environment?.git?.root,
            ].filter(Boolean).join(" "),
            action: () => openGitFileDiff(filePath, hunk.id),
          }));
      })
      .slice(0, 36);

    const sourceRefCommands = (Array.isArray(state.sourceRefs) ? state.sourceRefs : [])
      .filter((source) => source?.path || source?.name || source?.id)
      .slice(0, 24)
      .map((source) => {
        const sourceKey = sourceRefKey(source);
        const sourcePath = source.path || source.name || sourceKey;
        return {
          id: `source-ref:${commandIdSegment(sourceKey || sourcePath)}`,
          title: `${t.sources}: ${sourcePath}`,
          subtitle: [
            projectLabel(source.project, t),
            typeof source.size === "number" ? formatBytes(source.size) : "",
            source.lastOpenedAt ? `${t.sourceLastOpened} ${formatDate(source.lastOpenedAt)}` : "",
          ].filter(Boolean).join(" · "),
          group: t.sources,
          keywords: [
            "source reference evidence workspace file opened read",
            source.id,
            source.name,
            source.path,
            source.type,
            source.project?.name,
            source.project?.path,
          ].filter(Boolean).join(" "),
          action: () => openSourceEvidence(source),
        };
      });

    const browserEvidenceCommands = (Array.isArray(state.browserVisits) ? state.browserVisits : [])
      .filter((visit) => visit?.id || visit?.url || browserVisitFinalUrl(visit))
      .slice(0, 24)
      .map((visit) => {
        const visitKey = browserVisitKey(visit);
        const finalUrl = browserVisitFinalUrl(visit);
        return {
          id: `browser-visit:${commandIdSegment(visitKey || finalUrl)}`,
          title: `${t.browserEvidence}: ${visit.title || finalUrl || visit.url}`,
          subtitle: [
            browserStatusLabel(visit.status, t),
            finalUrl,
            visit.error,
            visit.lastEventAt ? formatDate(visit.lastEventAt) : "",
          ].filter(Boolean).join(" · "),
          group: t.browser,
          keywords: [
            "browser evidence visit webview url snapshot excerpt",
            visit.id,
            visit.url,
            visit.finalUrl,
            visit.validatedUrl,
            visit.title,
            visit.excerpt,
            visit.status,
            visit.error,
            visit.project?.name,
            visit.project?.path,
          ].filter(Boolean).join(" "),
          action: () => openBrowserEvidence(visit),
        };
      });

    const browserTimelineCommands = (Array.isArray(state.browserVisits) ? state.browserVisits : [])
      .filter((visit) => visit?.id || visit?.url || browserVisitFinalUrl(visit))
      .slice(0, 24)
      .map((visit) => {
        const visitKey = browserVisitKey(visit);
        const finalUrl = browserVisitFinalUrl(visit);
        const label = visit.title || finalUrl || visit.url;
        return {
          id: `browser-run:${commandIdSegment(visitKey || finalUrl)}`,
          title: `${t.openRunTimeline}: ${label}`,
          subtitle: [
            t.browserEvidence,
            browserStatusLabel(visit.status, t),
            finalUrl,
            visit.error,
            visit.lastEventAt ? formatDate(visit.lastEventAt) : "",
          ].filter(Boolean).join(" · "),
          group: t.bottomPanel,
          keywords: [
            "browser run timeline evidence output selected recovery webview url snapshot excerpt",
            visit.id,
            visit.url,
            visit.finalUrl,
            visit.validatedUrl,
            visit.title,
            visit.excerpt,
            visit.status,
            visit.error,
            visit.project?.name,
            visit.project?.path,
          ].filter(Boolean).join(" "),
          action: () => openRunTimeline(visitKey || finalUrl),
        };
      });

    const automationCommands = (state.automations || [])
      .filter((automation) => automation?.id)
      .slice(0, 16)
      .map((automation) => {
        const lastRun = automation.lastRun || {};
        const hasEvidence = Boolean(lastRun.id || lastRun.error || lastRun.detail || lastRun.summary || lastRun.stdout || lastRun.stderr);
        const hasHistory = automationRunEntries(automation).length > 0;
        return {
          id: `automation:${commandIdSegment(automation.id)}`,
          title: `${t.automationTasks}: ${messageExcerpt(automation.prompt, 72)}`,
          subtitle: [
            automationProjectLabel(automation, t),
            automationStatusLabel(automation.status || lastRun.status, t),
            lastRun.error || lastRun.detail || lastRun.summary,
          ].filter(Boolean).join(" · "),
          group: t.taskCenter,
          keywords: [
            "automation schedule task center run history failure evidence",
            automation.id,
            automation.prompt,
            automation.status,
            automation.threadId,
            automation.project?.name,
            automation.project?.path,
            lastRun.id,
            lastRun.status,
            lastRun.error,
            lastRun.detail,
            lastRun.summary,
            lastRun.stdout,
            lastRun.stderr,
          ].filter(Boolean).join(" "),
          action: () => openTaskCenterFocus("automation", automation.id, {
            expandEvidence: hasEvidence,
            expandHistory: hasHistory,
          }),
        };
      });

    const automationRunCommands = (state.automations || [])
      .filter((automation) => automation?.id)
      .slice(0, 16)
      .flatMap((automation) => automationRunEntries(automation).slice(0, 6).map((entry) => ({
        id: `automation-run:${commandIdSegment(entry.id)}`,
        title: `${t.openRunTimeline}: ${messageExcerpt(automation.prompt, 56)}`,
        subtitle: [
          automationStatusLabel(entry.status || automation.status, t),
          entry.summary || entry.error || entry.detail,
          entry.endedAt ? formatDate(entry.endedAt) : "",
        ].filter(Boolean).join(" · "),
        group: t.taskCenter,
        keywords: [
          "automation run history timeline evidence stdout stderr",
          automation.id,
          automation.prompt,
          automation.project?.name,
          automation.project?.path,
          automation.threadId,
          entry.id,
          entry.status,
          entry.trigger,
          entry.summary,
          entry.error,
          entry.detail,
          entry.stdout,
          entry.stderr,
          entry.sessionId,
        ].filter(Boolean).join(" "),
        action: () => openRunTimeline(entry.id),
      })));

    const subagentCommands = (state.subagentRuns || [])
      .filter((run) => run?.id || run?.requestId)
      .slice(0, 16)
      .map((run) => ({
        id: `subagent:${commandIdSegment(run.id || run.requestId)}`,
        title: `${t.subagents}: ${run.nickname || "Subagent"}`,
        subtitle: [
          run.task,
          subagentStatusLabel(run.status, t),
          run.archivedAt ? t.showArchivedSubagents : "",
        ].filter(Boolean).join(" · "),
        group: t.taskCenter,
        keywords: [
          "subagent agent task center run artifact failure evidence",
          run.id,
          run.requestId,
          run.nickname,
          run.task,
          run.status,
          run.summary,
          run.stdout,
          run.stderr,
          run.sessionId,
          run.project?.name,
          run.project?.path,
          run.cwd,
          ...(Array.isArray(run.artifacts) ? run.artifacts.map((artifact) => [artifact?.label, artifact?.path, artifact?.type, subagentArtifactContent(artifact)].filter(Boolean).join(" ")) : []),
        ].filter(Boolean).join(" "),
        action: () => openTaskCenterFocus("subagent", run.id || run.requestId, {
          expandEvidence: true,
          expandArtifacts: Array.isArray(run.artifacts) && run.artifacts.length > 0,
        }),
      }));

    const subagentRunCommands = (state.subagentRuns || [])
      .filter((run) => run?.id || run?.requestId)
      .slice(0, 16)
      .map((run) => {
        const runId = run.requestId || run.id;
        const artifactSearchParts = Array.isArray(run.artifacts)
          ? run.artifacts.map((artifact) => [
            artifact?.label,
            artifact?.path,
            artifact?.type,
            subagentArtifactContent(artifact),
          ].filter(Boolean).join(" "))
          : [];
        return {
          id: `subagent-run:${commandIdSegment(runId)}`,
          title: `${t.openRunTimeline}: ${run.nickname || "Subagent"}`,
          subtitle: [
            run.summary || run.stderr || messageExcerpt(run.task, 72),
            subagentStatusLabel(run.status, t),
            run.endedAt ? formatDate(run.endedAt) : "",
          ].filter(Boolean).join(" · "),
          group: t.taskCenter,
          keywords: [
            "subagent run timeline evidence stdout stderr artifact",
            run.id,
            run.requestId,
            run.nickname,
            run.task,
            run.status,
            run.summary,
            run.stdout,
            run.stderr,
            run.sessionId,
            run.project?.name,
            run.project?.path,
            run.cwd,
            ...artifactSearchParts,
          ].filter(Boolean).join(" "),
          action: () => openRunTimeline(runId),
        };
      });

    const installedPluginCommands = (Array.isArray(capabilityCommandStatus?.pluginItems) ? capabilityCommandStatus.pluginItems : [])
      .filter((plugin) => plugin?.id || plugin?.name)
      .slice(0, 16)
      .map((plugin) => {
        const id = plugin.id || plugin.name;
        return {
          id: `capability-plugin:${commandIdSegment(id)}`,
          title: `${t.plugins}: ${id}`,
          subtitle: [
            plugin.enabled ? t.pluginStatusEnabled : t.pluginStatusDisabled,
            plugin.version && plugin.version !== "unknown" ? `${t.version}: ${plugin.version}` : "",
            plugin.scope && `${t.scope}: ${plugin.scope}`,
            plugin.source,
          ].filter(Boolean).join(" · "),
          group: t.capabilities,
          keywords: [
            "plugin installed capability claude code tool permissions error",
            plugin.id,
            plugin.name,
            plugin.marketplace,
            plugin.version,
            plugin.scope,
            plugin.status,
            plugin.source,
            plugin.tools,
            plugin.permissions,
            plugin.error,
          ].filter(Boolean).join(" "),
          action: () => openCapabilitiesSurface("plugins", {
            kind: "plugin",
            id,
            query: id,
          }),
        };
      });

    const skillCommandItems = (Array.isArray(capabilityCommandStatus?.skillItems) ? capabilityCommandStatus.skillItems : Array.isArray(capabilityCommandStatus?.skills) ? capabilityCommandStatus.skills : [])
      .filter((skill) => skill?.id || skill?.name || skill?.path)
      .slice(0, 24);
    const skillRegistryCommands = skillCommandItems
      .map((skill) => {
        const id = skill.id || skill.name || skill.path;
        const label = skill.name || id;
        return {
          id: `capability-skill:${commandIdSegment(id)}`,
          title: `${t.skills}: ${label}`,
          subtitle: [
            skill.description,
            skill.source,
            skill.path ? compactPath(skill.path, 70) : "",
          ].filter(Boolean).join(" · "),
          group: t.capabilities,
          keywords: [
            "skill local registry capability SKILL.md codex",
            skill.id,
            skill.name,
            skill.description,
            skill.path,
            skill.root,
            skill.relativePath,
            skill.source,
            skill.status,
          ].filter(Boolean).join(" "),
          action: () => openCapabilitiesSurface("skills", {
            kind: "skill",
            id,
            query: label,
          }),
        };
      });
    const skillOpenFileCommands = skillCommandItems
      .filter((skill) => skill?.root && skill?.relativePath)
      .map((skill) => {
        const id = skill.id || skill.name || skill.path;
        const label = skill.name || id;
        return {
          id: `capability-skill-open:${commandIdSegment(id)}`,
          title: `${t.openSkillFileCommand}: ${label}`,
          subtitle: [
            skill.relativePath,
            skill.root ? compactPath(skill.root, 70) : "",
          ].filter(Boolean).join(" · "),
          group: t.capabilities,
          keywords: [
            "open skill file workspace SKILL.md local registry",
            skill.id,
            skill.name,
            skill.description,
            skill.path,
            skill.root,
            skill.relativePath,
          ].filter(Boolean).join(" "),
          action: () => openWorkspaceFile(skill.relativePath, {
            projectPath: skill.root,
            projectLabel: skill.name || skill.id || t.skills,
            force: true,
          }),
        };
      });

    const mcpServerCommands = (Array.isArray(capabilityCommandStatus?.mcpServers) ? capabilityCommandStatus.mcpServers : [])
      .filter((server) => server?.name)
      .slice(0, 16)
      .map((server) => ({
        id: `capability-mcp:${commandIdSegment(server.name)}`,
        title: `${t.mcpServers}: ${server.name}`,
        subtitle: [
          mcpStatusLabel(server.status, t),
          typeof server.tools === "number" ? `${t.tools}: ${server.tools}` : "",
          server.transport,
          server.source || server.detail,
        ].filter(Boolean).join(" · "),
        group: t.capabilities,
        keywords: [
          "mcp server tool capability claude code transport source error",
          server.name,
          server.status,
          server.detail,
          server.raw,
          server.tools,
          server.transport,
          server.source,
          server.error,
        ].filter(Boolean).join(" "),
        action: () => openCapabilitiesSurface("mcp", {
          kind: "mcp",
          id: server.name,
          query: server.name,
        }),
      }));

    const marketplaceSourceCommands = (Array.isArray(capabilityCommandStatus?.marketplaces) ? capabilityCommandStatus.marketplaces : [])
      .filter((marketplace) => marketplace?.name)
      .slice(0, 16)
      .map((marketplace) => ({
        id: `capability-marketplace-source:${commandIdSegment(marketplace.name)}`,
        title: `${t.marketplaceSources}: ${marketplace.name}`,
        subtitle: [
          marketplace.status,
          marketplace.version && `${t.version}: ${marketplace.version}`,
          marketplace.repo || marketplace.source || marketplace.installLocation,
        ].filter(Boolean).join(" · "),
        group: t.capabilities,
        keywords: [
          "marketplace source plugin catalog capability claude code",
          marketplace.name,
          marketplace.status,
          marketplace.version,
          marketplace.source,
          marketplace.repo,
          marketplace.installLocation,
          marketplace.tools,
          marketplace.permissions,
          marketplace.error,
        ].filter(Boolean).join(" "),
        action: () => openCapabilitiesSurface("marketplace", {
          kind: "marketplace-source",
          id: marketplace.name,
          query: marketplace.name,
        }),
      }));

    const customMarketplaceCommands = (Array.isArray(state.settings?.customMarketplaces) ? state.settings.customMarketplaces : [])
      .filter(Boolean)
      .slice(0, 16)
      .map((marketplace) => ({
        id: `capability-custom-marketplace:${commandIdSegment(marketplace)}`,
        title: `${t.customMarketplaces}: ${compactPath(marketplace, 72)}`,
        subtitle: [
          t.customMarketplaceLocalOnly,
          t.customMarketplaceNotInjected,
          t.settings,
        ].filter(Boolean).join(" · "),
        group: t.capabilities,
        keywords: [
          "custom marketplace plugin catalog local settings not injected",
          marketplace,
          t.customMarketplaces,
          t.customMarketplaceLocalOnly,
          t.customMarketplaceNotInjected,
        ].filter(Boolean).join(" "),
        action: () => openCapabilitiesSurface("marketplace", {
          kind: "custom-marketplace",
          id: marketplace,
          query: marketplace,
        }),
      }));

    const marketplacePluginCommands = (Array.isArray(capabilityCommandStatus?.marketplacePlugins) ? capabilityCommandStatus.marketplacePlugins : [])
      .filter((plugin) => plugin?.id || plugin?.name)
      .slice(0, 24)
      .map((plugin) => {
        const id = plugin.id || plugin.name;
        return {
          id: `capability-marketplace-plugin:${commandIdSegment(id)}`,
          title: `${t.marketplace}: ${plugin.name || id}`,
          subtitle: [
            plugin.marketplace,
            plugin.installed ? t.installedLocal : t.installFromMarketplace,
            plugin.version && plugin.version !== "unknown" ? `${t.version}: ${plugin.version}` : "",
            plugin.category,
          ].filter(Boolean).join(" · "),
          group: t.capabilities,
          keywords: [
            "marketplace plugin catalog install capability claude code source permissions risk",
            plugin.id,
            plugin.name,
            plugin.marketplace,
            plugin.version,
            plugin.description,
            plugin.category,
            plugin.author,
            plugin.source,
            plugin.permissions,
            plugin.risk,
          ].filter(Boolean).join(" "),
          action: () => openCapabilitiesSurface("marketplace", {
            kind: "marketplace-plugin",
            id,
            query: id,
          }),
        };
      });

    return [
      ...projectCommands,
      ...threadCommands,
      ...threadActionCommands,
      ...runEvidenceCommands,
      ...commandRunCommands,
      ...noticeCommands,
      ...gitFileCommands,
      ...gitHunkCommands,
      ...sourceRefCommands,
      ...browserEvidenceCommands,
      ...browserTimelineCommands,
      ...automationCommands,
      ...automationRunCommands,
      ...subagentCommands,
      ...subagentRunCommands,
      ...installedPluginCommands,
      ...skillRegistryCommands,
      ...skillOpenFileCommands,
      ...mcpServerCommands,
      ...marketplaceSourceCommands,
      ...customMarketplaceCommands,
      ...marketplacePluginCommands,
    ];
  }, [state.projects, state.sessions, state.notices, state.sourceRefs, state.browserVisits, state.automations, state.subagentRuns, state.commandRuns, state.settings?.customMarketplaces, capabilityCommandStatus, runEvents, environment, t, activeProject?.path, activeProject?.name]);

  async function createAutomation(payload) {
    if (!desktopApi?.createAutomation) return;
    try {
      const next = await desktopApi.createAutomation(payload);
      setState(next);
      if (Array.isArray(next?.runEvents)) setRunEvents((current) => mergeRunEvents(current, next.runEvents));
      showToast(t.automationCreated);
    } catch (error) {
      showToast(error.message || String(error));
      throw error;
    }
  }

  async function deleteAutomation(automation) {
    if (!desktopApi?.deleteAutomation || !automation) return;
    try {
      const next = await desktopApi.deleteAutomation({ automationId: automation.id });
      setState(next);
      if (Array.isArray(next?.runEvents)) setRunEvents((current) => mergeRunEvents(current, next.runEvents));
      showToast(t.automationDeleted);
    } catch (error) {
      showToast(error.message || String(error));
      throw error;
    }
  }

  async function toggleAutomationEnabled(automation, enabled) {
    if (!desktopApi?.setAutomationEnabled || !automation) return;
    try {
      const next = await desktopApi.setAutomationEnabled({ automationId: automation.id, enabled });
      setState(next);
      if (Array.isArray(next?.runEvents)) setRunEvents((current) => mergeRunEvents(current, next.runEvents));
      showToast(enabled ? t.automationResumed : t.automationPaused);
    } catch (error) {
      showToast(error.message || String(error));
      throw error;
    }
  }

  async function runAutomationNow(automation) {
    if (!desktopApi?.runAutomationNow || !automation) return;
    const requestId = `automation_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setBottomPanel("outputs");
    recordRunEvent({
      id: requestId,
      type: "automation",
      status: "running",
      title: `${t.scheduled}: ${messageExcerpt(automation.prompt, 60)}`,
      detail: automationProjectLabel(automation, t),
    });
    showToast(t.automationRunning);
    const next = await desktopApi.runAutomationNow({ automationId: automation.id, requestId });
    setState(next);
    if (Array.isArray(next?.runEvents)) setRunEvents((current) => mergeRunEvents(current, next.runEvents));
    const run = next.automationRun;
    const succeeded = run?.status === "succeeded";
    const finalDetail = succeeded ? (run.detail || t.automationSucceeded) : (run?.error || t.automationFailed);
    recordRunEvent({
      id: requestId,
      type: "automation",
      status: succeeded ? "ok" : "error",
      title: `${t.scheduled}: ${messageExcerpt(automation.prompt, 60)}`,
      detail: [t.automationTriggerManual, automationProjectLabel(automation, t), finalDetail].filter(Boolean).join(" · "),
    });
    showToast(succeeded ? t.automationSucceeded : t.automationFailed);
  }

  async function runSubagent(task, nickname = "", context = {}) {
    if (!desktopApi?.runSubagent || !task.trim()) return;
    const requestId = `subagent_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const projectPath = context?.projectPath || activeProject?.path || "";
    const sessionId = context?.sessionId || activeSession?.id || "";
    setBottomPanel("subagents");
    recordRunEvent({
      id: requestId,
      type: "subagent",
      status: "running",
      title: `${t.subagents}: ${nickname || "Subagent"}`,
      detail: messageExcerpt(task, 120),
      projectPath,
      sessionId,
    });
    showToast(t.subagentStarted);
    const next = await desktopApi.runSubagent({
      projectPath,
      sessionId,
      task,
      nickname,
      requestId,
    });
    setState(next);
    if (Array.isArray(next?.runEvents)) setRunEvents((current) => mergeRunEvents(current, next.runEvents));
    const run = next.subagentRun;
    const ok = run?.status === "done";
    recordRunEvent({
      id: run?.requestId || requestId,
      type: "subagent",
      status: ok ? "ok" : run?.status === "cancelled" ? "cancelled" : "error",
      title: `${t.subagents}: ${run?.nickname || nickname || "Subagent"}`,
      detail: run?.summary || run?.stderr || messageExcerpt(task, 120),
      projectPath: run?.project?.path || projectPath,
      sessionId: run?.sessionId || sessionId,
    });
    showToast(ok ? t.subagentFinished : t.subagentFailed);
  }

  async function cancelSubagent(run) {
    if (!desktopApi?.cancelSubagent || !run) return;
    const next = await desktopApi.cancelSubagent({ runId: run.id, requestId: run.requestId });
    setState(next);
    if (Array.isArray(next?.runEvents)) setRunEvents((current) => mergeRunEvents(current, next.runEvents));
    recordRunEvent({
      id: run.requestId || run.id,
      type: "subagent",
      status: "cancelled",
      title: `${t.subagents}: ${run.nickname || "Subagent"}`,
      detail: t.subagentStatusCancelled,
    });
  }

  async function archiveSubagent(run, archived = true) {
    if (!desktopApi?.archiveSubagent || !run) return;
    const next = await desktopApi.archiveSubagent({ runId: run.id, requestId: run.requestId, archived });
    setState(next);
    if (Array.isArray(next?.runEvents)) setRunEvents((current) => mergeRunEvents(current, next.runEvents));
    showToast(archived ? t.subagentArchived : t.subagentRestored);
  }

  async function continueSubagent(run) {
    if (!desktopApi?.continueSubagent || !run || !activeSession) return;
    const next = await desktopApi.continueSubagent({
      runId: run.id,
      requestId: run.requestId,
      sessionId: activeSession.id,
    });
    setState(next);
    if (next?.selectedSessionId) setActiveSessionId(next.selectedSessionId);
    setProjectScope("current");
    showToast(t.subagentContinued);
  }

  async function sendMessage(content) {
    if (!desktopApi || !activeSession) return;
    const requestId = `request_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    let resumeClaudeSessionId = activeSession.claudeSessionId || "";
    if (!resumeClaudeSessionId && desktopApi.getState) {
      try {
        const freshState = await desktopApi.getState();
        resumeClaudeSessionId = freshState?.sessions?.find((session) => session.id === activeSession.id)?.claudeSessionId || "";
      } catch {
        resumeClaudeSessionId = "";
      }
    }
    setCurrentRequestId(requestId);
    setOptimisticUser({ sessionId: activeSession.id, content: content.trim(), createdAt: new Date().toISOString() });
    setStreamingAssistant({ requestId, content: "", status: t.waiting, activities: [] });
    setBusy(true);
    recordRunEvent({
      id: requestId,
      type: "chat",
      status: "running",
      title: `${t.activeThread}: ${activeSession.title || "Claudex"}`,
      detail: content.trim().slice(0, 140),
    });
    try {
      const next = await desktopApi.sendMessage({
        sessionId: activeSession.id,
        content,
        requestId,
        claudeSessionId: resumeClaudeSessionId,
      });
      setState(next);
      setActiveSessionId(activeSession.id);
      recordRunEvent({
        id: requestId,
        type: "chat",
        status: "ok",
        title: `${t.activeThread}: ${activeSession.title || "Claudex"}`,
        detail: t.commandSucceeded,
      });
    } catch (error) {
      recordRunEvent({
        id: requestId,
        type: "chat",
        status: "error",
        title: `${t.activeThread}: ${activeSession.title || "Claudex"}`,
        detail: error.message || String(error),
      });
      throw error;
    } finally {
      setBusy(false);
      setCurrentRequestId("");
      setStreamingAssistant(null);
      setOptimisticUser(null);
    }
  }

  async function cancelMessage() {
    if (!desktopApi || !currentRequestId) return;
    await desktopApi.cancelRequest(currentRequestId);
  }

  async function retryLast() {
    const lastUser = [...(activeSession?.messages || [])].reverse().find((message) => message.role === "user");
    if (lastUser) await sendMessage(lastUser.content);
  }

  async function selectProject() {
    if (!desktopApi) return;
    const next = await desktopApi.selectProject();
    if (next) {
      setProjectScope("current");
      applySessionState(next, "", "current");
      showToast(t.projectSelected);
    }
  }

  async function setActiveProject(project) {
    if (!desktopApi || !project) return;
    const next = await desktopApi.setActiveProject(project);
    setProjectScope("current");
    applySessionState(next, "", "current");
    showToast(t.projectSelected);
  }

  async function openProject() {
    await desktopApi?.openProject(activeProject?.path);
  }

  async function openTerminal(projectPath = "") {
    const requestedPath = typeof projectPath === "string" ? projectPath : "";
    await desktopApi?.openTerminal(requestedPath || activeProject?.path);
    showToast(t.terminalOpened);
  }

  async function openIde() {
    if (!desktopApi?.openIde) {
      await openProject();
      return;
    }
    await desktopApi.openIde({ projectPath: activeProject?.path, ideId: selectedIdeId });
  }

  async function openInteractiveClaudeFromChat(options = {}) {
    if (!desktopApi?.openClaudeTerminal) {
      showToast(t.desktopOnly);
      return;
    }
    const payload = options && typeof options === "object" && !("currentTarget" in options)
      ? options
      : {};
    await desktopApi.openClaudeTerminal({
      projectPath: payload.projectPath || activeProject?.path,
      prompt: payload.prompt || "",
    });
  }

  async function openBrowserUrl(url) {
    const next = await desktopApi?.openBrowserUrl({ url, projectPath: activeProject?.path || "" });
    if (next?.browserVisits) setState(next);
    showToast(t.browserOpened);
  }

  function openBrowserVisit(visit) {
    const nextUrl = normalizeBrowserUrl(visit?.url || browserVisitFinalUrl(visit));
    if (!nextUrl) return;
    setBrowserOpenRequest({ url: nextUrl, id: visit?.id || "", nonce: Date.now() });
    activateTool("browser");
  }

  function openExternalBrowserVisit(visit) {
    const nextUrl = browserVisitFinalUrl(visit) || visit?.url;
    if (!nextUrl) return;
    openBrowserUrl(nextUrl);
  }

  async function toggleCapability(id, enabled) {
    const nextCaps = { ...(state.settings.capabilities || {}), [id]: enabled };
    const next = await desktopApi.saveCapabilities(nextCaps);
    setState(next);
    showToast(t.saved);
  }

  async function copyMessage(content) {
    const text = String(content || "");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } finally {
        textarea.remove();
      }
    }
    showToast(t.copied);
  }

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(false);
  const [bottomPanel, setBottomPanel] = useState("");
  const [runTimelineFocus, setRunTimelineFocus] = useState({ id: "", nonce: 0 });
  const [gitPanelFocus, setGitPanelFocus] = useState({ path: "", hunkId: "", all: false, nonce: 0 });
  const [sourcePanelFocus, setSourcePanelFocus] = useState({ id: "", path: "", nonce: 0 });
  const [browserPanelFocus, setBrowserPanelFocus] = useState({ id: "", url: "", nonce: 0 });
  const [taskCenterFocus, setTaskCenterFocus] = useState({ type: "", id: "", nonce: 0 });
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  const [browserOpenRequest, setBrowserOpenRequest] = useState({ url: "", id: "", nonce: 0 });
  const [workspaceOpenRequest, setWorkspaceOpenRequest] = useState({ path: "", projectPath: "", projectLabel: "", force: false, nonce: 0 });

  function openSettingsSurface(initialSection = "general") {
    const nextSection = settingsSectionCommandSpecs(t).some((section) => section.id === initialSection) ? initialSection : "general";
    setCapabilitiesOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    setSettingsInitialSection(nextSection);
    setSettingsOpen(true);
  }

  function openCapabilitiesSurface(initialTab = "plugins", focus = null) {
    const nextTab = ["plugins", "mcp", "skills", "marketplace"].includes(initialTab) ? initialTab : "plugins";
    setSettingsOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    setCapabilityInitialTab(nextTab);
    setCapabilityFocus(focus
      ? { ...focus, tab: nextTab, nonce: Date.now() }
      : { tab: nextTab, kind: "", id: "", query: "", nonce: Date.now() });
    setCapabilitiesOpen(true);
  }

  function openProjectsSurface() {
    setSettingsOpen(false);
    setCapabilitiesOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    setProjectsOpen(true);
  }

  function openScheduledSurface() {
    setSettingsOpen(false);
    setCapabilitiesOpen(false);
    setProjectsOpen(false);
    setCommandsOpen(false);
    setScheduledOpen(true);
  }

  function openThreadScope(scope) {
    const nextScope = ["current", "all", "archived"].includes(scope) ? scope : "current";
    setSettingsOpen(false);
    setCapabilitiesOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    setBottomPanel("");
    setSidebarVisible(true);
    setProjectScope(nextScope);
    const nextSessionId = selectSessionIdForProject(state, t, activeProject, activeSessionId, nextScope);
    setActiveSessionId(nextSessionId);
  }

  function openBottomPanel(id, options = {}) {
    setSettingsOpen(false);
    setCapabilitiesOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    if (id === "changes" && options.resetGitFocus !== false) {
      setGitPanelFocus({ path: "", hunkId: "", all: true, nonce: Date.now() });
    }
    setBottomPanel(id);
  }

  function openRunTimeline(eventId = "") {
    const focusedId = String(eventId || "").trim();
    setRunTimelineFocus({ id: focusedId, nonce: Date.now() });
    openBottomPanel("outputs");
  }

  function openGitFileDiff(pathValue = "", hunkId = "", options = {}) {
    const focusedPath = String(pathValue || "").trim();
    setGitPanelFocus({
      path: focusedPath,
      hunkId: String(hunkId || "").trim(),
      all: Boolean(options.all),
      nonce: Date.now(),
    });
    openBottomPanel("changes", { resetGitFocus: false });
  }

  function openSourceEvidence(source = {}) {
    setSourcePanelFocus({
      id: sourceRefKey(source),
      path: source.path || "",
      nonce: Date.now(),
    });
    openBottomPanel("sources");
  }

  function openBrowserEvidence(visit = {}) {
    setBrowserPanelFocus({
      id: browserVisitKey(visit),
      url: visit.url || browserVisitFinalUrl(visit),
      nonce: Date.now(),
    });
    openBottomPanel("browser");
  }

  function openWorkspaceFile(pathValue = "", options = {}) {
    const focusedPath = String(pathValue || "").trim();
    if (!focusedPath) {
      activateTool("workspace");
      return;
    }
    setWorkspaceOpenRequest({
      path: focusedPath,
      projectPath: String(options.projectPath || "").trim(),
      projectLabel: String(options.projectLabel || "").trim(),
      force: options.force !== false,
      nonce: Date.now(),
    });
    activateTool("workspace");
  }

  function openNoticeTarget(notice = {}) {
    const action = String(notice?.action || "");
    if (action.startsWith("git-run:")) {
      const eventId = decodeActionSuffix(action, "git-run:");
      setRunTimelineFocus({ id: eventId, nonce: Date.now() });
      openBottomPanel("changes");
      return;
    }
    if (action.startsWith("run:")) {
      openRunTimeline(decodeActionSuffix(action, "run:"));
      return;
    }
    if (action.startsWith("workspace:file:")) {
      openWorkspaceFile(decodeActionSuffix(action, "workspace:file:"), { force: true });
      return;
    }
    if (action.startsWith("capability:")) {
      const focus = capabilityFocusFromAction(action);
      openCapabilitiesSurface(focus.tab, focus.kind || focus.id ? focus : null);
      return;
    }
    if (action.startsWith("runtime-health:")) {
      const target = action.split(":")[1] || "";
      if (["plugins", "skills", "mcp", "marketplace"].includes(target)) {
        openCapabilitiesSurface(target);
        return;
      }
      if (target === "claude") {
        activateTool("claude");
        return;
      }
    }
    if (action.startsWith("automation:")) {
      const automationId = decodeActionSuffix(action, "automation:");
      if (automationId) {
        openTaskCenterFocus("automation", automationId, {
          expandEvidence: true,
          expandHistory: true,
        });
        return;
      }
      openScheduledSurface();
      return;
    }
    if (action.startsWith("subagent:")) {
      const subagentId = decodeActionSuffix(action, "subagent:");
      if (subagentId) {
        openTaskCenterFocus("subagent", subagentId, {
          expandEvidence: true,
          expandArtifacts: true,
        });
        return;
      }
    }
    openBottomPanel("notices");
  }

  function openTaskCenterFocus(type, id = "", options = {}) {
    const focusedId = String(id || "").trim();
    setSettingsOpen(false);
    setCapabilitiesOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    setTaskCenterFocus({
      type,
      id: focusedId,
      expandEvidence: Boolean(options.expandEvidence),
      expandArtifacts: Boolean(options.expandArtifacts),
      expandHistory: Boolean(options.expandHistory),
      nonce: Date.now(),
    });
    setBottomPanel("subagents");
  }

  function activateTool(tool) {
    setSettingsOpen(false);
    setCapabilitiesOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    setRightPanelVisible(true);
    setSelectedTool(tool);
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) {
        if (isShortcutHelpKey(event)) {
          event.preventDefault();
          setShortcutsOpen(true);
          return;
        }
        if (isEditableNavigationShortcut(event)) {
          event.preventDefault();
        }
        return;
      }
      // Cmd/Ctrl+K：命令面板
      if (isPrimaryShortcut(event, "k")) {
        event.preventDefault();
        setCommandsOpen(true);
      }
      // Cmd/Ctrl+N：新聊天
      if (isPrimaryShortcut(event, "n")) {
        event.preventDefault();
        createSession();
      }
      // Cmd/Ctrl+,：设置
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        openSettingsSurface();
      }
      // Cmd/Ctrl+P：项目
      if (isPrimaryShortcut(event, "p")) {
        event.preventDefault();
        openProjectsSurface();
      }
      // Cmd/Ctrl+B：打开/关闭左侧栏
      if (isPrimaryShortcut(event, "b")) {
        event.preventDefault();
        setSidebarVisible((v) => !v);
      }
      // Cmd/Ctrl+\：打开/关闭右侧面板
      if ((event.ctrlKey || event.metaKey) && event.key === "\\") {
        event.preventDefault();
        setRightPanelVisible((v) => !v);
      }
      // Cmd/Ctrl+Shift+F：搜索聊天
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        // Focus search input if exists
        document.querySelector('.nav-search input')?.focus();
      }
      // Cmd/Ctrl+/：快捷键帮助
      if (isShortcutHelpKey(event)) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      // Cmd/Ctrl+T：打开/关闭浏览器
      if (isPrimaryShortcut(event, "t")) {
        event.preventDefault();
        if (rightPanelVisible && selectedTool === "browser") {
          setSelectedTool("");
          setRightPanelVisible(false);
        } else {
          setRightPanelVisible(true);
          setSelectedTool("browser");
        }
      }
      // Escape：关闭弹窗
      if (event.key === "Escape") {
        setCommandsOpen(false);
        setProjectsOpen(false);
        setCapabilitiesOpen(false);
        setScheduledOpen(false);
        setSettingsOpen(false);
        setShortcutsOpen(false);
        setSelectedTool("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const settingsSectionCommands = settingsSectionCommandSpecs(t).map((section) => ({
    id: `settings-section:${section.id}`,
    title: `${t.settings}: ${section.label}`,
    subtitle: t.backedLocalState,
    group: t.settings,
    keywords: [
      "settings section preference configuration status deep link",
      `${section.id} settings`,
      `${section.label} settings`,
      section.id,
      section.label,
      section.keywords,
    ].filter(Boolean).join(" "),
    action: () => openSettingsSurface(section.id),
  }));

  const commands = [
    { id: "new", title: t.newChat, subtitle: t.chats, group: t.chats, kbd: "Ctrl+N", keywords: "聊天 对话 会话", action: createSession },
    { id: "threads-current", title: t.projectFilteredChats, subtitle: t.chats, group: t.chats, keywords: "current project chats threads 当前项目 聊天 线程 历史", action: () => openThreadScope("current") },
    { id: "threads-all", title: t.allProjectChats, subtitle: t.chats, group: t.chats, keywords: "all project chats threads history 全部项目 聊天 线程 历史", action: () => openThreadScope("all") },
    { id: "threads-archived", title: t.showArchivedChats, subtitle: t.chats, group: t.chats, keywords: "archived chats threads restore 归档聊天 查看归档 恢复 聊天 历史", action: () => openThreadScope("archived") },
    { id: "project", title: t.selectProject, subtitle: t.activeProject, group: t.activeProject, kbd: "Ctrl+P", keywords: "文件夹 工作区 项目", action: openProjectsSurface },
    { id: "terminal", title: t.openTerminal, subtitle: projectLabel(activeProject, t), group: t.tools, keywords: "终端 shell powershell", action: openTerminal },
    { id: "settings", title: t.settings, subtitle: t.setupProvider, group: t.settings, kbd: "Ctrl+,", keywords: "服务商 api key 模型 设置", action: openSettingsSurface },
    { id: "capabilities", title: t.capabilities, subtitle: t.plugins, group: t.capabilities, keywords: "插件 技能 工具", action: openCapabilitiesSurface },
    { id: "capability-plugins", title: t.plugins, subtitle: t.capabilities, group: t.capabilities, priority: 80, keywords: "plugins installed installed plugins claude code 插件 已安装 capability", action: () => openCapabilitiesSurface("plugins") },
    { id: "capability-skills", title: t.skills, subtitle: t.localSkillRegistry, group: t.capabilities, priority: 80, keywords: "skills registry local SKILL.md 技能 本地 能力", action: () => openCapabilitiesSurface("skills") },
    { id: "capability-mcp", title: t.mcps, subtitle: t.mcpServers, group: t.capabilities, priority: 100, keywords: "mcp servers tools mcps server 工具 服务器", action: () => openCapabilitiesSurface("mcp") },
    { id: "capability-marketplace", title: t.marketplace, subtitle: t.marketplaceCatalog, group: t.capabilities, priority: 80, keywords: "marketplace catalog install plugin 市场 插件目录 安装", action: () => openCapabilitiesSurface("marketplace") },
    ...settingsSectionCommands,
    { id: "automation", title: t.scheduled, subtitle: t.scheduledTitle, group: t.scheduled, keywords: "automation schedule 自动化 计划 任务", action: openScheduledSurface },
    { id: "tool-workspace", title: t.workspaceTool, subtitle: t.openSidePanel, group: t.tools, keywords: "workspace files editor diff 工作区 文件 编辑", action: () => activateTool("workspace") },
    { id: "tool-claude", title: t.claudeCodeTool, subtitle: t.openSidePanel, group: t.tools, keywords: "claude code cli plugin mcp terminal", action: () => activateTool("claude") },
    { id: "tool-browser", title: t.browser, subtitle: t.openSidePanel, group: t.tools, kbd: "Ctrl+T", keywords: "browser preview web 网页 浏览器", action: () => activateTool("browser") },
    { id: "tool-terminal", title: t.terminal, subtitle: t.openSidePanel, group: t.tools, keywords: "terminal shell command powershell 终端 命令", action: () => activateTool("terminal") },
    { id: "panel-outputs", title: t.outputs, subtitle: t.bottomPanel, group: t.bottomPanel, keywords: "outputs run timeline evidence 输出 证据 时间线", action: () => openBottomPanel("outputs") },
    { id: "panel-notices", title: t.noticeCenter, subtitle: t.bottomPanel, group: t.bottomPanel, keywords: "notices errors warnings failures 错误 通知 告警", action: () => openBottomPanel("notices") },
    { id: "panel-environment", title: t.environment, subtitle: t.bottomPanel, group: t.bottomPanel, keywords: "environment cwd git ide 环境 项目", action: () => openBottomPanel("environment") },
    { id: "panel-changes", title: t.changes, subtitle: t.gitDiffPreview, group: t.bottomPanel, keywords: "changes git diff status 变更 差异", action: () => openGitFileDiff("", "", { all: true }) },
    { id: "panel-sources", title: t.sources, subtitle: t.bottomPanel, group: t.bottomPanel, keywords: "sources files project 来源 文件", action: () => openBottomPanel("sources") },
    { id: "panel-subagents", title: t.subagents, subtitle: t.bottomPanel, group: t.bottomPanel, keywords: "subagents agents 子代理 agent", action: () => openBottomPanel("subagents") },
    { id: "panel-task-center", title: t.taskCenter, subtitle: t.bottomPanel, group: t.bottomPanel, keywords: "task center automations subagents evidence 任务中心 自动化 子代理", action: () => openBottomPanel("subagents") },
    ...stateDeepLinkCommands,
    { id: "review", title: t.quickReview, subtitle: t.schedulePrompt, group: t.chats, keywords: "审查 代码 风险", action: () => setDraft(t.quickReview) },
    { id: "plan", title: t.quickPlan, subtitle: t.schedulePrompt, group: t.chats, keywords: "计划 实现 验证", action: () => setDraft(t.quickPlan) },
    {
      id: "data",
      title: t.openData,
      subtitle: t.dataFile,
      group: t.settings,
      keywords: "存储 历史 数据",
      action: async () => {
        await desktopApi?.openDataFile();
        showToast(t.dataOpened);
      },
    },
  ];
  const appearance = state.settings.appearance || {};
  const surfaceOpen = settingsOpen || capabilitiesOpen;
  const appClassName = cx(
    "app-shell",
    (!appearance.fontSize || appearance.fontSize === "compact") && "font-compact",
    appearance.fontSize === "default" && "font-default",
    appearance.fontSize === "large" && "font-large",
    appearance.density === "comfortable" && "density-comfortable",
  );
  const gridClassName = cx(
    "app-grid",
    !sidebarVisible && "sidebar-hidden",
    !rightPanelVisible && "right-panel-hidden",
    surfaceOpen && "surface-open",
    settingsOpen && "settings-open",
  );

  return (
    <div className={appClassName} lang={lang}>
      {!desktopApi && <div className="desktop-warning">{t.desktopOnly}</div>}
      {loadError && <div className="desktop-warning">{loadError}</div>}
      {toast && <div className="toast"><Check size={15} />{toast}</div>}
      <div className={gridClassName}>
        <Sidebar
          state={state}
          activeProject={activeProject}
          projectPathMissing={projectPathMissing}
          projectScope={projectScope}
          onProjectScopeChange={setProjectScope}
          activeSessionId={activeSession?.id}
          setActiveSessionId={setActiveSessionId}
          query={query}
          setQuery={setQuery}
          onNewChat={createSession}
          onSettings={openSettingsSurface}
          onScheduled={openScheduledSurface}
          onCapabilities={openCapabilitiesSurface}
          onSelectProject={selectProject}
          onSetProject={setActiveProject}
          onRenameThread={renameThread}
          onTogglePinThread={togglePinThread}
          onArchiveThread={archiveThread}
          onForkThread={forkThread}
          onDeleteThread={deleteThread}
          onResumeThread={resumeThread}
          onToggleSidebar={() => setSidebarVisible((current) => !current)}
          loading={stateLoading}
          loadError={loadError}
          onRetryLoad={retryLoadDesktopState}
          streamingSessionId={streamingSessionId}
          lang={lang}
          t={t}
        />
        {settingsOpen ? (
          <SettingsModal
            state={state}
            lang={lang}
            t={t}
            onClose={() => setSettingsOpen(false)}
            onSaved={(next) => setState(next)}
            onOpenTool={activateTool}
            onOpenBottomPanel={openBottomPanel}
            onOpenCapabilities={openCapabilitiesSurface}
            onOpenProjects={openProjectsSurface}
            surface
            initialSection={settingsInitialSection}
          />
        ) : capabilitiesOpen ? (
          <CapabilityModal
            state={state}
            lang={lang}
            t={t}
            onClose={() => setCapabilitiesOpen(false)}
            onToggle={toggleCapability}
            onSaved={(next) => setState(next)}
            onOpenClaudePanel={() => activateTool("claude")}
            onNotice={recordNotice}
            onRunEvent={recordRunEvent}
            onOpenBottomPanel={(panel) => setBottomPanel(panel)}
            onOpenWorkspaceFile={openWorkspaceFile}
            onCommandRuns={(commandRuns) => setState((current) => ({ ...current, commandRuns }))}
            onStatus={setCapabilityCommandStatus}
            surface
            initialTab={capabilityInitialTab}
            focus={capabilityFocus}
          />
        ) : (
        <Conversation
          session={activeSession}
          sessions={state.sessions}
          settings={state.settings}
          activeProject={activeProject}
          projectPathMissing={projectPathMissing}
          hasKey={hasKey}
          onSend={sendMessage}
          onCancel={cancelMessage}
          onSelectProject={openProjectsSurface}
          onSettings={openSettingsSurface}
          onCapabilities={openCapabilitiesSurface}
          onRunEvent={recordRunEvent}
          onCopy={copyMessage}
          onRetry={retryLast}
          onOpenInteractiveClaude={openInteractiveClaudeFromChat}
          sidebarVisible={sidebarVisible}
          onToggleSidebar={() => setSidebarVisible((current) => !current)}
          rightPanelVisible={rightPanelVisible}
          onToggleTools={() => setRightPanelVisible((current) => !current)}
          bottomPanel={bottomPanel}
          setBottomPanel={setBottomPanel}
          onActivateTool={activateTool}
          onOpenAutomation={openScheduledSurface}
          onOpenTaskCenterFocus={openTaskCenterFocus}
          onOpenTerminal={openTerminal}
          onOpenProject={openProject}
          busy={busy}
          streamingAssistant={streamingAssistant}
          optimisticUser={optimisticUser?.sessionId === activeSession?.id ? optimisticUser : null}
          runEvents={runEvents}
          automations={state.automations}
          subagentRuns={state.subagentRuns}
          commandRuns={state.commandRuns}
          onCommandRuns={(commandRuns) => setState((current) => ({ ...current, commandRuns }))}
          sourceRefs={state.sourceRefs}
          browserVisits={state.browserVisits}
          onOpenBrowserVisit={openBrowserVisit}
          onOpenExternalBrowserVisit={openExternalBrowserVisit}
          notices={state.notices}
          onDismissNotice={dismissNotice}
          onClearNotices={clearNotices}
          onRunAutomationNow={runAutomationNow}
          onToggleAutomationEnabled={toggleAutomationEnabled}
          onDeleteAutomation={deleteAutomation}
          onRunSubagent={runSubagent}
          onCancelSubagent={cancelSubagent}
          onArchiveSubagent={archiveSubagent}
          onContinueSubagent={continueSubagent}
          onRetryWorkspaceCommand={runPersistedWorkspaceCommand}
          onRetryClaudeCommand={runPersistedClaudeCommand}
          onRetryCapabilityCommand={runPersistedCapabilityCommand}
          onConfirmCapabilityCommand={openCapabilityRetryConfirmation}
          onOpenRunTimeline={openRunTimeline}
          onOpenWorkspaceFile={openWorkspaceFile}
          runTimelineFocus={runTimelineFocus}
          gitPanelFocus={gitPanelFocus}
          sourcePanelFocus={sourcePanelFocus}
          browserPanelFocus={browserPanelFocus}
          taskCenterFocus={taskCenterFocus}
          draft={draft}
          setDraft={setDraft}
          composerFocusToken={composerFocusToken}
          environment={environment}
          onRefreshEnvironment={refreshEnvironment}
          ideOptions={ideOptions}
          selectedIdeId={selectedIdeId}
          setSelectedIdeId={setSelectedIdeId}
          onOpenIde={openIde}
          lang={lang}
          t={t}
        />
        )}
        {!surfaceOpen && !rightPanelVisible && (
          <ToolRail
            activeProject={activeProject}
            environment={environment}
            selectedTool={selectedTool}
            onActivateTool={activateTool}
            onSettings={openSettingsSurface}
            onCapabilities={openCapabilitiesSurface}
            busy={busy}
            t={t}
          />
        )}
        {!surfaceOpen && (
        <ToolsPanel
          activeProject={activeProject}
          settings={state.settings}
          environment={environment}
          onRefreshEnvironment={refreshEnvironment}
          ideOptions={ideOptions}
          selectedIdeId={selectedIdeId}
          setSelectedIdeId={setSelectedIdeId}
          onOpenIde={openIde}
          selectedTool={selectedTool}
          setSelectedTool={setSelectedTool}
          onSettings={openSettingsSurface}
          onOpenProject={openProject}
          onOpenTerminal={openTerminal}
          onOpenBrowserUrl={openBrowserUrl}
          onCapabilities={openCapabilitiesSurface}
          onOpenBottomPanel={openBottomPanel}
          onRunEvent={recordRunEvent}
          onSourceRefs={(sourceRefs) => setState((current) => ({ ...current, sourceRefs }))}
          subagentRuns={state.subagentRuns}
          sourceRefs={state.sourceRefs}
          commandRuns={state.commandRuns}
          onCommandRuns={(commandRuns) => setState((current) => ({ ...current, commandRuns }))}
          browserVisits={state.browserVisits}
          onBrowserVisits={(browserVisits) => setState((current) => ({ ...current, browserVisits }))}
          browserOpenRequest={browserOpenRequest}
          workspaceOpenRequest={workspaceOpenRequest}
          onClose={() => setRightPanelVisible(false)}
          t={t}
        />
        )}
      </div>
      <footer className="statusbar">
        <span>Claudex</span>
        <span>{providerDefaults(state.settings.provider).name}</span>
        <span>{state.settings.model}</span>
        <span>{state.settings.provider === "ollama" || hasKey ? t.ready : t.needsKey}</span>
      </footer>
      {projectsOpen && (
        <ProjectModal
          state={state}
          t={t}
          onClose={() => setProjectsOpen(false)}
          onSelectProject={selectProject}
          onSetProject={setActiveProject}
          onOpenProject={openProject}
          onOpenTerminal={openTerminal}
        />
      )}
      {commandsOpen && <CommandPalette commands={commands} t={t} onClose={() => setCommandsOpen(false)} />}
      {scheduledOpen && (
        <ScheduledModal
          t={t}
          lang={lang}
          activeProject={activeProject}
          activeSession={activeSession}
          sessions={state.sessions}
          automations={state.automations}
          onClose={() => setScheduledOpen(false)}
          onCreate={createAutomation}
          onRunNow={runAutomationNow}
          onDelete={deleteAutomation}
          onToggleEnabled={toggleAutomationEnabled}
          onCopy={copyMessage}
          onOpenRunTimeline={openRunTimeline}
        />
      )}
      {shortcutsOpen && <KeyboardShortcutsModal t={t} onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

function KeyboardShortcutsModal({ t, onClose }) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const mod = isMac ? 'Cmd' : 'Ctrl';
  const modalRef = useRef(null);
  useFocusTrap(modalRef);

  const shortcuts = [
    { keys: `${mod}+K`, action: t.commandPalette },
    { keys: `${mod}+N`, action: t.newChat },
    { keys: `${mod}+,`, action: t.settings },
    { keys: `${mod}+P`, action: t.projects },
    { keys: `${mod}+B`, action: t.toggleSidebar },
    { keys: `${mod}+\\`, action: t.toggleRightPanel },
    { keys: `${mod}+Shift+F`, action: t.search },
    { keys: `${mod}+T`, action: t.toggleBrowser },
    { keys: `${mod}+/`, action: t.showShortcuts },
    { keys: 'Escape', action: t.closeModal },
    { keys: 'Enter', action: t.sendMessageShortcut },
    { keys: 'Shift+Enter', action: t.newLineShortcut },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t.shortcutsTitle}
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>{t.shortcutsTitle}</h2>
            <p>{t.shortcutsSubtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button" title={t.close} aria-label={t.close}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">
          <div className="shortcuts-grid">
            {shortcuts.map((shortcut, i) => (
              <div key={i} className="shortcut-row">
                <kbd className="shortcut-keys">{shortcut.keys}</kbd>
                <span className="shortcut-action">{shortcut.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
