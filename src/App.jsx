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
    localCapability: "本地能力",
    installedCliState: "已安装 CLI 状态",
    settingsStatusHint: "这个页面显示 Claudex 本地状态和 Claude Code CLI 输出。",
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
    commitOrPush: "提交或推送",
    sources: "来源",
    subagents: "子代理",
    noSourcesYet: "暂无来源",
    noSubagentsYet: "没有运行中的子代理",
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
    confirmDisableTitle: "要禁用这个插件吗？",
    confirmDisableWarning: "这会禁用「{name}」。之后可以通过重新安装或更新来重新启用它。",
    confirmDisableButton: "确认禁用",
    dismissAction: "取消",
    installedPlugins: "已安装的插件",
    pluginRefresh: "刷新",
    pluginsLoading: "正在加载插件...",
    pluginsEmpty: "尚未安装任何插件。",
    pluginsLoadError: "无法加载插件列表。",
    pluginStatusEnabled: "已启用",
    pluginStatusDisabled: "已禁用",
    enablePlugin: "启用",
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
    marketplaceHint: "市场命令由 Claude Code CLI 支撑。安装前请在 Claude Code 面板获取实时市场输出。",
    marketplaceSourceClaude: "Claude Code 市场",
    marketplaceSourceCustom: "自定义市场",
    managePlugins: "管理",
    openClaudePanel: "打开 Claude 面板",
    noCapabilities: "没有匹配的能力。",
    enabled: "已启用",
    disabled: "已关闭",
    activeProject: "当前项目",
    noProjectPath: "还没有选择文件夹。",
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
    scheduledSubtitle: "先保存稍后要跑的提示词，准备好后点立即运行。",
    schedulePrompt: "提示词",
    schedulePromptPlaceholder: "稍后要让 Claude Code 做什么？",
    scheduleTime: "时间",
    addSchedule: "添加任务",
    scheduleQueue: "队列",
    scheduleCount: "已保存 {count} 个",
    scheduleAnytime: "任何时间",
    runNow: "立即运行",
    delete: "删除",
    renameThread: "重命名",
    pinThread: "置顶",
    unpinThread: "取消置顶",
    archiveThread: "归档",
    restoreThread: "恢复",
    forkThread: "Fork",
    deleteThread: "删除",
    renameThreadPrompt: "新的聊天标题",
    threadArchived: "聊天已归档",
    threadDeleted: "聊天已删除",
    threadForked: "聊天已 Fork",
    threadPinned: "聊天已置顶",
    threadUnpinned: "已取消置顶",
    deleteThreadConfirm: "确定要永久删除这个聊天吗？",
    projectFilteredChats: "当前项目",
    showArchivedChats: "查看归档",
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
    commandRunning: "运行中",
    cancelCommand: "停止命令",
    commandCancelled: "命令已停止",
    commandSucceeded: "已完成",
    commandFailed: "失败",
    commandHistory: "最近运行",
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

function sidebarThreadItems(sessions, t, activeProject) {
  const seenEmptyDrafts = new Set();
  const items = [];
  const activeProjectKey = String(activeProject?.path || activeProject?.name || "").trim().toLowerCase();
  for (const session of sessions || []) {
    if (session?.archived) continue;
    if (activeProjectKey && sessionProjectKeyForUi(session) !== activeProjectKey) continue;
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

function selectSessionIdForProject(nextState, t, activeProject, preferredId = "") {
  const items = sidebarThreadItems(nextState?.sessions || [], t, activeProject || nextState?.activeProject);
  if (preferredId && items.some((item) => item.session.id === preferredId)) return preferredId;
  return items[0]?.session.id || (nextState?.sessions || []).find((session) => !session.archived)?.id || nextState?.sessions?.[0]?.id || "";
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

function prependRunEvent(current, entry) {
  return [{
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  }, ...current].slice(0, 14);
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
  };
}

function Sidebar({
  state,
  activeProject,
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
  onToggleSidebar,
  loading,
  loadError,
  onRetryLoad,
  streamingSessionId,
  lang,
  t,
}) {
  const threadItems = useMemo(() => sidebarThreadItems(state.sessions, t, activeProject), [state.sessions, t, activeProject]);
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
            {projects.map((project) => (
              <button
                type="button"
                key={project.path || project.name}
                className={cx((state.activeProject?.path || state.activeProject?.name) === (project.path || project.name) && "active")}
                onClick={() => onSetProject(project)}
                title={project.path || project.name}
                aria-label={`${t.projects}: ${projectLabel(project, t)}`}
              >
                <Folder size={15} />
                <span>{projectLabel(project, t)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section chat-section">
          <div className="section-head chat-section-head">
            <span>{t.chats}</span>
            <em title={activeProject?.path || activeProject?.name || ""}>{t.projectFilteredChats}</em>
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
                      <button type="button" onClick={() => onRenameThread(session)} title={t.renameThread} aria-label={t.renameThread}>
                        <Pencil size={12} />
                      </button>
                      <button type="button" onClick={() => onTogglePinThread(session)} title={session.pinned ? t.unpinThread : t.pinThread} aria-label={session.pinned ? t.unpinThread : t.pinThread}>
                        <Pin size={12} />
                      </button>
                      <button type="button" onClick={() => onForkThread(session)} title={t.forkThread} aria-label={t.forkThread}>
                        <GitFork size={12} />
                      </button>
                      <button type="button" onClick={() => onArchiveThread(session)} title={t.archiveThread} aria-label={t.archiveThread}>
                        <Archive size={12} />
                      </button>
                      <button type="button" onClick={() => onDeleteThread(session)} title={t.deleteThread} aria-label={t.deleteThread}>
                        <Trash2 size={12} />
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
  hasKey,
  onSelectProject,
  onSettings,
  onCapabilities,
  draft,
  setDraft,
  justSent,
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
  const projectTitle = activeProject?.path || t.chooseProject;
  const modelTitle = needsProviderSetup ? t.setupProviderHint : settings.model;
  const modelLabel = usesClaudeCode ? displayModelLabel(settings.model) : displayModelLabel(settings.model) || settings.model;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

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
          <button type="button" className="composer-icon-button project-pill" title={projectTitle} aria-label={`${t.projectContext}: ${projectName}`} onClick={onSelectProject}>
            <Folder size={15} />
            <span>{compactPath(projectName, 22)}</span>
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
  settings,
  activeProject,
  hasKey,
  onSend,
  onCancel,
  onSelectProject,
  onSettings,
  onCapabilities,
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
  onOpenTerminal,
  onOpenProject,
  busy,
  streamingAssistant,
  optimisticUser,
  runEvents,
  draft,
  setDraft,
  environment,
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
  const git = environment?.git;
  const gitAvailable = Boolean(git?.available);
  const gitChangesLabel = gitAvailable ? String(git.changes || 0) : t.gitUnavailable;
  const branchLabel = git?.branch || t.gitUnavailable;
  const rawGitStatus = String(git?.raw || "").trim();
  const gitFiles = Array.isArray(git?.files) ? git.files : [];
  const gitStat = String(git?.stat || "").trim();
  const gitDiffText = String(git?.diff?.text || "").trim();
  const gitDiffRows = useMemo(() => buildGitDiffRows(gitDiffText), [gitDiffText]);
  const contextTabs = [
    { id: "environment", label: t.environment, icon: HardDrive, meta: branchLabel },
    { id: "outputs", label: t.outputs, icon: FileText, meta: busy ? t.commandRunning : "" },
    { id: "changes", label: t.changes, icon: GitBranch, meta: gitChangesLabel },
    { id: "sources", label: t.sources, icon: Folder, meta: activeProject?.path ? t.files : "" },
    { id: "subagents", label: t.subagents, icon: Bot, meta: "" },
  ];
  const utilityTabs = [
    { id: "terminal", label: t.terminal, icon: SquareTerminal },
    { id: "browser", label: t.browser, icon: Globe2 },
  ];
  const toggleBottomPanel = (id) => setBottomPanel(bottomPanel === id ? "" : id);

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
              hasKey={hasKey}
              onSelectProject={onSelectProject}
              onSettings={onSettings}
              onCapabilities={onCapabilities}
              draft={draft}
              setDraft={setDraft}
              justSent={justSent}
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
                      <button type="button" onClick={() => onCopy(message.content)} title={t.copy} aria-label={t.copy}>
                        <Copy size={13} />
                      </button>
                      {message.role === "error" && <button type="button" onClick={onSettings}>{t.openSettings}</button>}
                    </div>
                    <p>{message.content}</p>
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
                hasKey={hasKey}
                onSelectProject={onSelectProject}
                onSettings={onSettings}
                onCapabilities={onCapabilities}
                draft={draft}
                setDraft={setDraft}
                justSent={justSent}
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
                onClick={() => setBottomPanel(id)}
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
                <RunTimeline events={runEvents} t={t} />
              </div>
            )}
            {bottomPanel === "environment" && (
              <div className="bottom-panel-grid">
                <div>
                  <span>{t.environment}</span>
                  <strong>{projectLabel(activeProject, t)}</strong>
                  <p title={environment?.cwd || activeProject?.path || t.noProjectPath}>
                    {activeProject?.path ? compactPath(activeProject.path, 78) : t.noProjectPath}
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
                  <div><dt>{t.changes}</dt><dd>{gitChangesLabel}</dd></div>
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
                    <p>{activeProject?.path ? compactPath(activeProject.path, 78) : t.noProjectPath}</p>
                  </div>
                  <div className="bottom-panel-actions">
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
                {gitFiles.length > 0 && (
                  <div className="git-change-list" aria-label={t.changes}>
                    {gitFiles.slice(0, 12).map((item) => (
                      <div className="git-change-item" key={`${item.status}-${item.path}`}>
                        <span className="git-change-status">{item.status}</span>
                        <strong title={item.previousPath ? `${item.previousPath} -> ${item.path}` : item.path}>{item.path}</strong>
                      </div>
                    ))}
                  </div>
                )}
                <pre className="git-status-preview git-stat-preview" aria-label={t.gitDiffStat}>{gitStat || t.noGitDiff}</pre>
                <section className="git-diff-preview" aria-label={t.gitDiffPreview}>
                  <div className="git-diff-head">
                    <span>{t.gitDiffPreview}</span>
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
                    <p className="empty-list">{t.noGitDiff}</p>
                  )}
                </section>
                <details className="git-raw-status">
                  <summary>{t.gitRawStatus}</summary>
                  <pre className="git-status-preview">{rawGitStatus || t.noGitProject}</pre>
                </details>
              </div>
            )}
            {bottomPanel === "sources" && (
              <div className="bottom-panel-grid">
                <div>
                  <span>{t.sources}</span>
                  <strong>{activeProject?.path ? projectLabel(activeProject, t) : t.noSourcesYet}</strong>
                  <p title={activeProject?.path || t.noProjectPath}>
                    {activeProject?.path ? compactPath(activeProject.path, 78) : t.noProjectPath}
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
            )}
            {bottomPanel === "subagents" && (
              <div className="bottom-panel-grid">
                <div>
                  <span>{t.subagents}</span>
                  <strong>{t.noSubagentsYet}</strong>
                  <p>{busy ? streamingAssistant?.status || t.commandRunning : t.noActiveRun}</p>
                </div>
                <div className="bottom-panel-actions">
                  <button type="button" className="plain-action subtle-action" onClick={onOpenInteractiveClaude}>
                    <SquareTerminal size={14} />
                    {t.interactiveClaude}
                  </button>
                  <button type="button" className="plain-action subtle-action" onClick={() => onActivateTool("claude")}>
                    <Bot size={14} />
                    {t.claudeCodeTool}
                  </button>
                </div>
              </div>
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
              <div className="bottom-panel-grid">
                <div>
                  <span>{t.browser}</span>
                  <strong>{t.browserIdle}</strong>
                  <p>{t.browserPanelHint}</p>
                </div>
                <div className="bottom-panel-actions">
                  <button type="button" className="plain-action" onClick={() => onActivateTool("browser")}>
                    <Globe2 size={14} />
                    {t.openSidePanel}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function CommandOutputCard({ commandLine, cwd, code, durationMs, stdout = "", stderr = "", live = false, cancelled = false, t }) {
  const [copied, setCopied] = useState(false);
  const statusClass = live ? "live" : code === 0 ? "ok" : "error";
  const statusLabel = live ? t.commandRunning : cancelled ? t.commandCancelled : code === 0 ? t.commandSucceeded : t.commandFailed;
  const hasStdout = Boolean(String(stdout || "").trim());
  const hasStderr = Boolean(String(stderr || "").trim());
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
        <button type="button" className="icon-only mini-icon" onClick={copyOutput} title={copied ? t.outputCopied : t.copyOutput} aria-label={copied ? t.outputCopied : t.copyOutput}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
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

function CommandHistory({ title, liveEntry, entries, onClear, t }) {
  if (!liveEntry && !entries.length) return null;
  const summary = liveEntry ? t.runningNow : t.completedRuns.replace("{count}", entries.length);

  return (
    <section className="command-history" aria-label={title}>
      <div className="command-history-head">
        <div>
          <span>{title}</span>
          <strong>{summary}</strong>
        </div>
        {entries.length > 0 && (
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
            <CommandOutputCard key={entry.id} {...entry} t={t} />
          ) : (
            <details className={cx("command-history-item", entry.code === 0 ? "ok" : "error")} key={entry.id}>
              <summary>
                <span className="command-history-dot" />
                <strong title={entry.commandLine}>{entry.commandLine}</strong>
                <em>
                  {entry.cancelled ? t.commandCancelled : entry.code === 0 ? t.commandSucceeded : t.commandFailed}
                  {typeof entry.durationMs === "number" ? ` · ${entry.durationMs}ms` : ""}
                </em>
              </summary>
              <CommandOutputCard {...entry} t={t} />
            </details>
          )
        ))}
      </div>
    </section>
  );
}

function RunTimeline({ events = [], t }) {
  if (!events.length) return null;
  return (
    <section className="run-timeline" aria-label={t.outputs}>
      <div className="run-timeline-head">
        <span>{t.outputs}</span>
        <strong>{events.length}</strong>
      </div>
      <div className="run-timeline-list">
        {events.map((event) => (
          <div className={cx("run-timeline-row", event.status)} key={event.id}>
            <span className="run-timeline-dot" />
            <div className="run-timeline-main">
              <strong>{event.title}</strong>
              {event.detail && <p>{event.detail}</p>}
            </div>
            <time>{formatDate(event.createdAt)}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

function EnvironmentOverview({
  environment,
  activeProject,
  ideOptions,
  selectedIdeId,
  setSelectedIdeId,
  onOpenIde,
  onRefreshEnvironment,
  t,
}) {
  const git = environment?.git;
  const selectedIde = ideOptions?.find((option) => option.id === selectedIdeId) || ideOptions?.[0];
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
      <div className="environment-rows">
        <button type="button" className="environment-row" title={git?.raw || t.changes}>
          <FileText size={15} />
          <span>{t.changes}</span>
          <em>{git?.available ? `${git.changes || 0}` : t.gitUnavailable}</em>
        </button>
        <button type="button" className="environment-row" title={environment?.cwd || activeProject?.path || t.noProjectPath}>
          <HardDrive size={15} />
          <span>{t.local}</span>
          <em>{activeProject?.path ? compactPath(activeProject.path, 28) : t.noProjectPath}</em>
        </button>
        <button type="button" className="environment-row" title={git?.branch || t.gitUnavailable}>
          <GitBranch size={15} />
          <span>{t.branch}</span>
          <em>{git?.branch || t.gitUnavailable}</em>
        </button>
        <button type="button" className="environment-row muted" disabled>
          <GitCommit size={15} />
          <span>{t.commitOrPush}</span>
          <em>{git?.available ? "Git CLI" : t.gitUnavailable}</em>
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
        <summary>{t.subagents}</summary>
        <p>{t.noSubagentsYet}</p>
      </details>
      <details className="environment-subsection">
        <summary>{t.sources}</summary>
        <p>{t.noSourcesYet}</p>
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
      <span className={cx("tool-rail-project-dot", activeProject?.path && "ready")} title={activeProject?.path || t.noProjectPath} />
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
  onRunEvent,
  onClose,
  t,
}) {
  const [url, setUrl] = useState("");
  const [browserPreviewUrl, setBrowserPreviewUrl] = useState("");
  const [browserStatus, setBrowserStatus] = useState("idle");
  const [browserError, setBrowserError] = useState("");
  const browserWebviewRef = useRef(null);
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
  const [commandHistory, setCommandHistory] = useState([]);
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
  const [claudeHistory, setClaudeHistory] = useState([]);
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

  useEffect(() => {
    const webview = browserWebviewRef.current;
    if (!webview) return undefined;
    const handleStart = () => {
      setBrowserStatus("loading");
      setBrowserError("");
    };
    const handleStop = () => {
      setBrowserStatus("ready");
      setBrowserError("");
    };
    const handleFail = (event) => {
      if (event?.errorCode === -3) return;
      setBrowserStatus("error");
      setBrowserError(event?.errorDescription || t.browserFailed);
    };
    const handleNavigate = (event) => {
      if (event?.url && /^https?:\/\//i.test(event.url)) setUrl(event.url);
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
  }, [browserPreviewUrl, selectedTool, t.browserFailed]);

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
    const cacheKey = `${activeProject?.path || ""}::${item.path}`;
    const cached = fileCacheRef.current.get(cacheKey);
    if (cached && !options.force) {
      cacheFileRead(fileCacheRef, cacheKey, cached);
      setWorkspaceError("");
      setWorkspaceErrorRetry(null);
      setFile(cached);
      setFileDraft(cached.content || "");
      return;
    }
    setWorkspaceBusy(true);
    setWorkspaceError("");
    setWorkspaceErrorRetry(null);
    setOpeningPath(item.path);
    try {
      const result = await desktopApi.readWorkspaceFile({ projectPath: activeProject.path, relativePath: item.path });
      cacheFileRead(fileCacheRef, cacheKey, result);
      setFile(result);
      setFileDraft(result.content || "");
    } catch (error) {
      setWorkspaceError(error.message || String(error));
      setWorkspaceErrorRetry(() => () => openFile(item));
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
    try {
      const result = await desktopApi.saveWorkspaceFile({
        projectPath: activeProject.path,
        relativePath: file.path,
        content: fileDraft,
        baseUpdatedAt: file.updatedAt,
        baseSha256: file.sha256,
      });
      cacheFileRead(fileCacheRef, `${activeProject?.path || ""}::${file.path}`, result);
      setFile(result);
      setFileDraft(result.content || "");
      setFileView("edit");
      setSaveStatus("saved");
      onRefreshEnvironment?.();
      onRunEvent?.({
        type: "file-save",
        status: "ok",
        title: `${t.saveFile}: ${file.path}`,
        detail: changeSummary,
      });
    } catch (error) {
      setWorkspaceError(error.message || String(error));
      setWorkspaceErrorRetry(() => () => openFile({ type: "file", path: file.path }, { force: true }));
      setSaveStatus("error");
      onRunEvent?.({
        type: "file-save",
        status: "error",
        title: `${t.saveFile}: ${file.path}`,
        detail: error.message || String(error),
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
      type: "workspace-command",
      status: "running",
      title: `${t.runCommand}: ${nextCommand}`,
      detail: activeProject.path,
    });
    try {
      const result = await desktopApi.runWorkspaceCommand({ projectPath: activeProject.path, command: nextCommand, requestId });
      setCommandResult(result);
      setCommandHistory((current) => prependCommandHistory(current, {
        id: requestId,
        commandLine: result.command || nextCommand,
        cwd: result.cwd || activeProject.path,
        code: result.code,
        durationMs: result.durationMs,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        cancelled: Boolean(result.cancelled),
      }));
      onRefreshEnvironment?.();
      onRunEvent?.({
        type: "workspace-command",
        status: result.cancelled ? "cancelled" : result.code === 0 ? "ok" : "error",
        title: `${t.runCommand}: ${result.command || nextCommand}`,
        detail: result.cancelled ? t.commandCancelled : `${t.commandExit}: ${result.code}`,
      });
    } catch (error) {
      setWorkspaceError(error.message || String(error));
      setWorkspaceErrorRetry(() => () => runCommand());
      onRunEvent?.({
        type: "workspace-command",
        status: "error",
        title: `${t.runCommand}: ${nextCommand}`,
        detail: error.message || String(error),
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
      type: "claude-command",
      status: "running",
      title: `${t.runClaude}: claude ${nextArgs}`,
      detail: activeProject?.path || "",
    });
    try {
      const result = await desktopApi.runClaudeCommand({ projectPath: activeProject?.path, args: nextArgs, requestId });
      setClaudeResult(result);
      setClaudeHistory((current) => prependCommandHistory(current, {
        id: requestId,
        commandLine: `claude ${result.args?.join(" ") || nextArgs}`,
        cwd: result.cwd || activeProject?.path || "",
        code: result.code,
        durationMs: result.durationMs,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
      }));
      onRunEvent?.({
        type: "claude-command",
        status: result.code === 0 ? "ok" : "error",
        title: `${t.runClaude}: claude ${result.args?.join(" ") || nextArgs}`,
        detail: `${t.commandExit}: ${result.code}`,
      });
    } catch (error) {
      setStatusError(error.message || String(error));
      onRunEvent?.({
        type: "claude-command",
        status: "error",
        title: `${t.runClaude}: claude ${nextArgs}`,
        detail: error.message || String(error),
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

  function submitBrowserPreview(event) {
    event?.preventDefault?.();
    const nextUrl = normalizeBrowserUrl(url);
    if (!nextUrl) {
      setUrl("");
      setBrowserPreviewUrl("");
      setBrowserError("");
      setBrowserStatus("idle");
      return;
    }
    setUrl(nextUrl);
    setBrowserError("");
    setBrowserStatus("loading");
    if (nextUrl === browserPreviewUrl) {
      browserWebviewRef.current?.reload?.();
    } else {
      setBrowserPreviewUrl(nextUrl);
    }
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
    setBrowserStatus("loading");
    setBrowserError("");
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
    if (!desktopApi?.runClaudeCommand) return;
    setPluginsLoading(true);
    setPluginsError("");
    try {
      const requestId = `plugins_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const result = await desktopApi.runClaudeCommand({ projectPath: activeProject?.path, args: "plugin list --json", requestId });
      if (result.code !== 0) throw new Error(result.stderr || t.pluginsLoadError);
      setPluginItems(JSON.parse(result.stdout || "[]"));
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

  useEffect(() => {
    if (selectedTool === "workspace") loadTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTool, activeProject?.path]);

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
                  <button type="button" className="plain-action subtle-action" onClick={() => onOpenBrowserUrl(browserPreviewUrl)}>
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
                {!pluginsLoading && !pluginsError && pluginItems?.length === 0 && <p className="empty-list">{t.pluginsEmpty}</p>}
                {pluginItems?.length > 0 && (
                  <div className="plugin-status-items">
                    {pluginItems.map((plugin) => (
                      <div className="plugin-status-item" key={plugin.id}>
                        <div>
                          <strong>{plugin.id}</strong>
                          <span>{plugin.version && plugin.version !== "unknown" ? `v${plugin.version}` : plugin.scope}</span>
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
            <div className="command-history-slot" ref={claudeOutputRef}>
              <CommandHistory
                title={t.commandHistory}
                liveEntry={claudeLiveEntry}
                entries={claudeHistory}
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

function SettingsModal({ state, lang, t, onClose, onSaved, surface = false }) {
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
  const saving = saveStatus === "saving";
  const isDirty = JSON.stringify(form) !== initialSnapshotRef.current;
  const modalRef = useRef(null);
  useFocusTrap(modalRef, !surface);
  const [activeSection, setActiveSection] = useState("general");
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
              <button type="button" key={id} className={cx(activeSection === id && "active")} onClick={() => setActiveSection(id)}>
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

function CapabilityModal({ state, lang, t, onClose, onToggle, onSaved, onOpenClaudePanel, surface = false }) {
  const tabs = [
    ["plugins", t.plugins],
    ["mcp", t.mcps],
    ["skills", t.skills],
    ["marketplace", t.marketplace],
  ];
  const [activeTab, setActiveTab] = useState("plugins");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [cliStatus, setCliStatus] = useState(null);
  const [cliBusy, setCliBusy] = useState(false);
  const [cliError, setCliError] = useState("");
  const [marketplaceOutput, setMarketplaceOutput] = useState("");
  const [marketplaceBusy, setMarketplaceBusy] = useState(false);
  const [customMarketplaceUrl, setCustomMarketplaceUrl] = useState("");
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
  const enabledCount = capabilityRows.filter((item) => item.enabled).length;
  const totalCount = capabilityRows.length;
  const tabRows = {
    plugins: visibleRows.filter((item) => item.type === "plugin"),
    skills: visibleRows.filter((item) => item.type === "skill"),
    mcp: visibleRows.filter((item) => item.type === "tool" && /mcp/i.test(item.id + item.name + item.description)),
  };
  const searchPlaceholder =
    activeTab === "skills" ? t.searchSkills : activeTab === "marketplace" ? t.searchMarketplace : t.searchPlugins;

  async function refreshCliStatus() {
    if (!desktopApi?.getClaudeStatus) return;
    setCliBusy(true);
    setCliError("");
    try {
      const result = await desktopApi.getClaudeStatus({ projectPath: activeProject?.path });
      setCliStatus(result);
    } catch (error) {
      setCliError(error.message || String(error));
    } finally {
      setCliBusy(false);
    }
  }

  async function fetchMarketplace() {
    if (!desktopApi?.runClaudeCommand) return;
    setMarketplaceBusy(true);
    setCliError("");
    try {
      const result = await desktopApi.runClaudeCommand({
        projectPath: activeProject?.path,
        args: "plugin marketplace list",
        requestId: `marketplace_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      });
      if (result.code !== 0) throw new Error(result.stderr || result.stdout || t.pluginsLoadError);
      setMarketplaceOutput(result.stdout || result.stderr || t.noCliOutputYet);
    } catch (error) {
      setCliError(error.message || String(error));
      setMarketplaceOutput("");
    } finally {
      setMarketplaceBusy(false);
    }
  }

  async function saveCustomMarketplaces(items) {
    if (!desktopApi?.saveSettings) return;
    const nextState = await desktopApi.saveSettings({
      ...state.settings,
      customMarketplaces: items,
      apiKey: "",
    });
    onSaved?.(nextState);
  }

  async function addCustomMarketplace(event) {
    event.preventDefault();
    const value = customMarketplaceUrl.trim();
    if (!value || customMarketplaces.includes(value)) return;
    await saveCustomMarketplaces([value, ...customMarketplaces].slice(0, 12));
    setCustomMarketplaceUrl("");
  }

  useEffect(() => {
    refreshCliStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.path]);
  return (
    <ShellModal title={t.capabilities} subtitle={t.capabilitiesSubtitle} onClose={onClose} closeLabel={surface ? t.backToApp : t.close} className="capability-modal plugin-manager-modal" surface={surface}>
      <div className="installed-capability-strip" aria-label={t.installed}>
        {capabilityRows.filter((item) => item.enabled).slice(0, 14).map((item) => (
          <button
            type="button"
            key={item.id}
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
        <button type="button" className="plain-action subtle-action" onClick={refreshCliStatus} disabled={cliBusy} title={cliBusy ? t.workingHint : t.refreshCliStatus}>
          <RefreshCw size={14} className={cliBusy ? "spin" : undefined} />
          {t.refresh}
        </button>
      </section>
      {cliError && <p className="plugin-cli-error">{cliError}</p>}
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
          const count = id === "plugins" ? capabilityRows.filter((item) => item.type === "plugin").length
            : id === "skills" ? capabilityRows.filter((item) => item.type === "skill").length
              : id === "mcp" ? tabRows.mcp.length
                : 1;
          return (
            <button type="button" key={id} className={cx(activeTab === id && "active")} onClick={() => setActiveTab(id)} role="tab" aria-selected={activeTab === id}>
              <span>{label}</span>
              <em>{count}</em>
            </button>
          );
        })}
      </div>
      <div className="plugin-manager-list">
        {activeTab === "marketplace" ? (
          <div className="marketplace-workbench">
            <section className="marketplace-card">
              <div className="marketplace-card-head">
                <div>
                  <span>{t.marketplaceSourceClaude}</span>
                  <strong>{t.marketplace}</strong>
                </div>
                <div className="marketplace-actions">
                  <button type="button" className="plain-action subtle-action" onClick={onOpenClaudePanel}>
                    <Bot size={14} />
                    {t.openClaudePanel}
                  </button>
                  <button type="button" className="plain-action" onClick={fetchMarketplace} disabled={marketplaceBusy} title={marketplaceBusy ? t.workingHint : t.fetchMarketplace}>
                    <RefreshCw size={14} className={marketplaceBusy ? "spin" : undefined} />
                    {marketplaceBusy ? t.loading : t.fetchMarketplace}
                  </button>
                </div>
              </div>
              <p>{t.marketplaceHint}</p>
              <pre className="settings-raw-output marketplace-output">{marketplaceOutput || t.noCliOutputYet}</pre>
            </section>
            <section className="marketplace-card">
              <div className="marketplace-card-head">
                <div>
                  <span>{t.marketplaceSourceCustom}</span>
                  <strong>{t.customMarketplaces}</strong>
                </div>
                <em className="settings-badge">{customMarketplaces.length}</em>
              </div>
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
                {customMarketplaces.length === 0 && <p className="empty-list">{t.noCustomMarketplaces}</p>}
                {customMarketplaces.map((item) => (
                  <div className="marketplace-source-row" key={item}>
                    <span title={item}>{compactPath(item, 76)}</span>
                    <button
                      type="button"
                      className="plain-action subtle-action"
                      onClick={() => saveCustomMarketplaces(customMarketplaces.filter((source) => source !== item))}
                    >
                      <X size={13} />
                      {t.remove}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          (activeTab === "mcp" ? tabRows.mcp : activeTab === "skills" ? tabRows.skills : tabRows.plugins).map((item) => (
            <PluginManagerRow
              key={item.id}
              icon={item.type === "plugin" ? <Plug size={17} /> : item.type === "skill" ? <Blocks size={17} /> : <SquareTerminal size={17} />}
              title={item.name}
              subtitle={item.description}
              enabled={item.enabled}
              onToggle={() => onToggle(item.id, !item.enabled)}
              t={t}
            />
          ))
        )}
        {activeTab !== "marketplace" && (activeTab === "mcp" ? tabRows.mcp : activeTab === "skills" ? tabRows.skills : tabRows.plugins).length === 0 && (
          <p className="empty-list">{t.noCapabilities}</p>
        )}
        {activeTab === "plugins" && (
          <section className="plugin-cli-output">
            <span>{t.cliPluginOutput}</span>
            <pre>{cliStatus?.plugins || t.noCliOutputYet}</pre>
          </section>
        )}
        {activeTab === "mcp" && (
          <section className="plugin-cli-output">
            <span>{t.cliMcpOutput}</span>
            <pre>{cliStatus?.mcp || t.noCliOutputYet}</pre>
          </section>
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
  t,
}) {
  const label = settingsSections.find(([id]) => id === activeSection)?.[1] || t.settings;
  const activeProject = state.activeProject || { name: t.localWorkspace, path: "" };
  const git = environment?.git;
  const directApiActive = form.claudeCode?.executionMode === "api";
  const ideNames = (environment?.ideOptions || []).map((item) => item.label).join(", ") || t.ideUnavailable;
  const customMarketplaces = Array.isArray(form.customMarketplaces) ? form.customMarketplaces : [];
  const env = state.settings.env || {};
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
  const rawCliOutput = activeSection === "mcp"
    ? `${claudeStatus?.plugins || ""}\n\n${claudeStatus?.mcp || ""}`.trim()
    : activeSection === "git"
      ? git?.raw || ""
      : "";

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
      </section>
      {activeSection === "mcp" && (
        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <span>{t.installedCliState}</span>
              <h3>{t.pluginsAndMcp}</h3>
            </div>
            <em className="settings-badge cli">{t.claudeCodeMode}</em>
          </div>
          <pre className="settings-raw-output">{rawCliOutput || t.noCliOutputYet}</pre>
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
            <em className="settings-badge">{t.marketplace}</em>
          </div>
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

function CommandPalette({ commands, t, onClose }) {
  const [commandQuery, setCommandQuery] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const filtered = commands.filter((command) =>
    [command.title, command.subtitle, command.keywords].join(" ").toLowerCase().includes(commandQuery.toLowerCase()),
  );
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
            onClick={() => {
              onClose();
              command.action();
            }}
          >
            <span>{command.title}</span>
            <small>{command.subtitle}</small>
          </button>
        ))}
        {filtered.length === 0 && <p className="empty-list">{t.noCommands}</p>}
      </div>
    </ShellModal>
  );
}

function ScheduledModal({ t, lang, onClose, onUsePrompt }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("claudex.schedules") || "[]");
    } catch {
      return [];
    }
  });
  const [prompt, setPrompt] = useState("");
  const [time, setTime] = useState("");
  function save(next) {
    setItems(next);
    localStorage.setItem("claudex.schedules", JSON.stringify(next));
  }
  const scheduleCount = t.scheduleCount.replace("{count}", items.length);
  return (
    <ShellModal title={t.scheduledTitle} subtitle={t.scheduledSubtitle} onClose={onClose} closeLabel={t.close} className="scheduled-modal">
      <div className="schedule-workbench">
        <form className="schedule-form" onSubmit={(event) => {
          event.preventDefault();
          if (!prompt.trim()) return;
          save([{ id: crypto.randomUUID(), prompt: prompt.trim(), time }, ...items]);
          setPrompt("");
          setTime("");
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
          <button type="submit" className="primary-action" disabled={!prompt.trim()} title={!prompt.trim() ? t.schedulePromptPlaceholder : undefined}>
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
                <div>
                  <strong>{item.prompt}</strong>
                  <span>{item.time ? formatDate(item.time, lang) : t.scheduleAnytime}</span>
                </div>
                <div className="schedule-item-actions">
                  <button type="button" onClick={() => onUsePrompt(item.prompt)} title={t.runNow}>
                    <Send size={14} />
                    {t.runNow}
                  </button>
                  <button type="button" className="danger-action" onClick={() => save(items.filter((current) => current.id !== item.id))} title={t.delete}>
                    <X size={14} />
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
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState("");
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const [loadError, setLoadError] = useState("");
  const [stateLoading, setStateLoading] = useState(true);
  const [currentRequestId, setCurrentRequestId] = useState("");
  const [streamingAssistant, setStreamingAssistant] = useState(null);
  const [optimisticUser, setOptimisticUser] = useState(null);
  const [environment, setEnvironment] = useState(null);
  const [ideOptions, setIdeOptions] = useState([]);
  const [selectedIdeId, setSelectedIdeId] = useState("");
  const [runEvents, setRunEvents] = useState([]);

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

  const lang = resolveLanguage(state.settings.language, state.settings.appLocale);
  const t = copy.zh;
  const activeProject = state.activeProject || { name: t.localWorkspace, path: "" };
  const visibleThreadItems = useMemo(() => sidebarThreadItems(state.sessions, t, activeProject), [state.sessions, t, activeProject]);
  const activeSession =
    state.sessions.find((session) => session.id === activeSessionId && !session.archived && sessionMatchesProjectForUi(session, activeProject))
    || visibleThreadItems[0]?.session
    || state.sessions.find((session) => !session.archived)
    || state.sessions[0];
  const hasKey = Boolean(state.settings.apiKeys?.[state.settings.provider]);
  const streamingSessionId = busy ? optimisticUser?.sessionId : null;

  useEffect(() => {
    const nextSessionId = selectSessionIdForProject(state, t, activeProject, activeSessionId);
    if (nextSessionId && nextSessionId !== activeSessionId) setActiveSessionId(nextSessionId);
  }, [state, activeProject, activeSessionId, t]);

  async function refreshEnvironment() {
    if (!desktopApi?.getEnvironment) return;
    try {
      const next = await desktopApi.getEnvironment({ projectPath: activeProject?.path });
      setEnvironment(next);
      const nextIdeOptions = Array.isArray(next?.ideOptions) ? next.ideOptions : [];
      setIdeOptions(nextIdeOptions);
      setSelectedIdeId((current) => current || nextIdeOptions[0]?.id || "");
    } catch {
      setEnvironment(null);
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

  function recordRunEvent(entry) {
    setRunEvents((current) => prependRunEvent(current, entry));
  }

  function applySessionState(next, preferredId = "") {
    setState(next);
    setActiveSessionId(selectSessionIdForProject(next, t, next.activeProject || activeProject, preferredId));
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
      const next = await desktopApi.updateSession({ sessionId: session.id, archived: true });
      applySessionState(next, session.id === activeSession?.id ? "" : activeSession?.id);
      showToast(t.threadArchived);
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

  async function sendMessage(content) {
    if (!desktopApi || !activeSession) return;
    const requestId = `request_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setCurrentRequestId(requestId);
    setOptimisticUser({ sessionId: activeSession.id, content: content.trim(), createdAt: new Date().toISOString() });
    setStreamingAssistant({ requestId, content: "", status: t.waiting, activities: [] });
    setBusy(true);
    recordRunEvent({
      type: "chat",
      status: "running",
      title: `${t.activeThread}: ${activeSession.title || "Claudex"}`,
      detail: content.trim().slice(0, 140),
    });
    try {
      const next = await desktopApi.sendMessage({ sessionId: activeSession.id, content, requestId });
      setState(next);
      setActiveSessionId(activeSession.id);
      recordRunEvent({
        type: "chat",
        status: "ok",
        title: `${t.activeThread}: ${activeSession.title || "Claudex"}`,
        detail: t.commandSucceeded,
      });
    } catch (error) {
      recordRunEvent({
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
      applySessionState(next);
      showToast(t.projectSelected);
    }
  }

  async function setActiveProject(project) {
    if (!desktopApi || !project) return;
    const next = await desktopApi.setActiveProject(project);
    applySessionState(next);
    showToast(t.projectSelected);
  }

  async function openProject() {
    await desktopApi?.openProject(activeProject?.path);
  }

  async function openTerminal() {
    await desktopApi?.openTerminal(activeProject?.path);
    showToast(t.terminalOpened);
  }

  async function openIde() {
    if (!desktopApi?.openIde) {
      await openProject();
      return;
    }
    await desktopApi.openIde({ projectPath: activeProject?.path, ideId: selectedIdeId });
  }

  async function openInteractiveClaudeFromChat() {
    if (!desktopApi?.openClaudeTerminal) {
      showToast(t.desktopOnly);
      return;
    }
    await desktopApi.openClaudeTerminal({ projectPath: activeProject?.path });
  }

  async function openBrowserUrl(url) {
    await desktopApi?.openBrowserUrl(url);
    showToast(t.browserOpened);
  }

  async function toggleCapability(id, enabled) {
    const nextCaps = { ...(state.settings.capabilities || {}), [id]: enabled };
    const next = await desktopApi.saveCapabilities(nextCaps);
    setState(next);
    showToast(t.saved);
  }

  async function copyMessage(content) {
    await navigator.clipboard.writeText(content || "");
    showToast(t.copied);
  }

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(false);
  const [bottomPanel, setBottomPanel] = useState("");

  function openSettingsSurface() {
    setCapabilitiesOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    setSettingsOpen(true);
  }

  function openCapabilitiesSurface() {
    setSettingsOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
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

  function openBottomPanel(id) {
    setSettingsOpen(false);
    setCapabilitiesOpen(false);
    setProjectsOpen(false);
    setScheduledOpen(false);
    setCommandsOpen(false);
    setBottomPanel(id);
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
        if ((event.ctrlKey || event.metaKey) && event.key === "/") {
          event.preventDefault();
          setShortcutsOpen(true);
        }
        return;
      }
      // Cmd/Ctrl+K：命令面板
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandsOpen(true);
      }
      // Cmd/Ctrl+N：新聊天
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createSession();
      }
      // Cmd/Ctrl+,：设置
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        openSettingsSurface();
      }
      // Cmd/Ctrl+P：项目
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        openProjectsSurface();
      }
      // Cmd/Ctrl+B：打开/关闭左侧栏
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
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
      if ((event.ctrlKey || event.metaKey) && event.key === "/") {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      // Cmd/Ctrl+T：打开/关闭浏览器
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") {
        event.preventDefault();
        setRightPanelVisible(true);
        setSelectedTool((current) => (current === "browser" ? "" : "browser"));
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

  const commands = [
    { id: "new", title: t.newChat, subtitle: "Ctrl+N", keywords: "聊天 对话 会话", action: createSession },
    { id: "project", title: t.selectProject, subtitle: t.activeProject, keywords: "文件夹 工作区 项目", action: openProjectsSurface },
    { id: "terminal", title: t.openTerminal, subtitle: projectLabel(activeProject, t), keywords: "终端 shell powershell", action: openTerminal },
    { id: "settings", title: t.settings, subtitle: t.setupProvider, keywords: "服务商 api key 模型 设置", action: openSettingsSurface },
    { id: "capabilities", title: t.capabilities, subtitle: t.plugins, keywords: "插件 技能 工具", action: openCapabilitiesSurface },
    { id: "automation", title: t.scheduled, subtitle: t.scheduledTitle, keywords: "automation schedule 自动化 计划 任务", action: openScheduledSurface },
    { id: "tool-workspace", title: t.workspaceTool, subtitle: t.openSidePanel, keywords: "workspace files editor diff 工作区 文件 编辑", action: () => activateTool("workspace") },
    { id: "tool-claude", title: t.claudeCodeTool, subtitle: t.openSidePanel, keywords: "claude code cli plugin mcp terminal", action: () => activateTool("claude") },
    { id: "tool-browser", title: t.browser, subtitle: t.openSidePanel, keywords: "browser preview web 网页 浏览器", action: () => activateTool("browser") },
    { id: "tool-terminal", title: t.terminal, subtitle: t.openSidePanel, keywords: "terminal shell command powershell 终端 命令", action: () => activateTool("terminal") },
    { id: "panel-outputs", title: t.outputs, subtitle: t.bottomPanel, keywords: "outputs run timeline evidence 输出 证据 时间线", action: () => openBottomPanel("outputs") },
    { id: "panel-environment", title: t.environment, subtitle: t.bottomPanel, keywords: "environment cwd git ide 环境 项目", action: () => openBottomPanel("environment") },
    { id: "panel-changes", title: t.changes, subtitle: t.gitDiffPreview, keywords: "changes git diff status 变更 差异", action: () => openBottomPanel("changes") },
    { id: "panel-sources", title: t.sources, subtitle: t.bottomPanel, keywords: "sources files project 来源 文件", action: () => openBottomPanel("sources") },
    { id: "panel-subagents", title: t.subagents, subtitle: t.bottomPanel, keywords: "subagents agents 子代理 agent", action: () => openBottomPanel("subagents") },
    { id: "review", title: t.quickReview, subtitle: t.schedulePrompt, keywords: "审查 代码 风险", action: () => setDraft(t.quickReview) },
    { id: "plan", title: t.quickPlan, subtitle: t.schedulePrompt, keywords: "计划 实现 验证", action: () => setDraft(t.quickPlan) },
    {
      id: "data",
      title: t.openData,
      subtitle: t.dataFile,
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
          onToggleSidebar={() => setSidebarVisible((current) => !current)}
          loading={stateLoading}
          loadError={loadError}
          onRetryLoad={retryLoadDesktopState}
          streamingSessionId={streamingSessionId}
          lang={lang}
          t={t}
        />
        {settingsOpen ? (
          <SettingsModal state={state} lang={lang} t={t} onClose={() => setSettingsOpen(false)} onSaved={(next) => setState(next)} surface />
        ) : capabilitiesOpen ? (
          <CapabilityModal
            state={state}
            lang={lang}
            t={t}
            onClose={() => setCapabilitiesOpen(false)}
            onToggle={toggleCapability}
            onSaved={(next) => setState(next)}
            onOpenClaudePanel={() => activateTool("claude")}
            surface
          />
        ) : (
        <Conversation
          session={activeSession}
          settings={state.settings}
          activeProject={activeProject}
          hasKey={hasKey}
          onSend={sendMessage}
          onCancel={cancelMessage}
          onSelectProject={openProjectsSurface}
          onSettings={openSettingsSurface}
          onCapabilities={openCapabilitiesSurface}
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
          onOpenTerminal={openTerminal}
          onOpenProject={openProject}
          busy={busy}
          streamingAssistant={streamingAssistant}
          optimisticUser={optimisticUser?.sessionId === activeSession?.id ? optimisticUser : null}
          runEvents={runEvents}
          draft={draft}
          setDraft={setDraft}
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
          onRunEvent={recordRunEvent}
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
          onClose={() => setScheduledOpen(false)}
          onUsePrompt={(prompt) => {
            setDraft(prompt);
            setScheduledOpen(false);
            showToast(t.copiedPrompt);
          }}
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
