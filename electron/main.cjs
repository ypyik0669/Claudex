const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const CLAUDEX_APP_ID = "com.ypyik0669.claudex";
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const DEFAULT_SYSTEM_PROMPT =
  "你是一名务实的资深编程助手。回答要简洁、准确，并专注于可执行的实现。";
const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  "openai-compatible",
  "openrouter",
  "deepseek",
  "minimax",
  "xiaomi-mimo",
  "lm-studio",
]);
const PROVIDER_ENV_KEYS = {
  anthropic: ["ANTHROPIC_API_KEY"],
  "openai-compatible": ["OPENAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY", "OPENAI_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY", "OPENAI_API_KEY"],
  minimax: ["MINIMAX_API_KEY", "OPENAI_API_KEY"],
  "xiaomi-mimo": ["MIMO_API_KEY", "XIAOMI_MIMO_API_KEY", "OPENAI_API_KEY"],
  "lm-studio": [],
};
const DEFAULT_CAPABILITIES = {
  "project-context": true,
  "code-review": true,
  "implementation-plan": true,
  "terminal-helper": true,
  "mcp-runtime": true,
  "plugin-router": true,
  "marketplace-router": true,
  "custom-marketplaces": false,
  debugger: false,
  "docs-writer": false,
  "test-writer": false,
};
const CAPABILITY_CONTEXT = {
  "project-context": "用户请求代码或文件工作时，把当前项目文件夹作为工作上下文。",
  "code-review": "做代码审查时，优先指出缺陷、回归风险、实现风险和缺失测试，再给摘要。",
  "implementation-plan": "非平凡实现工作需要给出具体步骤和验证命令。",
  "terminal-helper": "建议终端命令时，要写清楚命令并绑定到当前项目路径。",
  "mcp-runtime": "暴露 Claude Code MCP 状态，并通过 Claude Code CLI 命令处理 MCP 配置工作。",
  "plugin-router": "自动考虑已启用的插件、技能和工具，不要求用户手动输入斜杠命令。",
  "marketplace-router": "用户要发现或安装插件时，使用 Claude Code 插件市场命令。",
  "custom-marketplaces": "把已保存的自定义插件市场 URL 作为用户提供的插件来源。",
  debugger: "调试时先复现问题、形成假设，并聚焦根因修复。",
  "docs-writer": "需要文档时，写简洁、可操作的使用说明。",
  "test-writer": "需要测试时，优先通过公开接口写行为测试。",
};
const activeRequests = new Map();
const childTreeTerminationAttempts = new WeakMap();
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "release", ".npm-cache", ".next", "coverage"]);
const IGNORED_DIR_PATTERNS = [/^release/i, /^out$/i, /^tmp$/i, /^temp$/i];
const PROJECT_MARKERS = [
  ".git",
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "CONTEXT.md",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
];
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const WORKSPACE_SEARCH_LIMIT = 40;
const WORKSPACE_SEARCH_SCAN_LIMIT = 6000;
const MAX_COMMAND_OUTPUT_CHARS = 30000;
const MAX_COMMAND_ARG_ITEMS = 256;
const MAX_GIT_DIFF_CHARS = 80000;
const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000;
const AUTOMATION_HISTORY_LIMIT = 8;
const AUTOMATION_LIMIT = 80;
const AUTOMATION_POLL_MS = 15000;
const AUTOMATION_REPEAT_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};
const SUBAGENT_RUN_LIMIT = 40;
const COMMAND_RUN_LIMIT = 80;
const RUN_EVENT_LIMIT = 120;
const SOURCE_REF_LIMIT = 80;
const BROWSER_VISIT_LIMIT = 60;
const NOTICE_LIMIT = 80;
const MAX_SKILL_REGISTRY_ITEMS = 500;
const MAX_SKILL_SCAN_DEPTH = 10;
const MAX_SKILL_FILE_BYTES = 64 * 1024;
const AUTOMATION_INTERRUPTED_MESSAGE = "Claudex 上次退出时，自动化运行已中断。";
const SUBAGENT_INTERRUPTED_MESSAGE = "Claudex 上次退出时，子代理运行已中断。";
const WORKSPACE_COMMAND_INTERRUPTED_MESSAGE = "Claudex 上次退出时，Workspace 命令已中断。";
const RUN_STOP_WAIT_MS = 9000;
const QUIT_DRAIN_WAIT_MS = 8000;
const WINDOWS_TASKKILL_TIMEOUT_MS = 2000;
const WINDOWS_WMIC_SNAPSHOT_TIMEOUT_MS = 1500;
const WINDOWS_CIM_SNAPSHOT_TIMEOUT_MS = 2500;
const automationRunLocks = new Set();
const activeAutomationRuns = new Map();
const activeSubagentRuns = new Map();
const activeWorkspaceCommandRuns = new Map();
const runtimeInstanceId = id("runtime_instance");
const activeChatRequestIds = new Set();
const cancelledChatRequestIds = new Set();
const activeChatRequestRuntime = new Map();
let automationSchedulerTimer = null;
let automationSchedulerRunning = false;

const CLAUDE_CODE_SETTINGS = {
  executionMode: "claude-code",
  claudeCommand: "claude",
  permissionMode: "default",
  outputFormat: "json",
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
};
const GENERIC_SESSION_TITLES = new Set(["", "claudex", "new chat", "new coding session", "新聊天"]);

app.setName("Claudex");
if (process.platform === "win32") app.setAppUserModelId(CLAUDEX_APP_ID);

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
        return [key, value];
      }),
  );
}

function envBag() {
  const exeDir = path.dirname(process.execPath);
  const envFiles = [
    (() => {
      try {
        return path.join(app.getAppPath(), ".env");
      } catch {
        return "";
      }
    })(),
    path.join(exeDir, ".env"),
    path.join(process.cwd(), ".env"),
  ].filter(Boolean);
  const env = {
    ...process.env,
    ...Object.assign({}, ...envFiles.map((file) => parseEnvFile(file))),
  };
  if (env.ANTHROPIC_API_KEY) {
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
  }
  return env;
}

function envValue(key) {
  return envBag()[key] || "";
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function sessionMessages(session) {
  return Array.isArray(session?.messages) ? session.messages : [];
}

function hasSessionMessages(session) {
  return sessionMessages(session).length > 0;
}

function isGenericSessionTitle(title) {
  return GENERIC_SESSION_TITLES.has(String(title || "").trim().toLowerCase());
}

function sessionProjectKey(session) {
  return String(session?.projectPath || session?.project || "").trim().toLowerCase();
}

function projectKeyForStore(project) {
  return String(project?.path || project?.name || "").trim().toLowerCase();
}

function sessionMatchesProject(session, project) {
  const key = projectKeyForStore(project);
  if (!key) return true;
  return sessionProjectKey(session) === key;
}

function visibleProjectSessions(store, project = store?.activeProject) {
  const key = projectKeyForStore(project);
  return (store?.sessions || []).filter((session) => !session.archived && (!key || sessionProjectKey(session) === key));
}

function ensureProjectDraftSession(store, project = store.activeProject || localWorkspaceProject()) {
  project = project || localWorkspaceProject();
  if (visibleProjectSessions(store, project).length) return null;
  const createdAt = now();
  const session = {
    id: id("session"),
    title: "新聊天",
    project: project.name,
    projectPath: project.path,
    createdAt,
    updatedAt: createdAt,
    messages: [],
    pinned: false,
    archived: false,
    pinnedAt: "",
    archivedAt: "",
    renamedAt: "",
    forkedAt: "",
    forkedFromId: "",
    forkedFromTitle: "",
    forkedFromClaudeSessionId: "",
    claudeSessionId: "",
  };
  store.sessions = [session, ...(store.sessions || [])];
  return session;
}

function ensureActiveProjectDraftSession(store) {
  return ensureProjectDraftSession(store, store.activeProject || localWorkspaceProject());
}

function titleFromUserContent(content) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (!text) return "新聊天";
  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

function sessionDisplayTitleForStore(session) {
  const rawTitle = String(session?.title || "").trim();
  if (rawTitle && !isGenericSessionTitle(rawTitle)) return titleFromUserContent(rawTitle);
  const firstUser = sessionMessages(session).find((message) => message.role === "user" && message.content);
  return titleFromUserContent(firstUser?.content || rawTitle || "新聊天");
}

function isoOrEmpty(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function automationHasScheduledRun(automation) {
  return (automation.history || []).some((entry) => entry?.trigger === "scheduled" && entry?.endedAt);
}

function latestScheduledAutomationRunMs(automation) {
  return (automation.history || [])
    .filter((entry) => entry?.trigger === "scheduled")
    .map((entry) => new Date(entry.endedAt || entry.startedAt || "").getTime())
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), 0);
}

function normalizeAutomationScheduleType(type) {
  const value = String(type || "once").trim().toLowerCase();
  return ["once", "daily", "weekly"].includes(value) ? value : "once";
}

function automationNextRun(automation) {
  const runAt = isoOrEmpty(automation?.schedule?.runAt || automation?.runAt || automation?.time);
  if (!automation?.enabled || !runAt) return "";
  const type = normalizeAutomationScheduleType(automation.schedule?.type);
  if (type === "once") {
    if (automationHasScheduledRun(automation)) return "";
    return runAt;
  }
  const repeatMs = AUTOMATION_REPEAT_MS[type];
  if (!repeatMs) return runAt;
  const runAtMs = new Date(runAt).getTime();
  if (!Number.isFinite(runAtMs)) return "";
  const at = Date.now();
  if (runAtMs > at) return runAt;
  const latestDueMs = runAtMs + Math.floor((at - runAtMs) / repeatMs) * repeatMs;
  const latestRunMs = latestScheduledAutomationRunMs(automation);
  if (!latestRunMs || latestRunMs < latestDueMs) return new Date(latestDueMs).toISOString();
  return new Date(latestDueMs + repeatMs).toISOString();
}

function normalizeAutomationProject(project, store) {
  const fallback = store?.activeProject || localWorkspaceProject();
  if (project?.path) return projectFromPath(project.path);
  if (project?.name || project?.path) {
    return {
      name: project.name || path.basename(project.path || "") || fallback.name,
      path: project.path || "",
    };
  }
  return fallback;
}

function normalizeAutomationHistoryEntry(entry, item, createdAt) {
  return {
    id: entry?.id || id("automation_run"),
    trigger: entry?.trigger || "manual",
    status: entry?.status || "succeeded",
    startedAt: isoOrEmpty(entry?.startedAt) || createdAt,
    endedAt: isoOrEmpty(entry?.endedAt),
    durationMs: Number(entry?.durationMs || 0),
    sessionId: entry?.sessionId || item?.threadId || "",
    detail: String(entry?.detail || ""),
    error: String(entry?.error || ""),
    summary: String(entry?.summary || entry?.detail || ""),
    stdout: trimOutput(entry?.stdout || "", MAX_COMMAND_OUTPUT_CHARS),
    stderr: trimOutput(entry?.stderr || "", MAX_COMMAND_OUTPUT_CHARS),
    code: typeof entry?.code === "number" ? entry.code : null,
    artifacts: Array.isArray(entry?.artifacts) ? entry.artifacts.slice(0, 12) : [],
  };
}

function normalizeAutomation(item, store) {
  const createdAt = isoOrEmpty(item?.createdAt) || now();
  const schedule = {
    type: normalizeAutomationScheduleType(item?.schedule?.type || item?.scheduleType || item?.repeat),
    runAt: isoOrEmpty(item?.schedule?.runAt || item?.runAt || item?.time),
  };
  const history = Array.isArray(item?.history)
    ? item.history.slice(0, AUTOMATION_HISTORY_LIMIT).map((entry) => normalizeAutomationHistoryEntry(entry, item, createdAt))
    : [];
  const lastRun = item?.lastRun
    ? normalizeAutomationHistoryEntry(item.lastRun, item, createdAt)
    : history[0] || null;
  const automation = {
    id: item?.id || id("automation"),
    prompt: String(item?.prompt || "").trim(),
    schedule,
    project: normalizeAutomationProject(item?.project, store),
    threadId: item?.threadId || "",
    enabled: typeof item?.enabled === "boolean" ? item.enabled : Boolean(schedule.runAt),
    status: item?.status || (schedule.runAt ? "scheduled" : "idle"),
    createdAt,
    updatedAt: isoOrEmpty(item?.updatedAt) || createdAt,
    lastRun,
    nextRun: "",
    history,
  };
  automation.nextRun = automationNextRun(automation);
  if (automation.status !== "running") {
    if (automation.nextRun) automation.status = "scheduled";
    else if (!automation.enabled && automation.schedule.runAt && !automation.lastRun) automation.status = "paused";
    else if (automation.lastRun?.status === "failed") automation.status = "failed";
    else if (automation.lastRun?.status === "cancelled") automation.status = "cancelled";
    else if (automation.lastRun?.status === "succeeded") automation.status = "succeeded";
    else if (automation.status === "paused") automation.status = "paused";
    else automation.status = automation.schedule.runAt && !automation.enabled ? "paused" : "idle";
  }
  return automation;
}

function updateAutomationAfterMutation(automation) {
  automation.updatedAt = now();
  automation.nextRun = automationNextRun(automation);
  if (automation.status !== "running") {
    if (automation.nextRun) automation.status = "scheduled";
    else if (!automation.enabled && automation.schedule?.runAt && !automation.lastRun) automation.status = "paused";
    else if (automation.lastRun?.status === "failed") automation.status = "failed";
    else if (automation.lastRun?.status === "cancelled") automation.status = "cancelled";
    else if (automation.lastRun?.status === "succeeded") automation.status = "succeeded";
    else automation.status = automation.schedule?.runAt && !automation.enabled ? "paused" : "idle";
  }
  return automation;
}

function prependAutomationHistory(automation, entry) {
  automation.history = [
    entry,
    ...(automation.history || []).filter((item) => item.id !== entry.id),
  ].slice(0, AUTOMATION_HISTORY_LIMIT);
  automation.lastRun = entry;
}

function automationRunEventTitle(automation) {
  return `自动化：${titleFromUserContent(automation?.prompt || "计划任务")}`;
}

function automationRunEventDetail(automation, entry) {
  const trigger = entry?.trigger === "scheduled" ? "计划触发" : "手动触发";
  const project = automation?.project?.name || automation?.project?.path || "本地工作区";
  const output = entry?.error || entry?.detail || "";
  return [trigger, project, output].filter(Boolean).join(" · ");
}

function upsertAutomationRunEvent(store, automation, entry, status) {
  return upsertRunEvent(store, {
    id: entry.id,
    type: "automation",
    status,
    title: automationRunEventTitle(automation),
    detail: automationRunEventDetail(automation, entry),
    cwd: automation.project?.path || "",
    stdout: entry.stdout || "",
    stderr: entry.stderr || "",
    project: automation.project,
    sessionId: entry.sessionId || automation.threadId || "",
    code: typeof entry.code === "number" ? entry.code : null,
    durationMs: typeof entry.durationMs === "number" ? entry.durationMs : null,
    createdAt: entry.startedAt || now(),
  });
}

function upsertAutomationActionRunEvent(store, automation, action, detail = "") {
  const labels = {
    create: "创建",
    pause: "暂停",
    resume: "恢复",
    delete: "删除",
  };
  const actionLabel = labels[action] || action || "更新";
  const eventId = `automation:${automation.id}:${action}:${Date.now()}`;
  const project = automation?.project || store.activeProject || localWorkspaceProject();
  const actionDetail = detail || [
    project?.name || project?.path || "本地工作区",
    automation?.schedule?.runAt ? `下次运行: ${automation.schedule.runAt}` : "",
    automation?.threadId ? `线程: ${automation.threadId}` : "",
  ].filter(Boolean).join(" · ");
  return upsertRunEvent(store, {
    id: eventId,
    type: "automation-action",
    status: "ok",
    title: `自动化：${actionLabel} · ${titleFromUserContent(automation?.prompt || "计划任务")}`,
    detail: actionDetail,
    commandLine: "",
    cwd: project?.path || "",
    code: null,
    durationMs: 0,
    stdout: automation?.prompt || "",
    stderr: "",
    project,
    sessionId: automation?.threadId || "",
    createdAt: now(),
  });
}

function threadProjectForEvent(store, session = {}) {
  return {
    name: session?.project || store.activeProject?.name || "本地工作区",
    path: session?.projectPath || store.activeProject?.path || "",
  };
}

function upsertThreadActionRunEvent(store, session, action, detail = "", options = {}) {
  const labels = {
    rename: "重命名",
    pin: "置顶",
    unpin: "取消置顶",
    archive: "归档",
    restore: "恢复",
    fork: "Fork",
    delete: "删除",
    resume: "继续",
  };
  const actionLabel = labels[action] || action || "更新";
  const eventId = `thread:${session?.id || "unknown"}:${action}:${Date.now()}`;
  const title = sessionDisplayTitleForStore(session);
  const project = threadProjectForEvent(store, session);
  const targetSession = options.targetSession || null;
  const messageCount = sessionMessages(session).length;
  const actionDetail = detail || [
    project?.name || project?.path || "本地工作区",
    `${messageCount} 条消息`,
    targetSession?.id ? `目标聊天: ${targetSession.id}` : "",
  ].filter(Boolean).join(" · ");
  const stdout = [
    `action=${action}`,
    `sessionId=${session?.id || ""}`,
    `title=${title}`,
    `project=${project?.name || ""}`,
    project?.path ? `projectPath=${project.path}` : "",
    `messageCount=${messageCount}`,
    session?.claudeSessionId ? `claudeSessionId=${session.claudeSessionId}` : "",
    targetSession?.id ? `targetSessionId=${targetSession.id}` : "",
    targetSession?.title ? `targetTitle=${sessionDisplayTitleForStore(targetSession)}` : "",
  ].filter(Boolean).join("\n");
  return upsertRunEvent(store, {
    id: eventId,
    type: "thread-action",
    status: "ok",
    title: `聊天：${actionLabel} · ${title}`,
    detail: actionDetail,
    commandLine: "",
    cwd: project?.path || "",
    code: null,
    durationMs: 0,
    stdout,
    stderr: "",
    project,
    sessionId: session?.id || "",
    createdAt: now(),
  });
}

function normalizeSubagentRun(item, store) {
  const startedAt = isoOrEmpty(item?.startedAt) || now();
  const status = ["running", "done", "error", "cancelled"].includes(item?.status) ? item.status : "done";
  const project = normalizeAutomationProject(item?.project, store);
  return {
    id: item?.id || id("subagent"),
    requestId: item?.requestId || "",
    nickname: String(item?.nickname || "Subagent").trim() || "Subagent",
    task: String(item?.task || "").trim(),
    status,
    sessionId: item?.sessionId || "",
    project,
    cwd: item?.cwd || project?.path || "",
    command: item?.command || "",
    args: Array.isArray(item?.args) ? item.args.map(String) : [],
    stdout: trimOutput(item?.stdout || "", MAX_COMMAND_OUTPUT_CHARS),
    stderr: trimOutput(item?.stderr || "", MAX_COMMAND_OUTPUT_CHARS),
    summary: String(item?.summary || ""),
    code: typeof item?.code === "number" ? item.code : null,
    durationMs: Number(item?.durationMs || 0),
    startedAt,
    endedAt: isoOrEmpty(item?.endedAt),
    artifacts: Array.isArray(item?.artifacts) ? item.artifacts.slice(0, 12) : [],
    archivedAt: isoOrEmpty(item?.archivedAt),
    continuedAt: isoOrEmpty(item?.continuedAt),
    continuedSessionId: String(item?.continuedSessionId || ""),
    runtimeOwner: String(item?.runtimeOwner || ""),
  };
}

function upsertSubagentRun(store, run) {
  store.subagentRuns = [
    run,
    ...(store.subagentRuns || []).filter((item) => item.id !== run.id),
  ].slice(0, SUBAGENT_RUN_LIMIT);
  return run;
}

function subagentRunEventTitle(run) {
  return `子代理：${titleFromUserContent(run?.nickname || "Subagent")}`;
}

function subagentRunEventDetail(run) {
  const project = run?.project?.name || run?.project?.path || "本地工作区";
  const output = run?.summary || run?.stderr || run?.stdout || run?.task || "";
  return [project, output].filter(Boolean).join(" · ");
}

function upsertSubagentRunEvent(store, run, status) {
  return upsertRunEvent(store, {
    id: run.requestId || run.id,
    type: "subagent",
    status,
    title: subagentRunEventTitle(run),
    detail: subagentRunEventDetail(run),
    commandLine: [run.command, ...(run.args || [])].filter(Boolean).join(" "),
    cwd: run.cwd || run.project?.path || "",
    code: typeof run.code === "number" ? run.code : null,
    durationMs: typeof run.durationMs === "number" ? run.durationMs : null,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
    project: run.project,
    sessionId: run.sessionId || "",
    runtimeOwner: run.runtimeOwner || "",
    createdAt: run.startedAt || now(),
  });
}

function upsertSubagentActionRunEvent(store, run, action) {
  const labels = {
    archive: "关闭记录",
    restore: "恢复记录",
    continue: "续写到聊天",
  };
  const actionLabel = labels[action] || action || "更新";
  const eventId = `${run.requestId || run.id}:${action}`;
  const targetSessionId = action === "continue" && run.continuedSessionId ? run.continuedSessionId : run.sessionId || "";
  return upsertRunEvent(store, {
    id: eventId,
    type: "subagent-action",
    status: "ok",
    title: `子代理：${actionLabel} · ${titleFromUserContent(run?.nickname || "Subagent")}`,
    detail: [
      run?.project?.name || run?.project?.path || "本地工作区",
      targetSessionId ? `聊天: ${targetSessionId}` : "",
      run?.summary || run?.stderr || run?.task || "",
    ].filter(Boolean).join(" · "),
    commandLine: [run.command, ...(run.args || [])].filter(Boolean).join(" "),
    cwd: run.cwd || run.project?.path || "",
    code: typeof run.code === "number" ? run.code : null,
    durationMs: typeof run.durationMs === "number" ? run.durationMs : null,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
    project: run.project,
    sessionId: targetSessionId,
    createdAt: now(),
  });
}

function persistSubagentChunk({ runId, requestId, stream, text }) {
  const cleanText = stripAnsi(text || "");
  if (!cleanText) return null;
  const store = readStore();
  const existing = findSubagentRun(store, { runId, requestId });
  if (!existing || existing.status !== "running") return null;
  const key = stream === "stderr" ? "stderr" : "stdout";
  const nextRun = normalizeSubagentRun({
    ...existing,
    [key]: trimOutput(`${existing[key] || ""}${cleanText}`, MAX_COMMAND_OUTPUT_CHARS),
  }, store);
  upsertSubagentRun(store, nextRun);
  upsertSubagentRunEvent(store, nextRun, "running");
  writeStore(store);
  broadcastStoreUpdate(store);
  return nextRun;
}

function findSubagentRun(store, { runId, requestId } = {}) {
  const byRunId = String(runId || "");
  const byRequestId = String(requestId || "");
  return (store.subagentRuns || []).find((item) => (
    (byRunId && item.id === byRunId) || (byRequestId && item.requestId === byRequestId)
  ));
}

function subagentContinuationMessage(run) {
  const artifacts = Array.isArray(run?.artifacts) ? run.artifacts : [];
  const artifactLabels = artifacts
    .map((artifact, index) => artifact?.label || artifact?.path || artifact?.type || `Artifact ${index + 1}`)
    .filter(Boolean)
    .join(", ");
  return [
    `子代理结果：${run?.nickname || "Subagent"}`,
    "",
    `任务：${run?.task || ""}`,
    `状态：${run?.status || ""}`,
    `退出码：${typeof run?.code === "number" ? run.code : "-"}`,
    run?.cwd ? `工作目录：${run.cwd}` : "",
    run?.sessionId ? `会话：${run.sessionId}` : "",
    artifactLabels ? `产物：${artifactLabels}` : "",
    "",
    run?.summary || "",
    run?.stderr ? `[stderr]\n${run.stderr}` : "",
  ].filter(Boolean).join("\n");
}

function normalizeCapabilityContext(context = {}) {
  const source = context && typeof context === "object" ? context : {};
  const tab = String(source.tab || "").trim();
  const kind = String(source.kind || "").trim();
  const idValue = String(source.id || "").trim();
  const query = String(source.query || idValue || "").trim();
  const action = String(source.action || "").trim();
  const target = String(source.target || "").trim();
  const identityLimit = kind === "custom-marketplace" ? 2048 : 240;
  const normalized = {};
  if (["plugins", "mcp", "skills", "marketplace"].includes(tab)) normalized.tab = tab;
  if (kind) normalized.kind = kind.slice(0, 80);
  if (idValue) normalized.id = idValue.slice(0, identityLimit);
  if (query) normalized.query = query.slice(0, identityLimit);
  if (action) normalized.action = action.slice(0, 80);
  if (target) normalized.target = target.slice(0, 240);
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeCommandRun(item, store) {
  const project = normalizeAutomationProject(item?.project, store);
  const startedAt = isoOrEmpty(item?.startedAt) || now();
  const endedAt = isoOrEmpty(item?.endedAt) || startedAt;
  const command = String(item?.command || item?.commandLine || "").trim();
  const args = Array.isArray(item?.args)
    ? item.args.slice(0, MAX_COMMAND_ARG_ITEMS).map((arg) => String(arg).slice(0, 4096))
    : [];
  const rawKind = String(item?.kind || "workspace").trim();
  const kind = ["workspace", "claude", "capability", "git"].includes(rawKind) ? rawKind : "workspace";
  const capabilityContext = normalizeCapabilityContext(item?.capabilityContext);
  return {
    id: item?.id || id("command"),
    requestId: item?.requestId || "",
    sessionId: String(item?.sessionId || item?.threadId || ""),
    runtimeOwner: String(item?.runtimeOwner || ""),
    kind,
    command,
    commandLine: command,
    ...(args.length ? { args } : {}),
    cwd: item?.cwd || project?.path || "",
    project,
    code: typeof item?.code === "number" ? item.code : null,
    durationMs: Number(item?.durationMs || 0),
    stdout: trimOutput(item?.stdout || "", MAX_COMMAND_OUTPUT_CHARS),
    stderr: trimOutput(item?.stderr || "", MAX_COMMAND_OUTPUT_CHARS),
    cancelled: Boolean(item?.cancelled),
    startedAt,
    endedAt,
    ...(capabilityContext ? { capabilityContext } : {}),
  };
}

function isGitCommandLine(command = "") {
  return /^git(?:\.exe)?(?:\s|$)/i.test(String(command || "").trim());
}

function isGitCommandRun(run = {}) {
  const runId = String(run?.requestId || run?.id || "");
  return run?.kind === "git" || runId.startsWith("git_command_") || isGitCommandLine(run?.command || run?.commandLine);
}

function upsertCommandRun(store, run) {
  const normalized = normalizeCommandRun(run, store);
  store.commandRuns = [
    normalized,
    ...(store.commandRuns || []).filter((item) => item.id !== normalized.id),
  ].slice(0, COMMAND_RUN_LIMIT);
  return normalized;
}

function commandRunEventType(run, fallbackType = "workspace-command") {
  if (isGitCommandRun(run)) return "git-command";
  return fallbackType;
}

function upsertCommandRunEvent(store, run, status, fallbackType = "workspace-command") {
  const normalized = normalizeCommandRun(run, store);
  const eventType = commandRunEventType(normalized, fallbackType);
  const commandLine = normalized.commandLine || normalized.command || "";
  const codeLabel = typeof normalized.code === "number" ? normalized.code : "-";
  const detail = status === "running"
    ? normalized.cwd
    : status === "cancelled" || normalized.cancelled
      ? "命令已取消。"
      : `退出码: ${codeLabel}`;
  return upsertRunEvent(store, {
    id: normalized.requestId || normalized.id,
    type: eventType,
    status,
    title: `${eventType === "git-command" ? "Git" : "Workspace"}: ${titleFromUserContent(commandLine || "command")}`,
    detail,
    commandLine,
    cwd: normalized.cwd,
    code: typeof normalized.code === "number" ? normalized.code : null,
    durationMs: typeof normalized.durationMs === "number" ? normalized.durationMs : null,
    stdout: normalized.stdout || "",
    stderr: normalized.stderr || "",
    project: normalized.project,
    sessionId: String(run?.sessionId || normalized.requestId || normalized.id || ""),
    runtimeOwner: normalized.runtimeOwner || "",
    createdAt: normalized.startedAt || now(),
  });
}

function normalizeRunEvent(item, store) {
  const project = normalizeAutomationProject(item?.project, store);
  const status = ["running", "ok", "error", "cancelled"].includes(item?.status) ? item.status : "ok";
  const capabilityContext = normalizeCapabilityContext(item?.capabilityContext);
  return {
    id: item?.id || id("run_event"),
    type: String(item?.type || "run").trim() || "run",
    status,
    title: String(item?.title || "").trim(),
    detail: String(item?.detail || ""),
    commandLine: String(item?.commandLine || ""),
    cwd: String(item?.cwd || project?.path || ""),
    path: slashPath(String(item?.path || "")),
    action: String(item?.action || ""),
    code: typeof item?.code === "number" ? item.code : null,
    durationMs: typeof item?.durationMs === "number" ? item.durationMs : null,
    stdout: String(item?.stdout || ""),
    stderr: String(item?.stderr || ""),
    project,
    sessionId: String(item?.sessionId || ""),
    runtimeOwner: String(item?.runtimeOwner || ""),
    createdAt: isoOrEmpty(item?.createdAt) || now(),
    ...(capabilityContext ? { capabilityContext } : {}),
  };
}

function richerRunEventOutput(current, incoming) {
  const currentText = String(current || "");
  const incomingText = String(incoming || "");
  return incomingText.length >= currentText.length ? incomingText : currentText;
}

function upsertRunEvent(store, event) {
  const existing = (store.runEvents || []).find((item) => item.id && item.id === event?.id);
  const incomingIsStaleStart = existing && existing.status !== "running" && event?.status === "running";
  const normalized = normalizeRunEvent({
    ...existing,
    ...event,
    ...(incomingIsStaleStart ? existing : {}),
    stdout: richerRunEventOutput(existing?.stdout, event?.stdout),
    stderr: richerRunEventOutput(existing?.stderr, event?.stderr),
    createdAt: existing?.createdAt || event?.createdAt,
  }, store);
  store.runEvents = [
    normalized,
    ...(store.runEvents || []).filter((item) => item.id !== normalized.id),
  ].slice(0, RUN_EVENT_LIMIT);
  return normalized;
}

function normalizeSourceRef(item, store) {
  const project = normalizeAutomationProject(item?.project, store);
  const sourcePath = slashPath(item?.path || item?.relativePath || "");
  const type = item?.type || "file";
  const title = item?.title || item?.name || path.basename(sourcePath) || sourcePath;
  return {
    id: item?.id || `${type}:${project?.path || project?.name || "workspace"}:${sourcePath}`,
    type,
    path: sourcePath,
    name: item?.name || title,
    title,
    reason: item?.reason || "",
    detail: item?.detail || "",
    excerpt: item?.excerpt || "",
    eventId: item?.eventId || "",
    range: item?.range && typeof item.range === "object" ? item.range : null,
    project,
    size: Number(item?.size || 0),
    sha256: item?.sha256 || "",
    updatedAt: isoOrEmpty(item?.updatedAt),
    lastOpenedAt: isoOrEmpty(item?.lastOpenedAt) || now(),
  };
}

function upsertSourceRef(store, source) {
  const normalized = normalizeSourceRef(source, store);
  store.sourceRefs = [
    normalized,
    ...(store.sourceRefs || []).filter((item) => item.id !== normalized.id),
  ].slice(0, SOURCE_REF_LIMIT);
  return normalized;
}

function normalizeUrlForStore(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function normalizeBrowserVisit(item, store) {
  const url = normalizeUrlForStore(item?.url);
  const status = ["loading", "ready", "error", "external", "idle"].includes(item?.status) ? item.status : "idle";
  const project = normalizeAutomationProject(item?.project, store);
  const startedAt = isoOrEmpty(item?.startedAt) || now();
  const endedAt = isoOrEmpty(item?.endedAt) || (status === "loading" ? "" : now());
  const finalUrl = normalizeUrlForStore(item?.finalUrl || item?.resolvedUrl || item?.validatedUrl || item?.url);
  return {
    id: item?.id || id("browser"),
    url,
    finalUrl,
    title: trimOutput(String(item?.title || ""), 400),
    excerpt: trimOutput(String(item?.excerpt || item?.snapshot?.text || ""), 1200),
    status,
    error: String(item?.error || ""),
    httpStatus: item?.httpStatus ? Number(item.httpStatus) : null,
    errorCode: Number.isFinite(Number(item?.errorCode)) ? Number(item.errorCode) : null,
    validatedUrl: normalizeUrlForStore(item?.validatedUrl || item?.validatedURL || item?.validatedURLString),
    isMainFrame: Boolean(item?.isMainFrame),
    project,
    startedAt,
    endedAt,
    lastEventAt: isoOrEmpty(item?.lastEventAt) || now(),
    snapshotCapturedAt: isoOrEmpty(item?.snapshotCapturedAt) || (item?.title || item?.excerpt ? now() : ""),
    external: Boolean(item?.external || status === "external"),
  };
}

function upsertBrowserVisit(store, visit) {
  const normalized = normalizeBrowserVisit(visit, store);
  store.browserVisits = [
    normalized,
    ...(store.browserVisits || []).filter((item) => item.id !== normalized.id),
  ].slice(0, BROWSER_VISIT_LIMIT);
  return normalized;
}

function normalizeNotice(item, store) {
  const level = ["error", "warning", "info", "success"].includes(item?.level) ? item.level : "info";
  const createdAt = isoOrEmpty(item?.createdAt) || now();
  const project = normalizeAutomationProject(item?.project, store);
  const capabilityContext = normalizeCapabilityContext(item?.capabilityContext);
  return {
    id: item?.id || id("notice"),
    key: String(item?.key || ""),
    level,
    source: String(item?.source || "Claudex"),
    title: String(item?.title || item?.message || "Notice").trim(),
    detail: trimOutput(String(item?.detail || item?.error || ""), 6000),
    action: String(item?.action || ""),
    runEventId: String(item?.runEventId || ""),
    sessionId: String(item?.sessionId || ""),
    project,
    count: Math.max(1, Number(item?.count || 1)),
    createdAt,
    lastSeenAt: isoOrEmpty(item?.lastSeenAt) || createdAt,
    dismissedAt: isoOrEmpty(item?.dismissedAt),
    ...(capabilityContext ? { capabilityContext } : {}),
  };
}

function upsertNotice(store, notice) {
  const normalized = normalizeNotice(notice, store);
  const existing = normalized.key
    ? (store.notices || []).find((item) => item.key === normalized.key && !item.dismissedAt)
    : null;
  const nextNotice = existing
    ? {
      ...existing,
      ...normalized,
      id: existing.id,
      count: Math.max(1, Number(existing.count || 1)) + 1,
      createdAt: existing.createdAt || normalized.createdAt,
      lastSeenAt: now(),
      dismissedAt: "",
    }
    : normalized;
  store.notices = [
    nextNotice,
    ...(store.notices || []).filter((item) => item.id !== nextNotice.id),
  ].slice(0, NOTICE_LIMIT);
  return nextNotice;
}

function dataPath() {
  return path.join(app.getPath("userData"), "desktop-data.json");
}

function legacyDataPath() {
  return path.join(app.getPath("appData"), "Claude Code App", "desktop-data.json");
}

function localWorkspaceProject() {
  return {
    name: "本地工作区",
    path: "",
  };
}

function isPlaceholderProject(project) {
  const name = String(project?.name || "").trim().toLowerCase();
  return !project?.path && (!name || name === "本地工作区" || name === "local workspace");
}

function projectMarkerScore(folder) {
  try {
    if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return 0;
    return PROJECT_MARKERS.reduce(
      (score, marker) => score + (fs.existsSync(path.join(folder, marker)) ? 1 : 0),
      0,
    );
  } catch {
    return 0;
  }
}

function launchProjectFromContext() {
  const candidates = [];
  for (const arg of process.argv.slice(1)) {
    if (!arg || String(arg).startsWith("-")) continue;
    const resolved = path.resolve(process.cwd(), String(arg));
    candidates.push(resolved);
  }
  if (!app.isPackaged) candidates.push(process.cwd());

  const appPath = path.resolve(app.getAppPath());
  const uniqueCandidates = [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
  for (const candidate of uniqueCandidates) {
    if (app.isPackaged && (candidate === appPath || candidate.startsWith(`${appPath}${path.sep}`))) {
      continue;
    }
    if (projectMarkerScore(candidate) > 0) {
      return projectFromPath(candidate);
    }
  }
  return null;
}

function storeHasRealProject(store) {
  return Boolean(store.activeProject?.path)
    || (store.projects || []).some((project) => Boolean(project?.path))
    || (store.sessions || []).some((session) => Boolean(session?.projectPath));
}

function defaultStore() {
  const createdAt = now();
  const env = envBag();
  const hasAnthropicEnv = Boolean(
    env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_BASE_URL || env.ANTHROPIC_MODEL,
  );
  const hasOpenAiEnv = Boolean(env.OPENAI_API_KEY || env.OPENAI_BASE_URL || env.OPENAI_MODEL);
  const provider = hasAnthropicEnv ? "anthropic" : "openai-compatible";
  const activeProject = launchProjectFromContext() || localWorkspaceProject();
  return {
    version: 1,
    settings: {
      provider,
      model:
        env.ANTHROPIC_MODEL ||
        env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
        env.OPENAI_MODEL ||
        (hasAnthropicEnv ? "claude-sonnet-4-5-20250929" : "gpt-4.1"),
      baseUrl:
        env.ANTHROPIC_BASE_URL ||
        env.OPENAI_BASE_URL ||
        (hasAnthropicEnv ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"),
      temperature: 0.2,
      timeoutMs: Number(env.API_TIMEOUT_MS || 600000),
      language: "zh",
      appearance: {
        fontSize: "compact",
        density: "compact",
      },
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      apiKeys: {},
      capabilities: DEFAULT_CAPABILITIES,
      customMarketplaces: [],
      claudeCode: CLAUDE_CODE_SETTINGS,
    },
    activeProject,
    projects: [activeProject],
    sessions: [
      {
        id: "default",
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
    capabilityStatus: null,
  };
}

function normalizeCapabilityStatus(status, store = {}) {
  if (!status || typeof status !== "object") return null;
  const project = status.project || store.activeProject || localWorkspaceProject();
  return {
    refreshedAt: isoOrEmpty(status.refreshedAt) || now(),
    project: {
      name: String(project?.name || project?.path || ""),
      path: String(project?.path || ""),
    },
    available: Boolean(status.available),
    version: String(status.version || ""),
    versionCommand: status.versionCommand || null,
    auth: status.auth || null,
    authCommand: status.authCommand || null,
    plugins: String(status.plugins || ""),
    pluginItems: Array.isArray(status.pluginItems) ? status.pluginItems : [],
    pluginCommand: status.pluginCommand || null,
    skills: Array.isArray(status.skills) ? status.skills : [],
    skillItems: Array.isArray(status.skillItems) ? status.skillItems : [],
    skillRoots: Array.isArray(status.skillRoots) ? status.skillRoots.filter(Boolean) : [],
    skillsTruncated: Boolean(status.skillsTruncated),
    mcp: String(status.mcp || ""),
    mcpServers: Array.isArray(status.mcpServers) ? status.mcpServers : [],
    mcpCommand: status.mcpCommand || null,
    marketplaces: Array.isArray(status.marketplaces) ? status.marketplaces : [],
    marketplacePlugins: Array.isArray(status.marketplacePlugins) ? status.marketplacePlugins : [],
    marketplaceOutput: String(status.marketplaceOutput || ""),
    marketplaceCommand: status.marketplaceCommand || null,
    lastError: String(status.lastError || ""),
  };
}

function statusCommandOk(commandState) {
  if (!commandState) return false;
  if (typeof commandState.jsonCode === "number") return commandState.jsonCode === 0 || commandState.code === 0;
  return commandState.code === 0;
}

function statusCommandErrorText(commandState) {
  if (!commandState || statusCommandOk(commandState)) return "";
  return String(commandState.error || commandState.stderr || commandState.jsonStderr || "").trim();
}

function mergeCapabilityStatusSnapshot(status, previousStatus, store = {}) {
  const next = normalizeCapabilityStatus(status, store);
  const previous = normalizeCapabilityStatus(previousStatus, store);
  if (!next || !previous) return next;
  if (!statusCommandOk(next.pluginCommand) && previous.pluginItems.length) {
    next.plugins = previous.plugins;
    next.pluginItems = previous.pluginItems;
  }
  if (!statusCommandOk(next.mcpCommand) && previous.mcpServers.length) {
    next.mcp = previous.mcp;
    next.mcpServers = previous.mcpServers;
  }
  if (!statusCommandOk(next.marketplaceCommand) && (previous.marketplaces.length || previous.marketplacePlugins.length)) {
    next.marketplaces = previous.marketplaces;
    next.marketplacePlugins = previous.marketplacePlugins;
    next.marketplaceOutput = previous.marketplaceOutput;
  }
  next.lastError = [
    statusCommandErrorText(next.versionCommand),
    statusCommandErrorText(next.authCommand),
    statusCommandErrorText(next.pluginCommand),
    statusCommandErrorText(next.mcpCommand),
    statusCommandErrorText(next.marketplaceCommand),
  ].filter(Boolean).join("\n");
  return next;
}

function effectiveStoredModel(storedModel, fallbackModel) {
  const envModel = envValue("ANTHROPIC_MODEL");
  const model = String(storedModel || "").trim();
  const staleSonnetDefault = model === "sonnet" || model === "claude-sonnet-4-5" || /(^|-)sonnet-5($|-)/.test(model);
  if (envModel && (!model || staleSonnetDefault)) return envModel;
  return model || fallbackModel;
}

function normalizeStore(store) {
  const fallback = defaultStore();
  const launchProject = launchProjectFromContext();
  const sessions = Array.isArray(store.sessions) ? store.sessions : [];
  const shouldAdoptLaunchProject = Boolean(launchProject)
    && !storeHasRealProject(store)
    && !sessions.some((session) => hasSessionMessages(session));
  const activeProject = shouldAdoptLaunchProject ? launchProject : store.activeProject || {
    name: store.sessions?.[0]?.project || fallback.activeProject.name,
    path: store.sessions?.[0]?.projectPath || "",
  };
  const storedProjects = Array.isArray(store.projects) && store.projects.length ? store.projects : [activeProject];
  const projects = shouldAdoptLaunchProject
    ? [launchProject, ...storedProjects.filter((project) => !isPlaceholderProject(project))]
    : storedProjects;
  const mergedSettings = {
    ...fallback.settings,
    ...(store.settings || {}),
    model: effectiveStoredModel(store.settings?.model, fallback.settings.model),
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      ...(store.settings?.capabilities || {}),
    },
    customMarketplaces: Array.isArray(store.settings?.customMarketplaces) ? store.settings.customMarketplaces : [],
    claudeCode: {
      ...CLAUDE_CODE_SETTINGS,
      ...(store.settings?.claudeCode || {}),
    },
    appearance: {
      fontSize: "compact",
      density: "compact",
      ...(store.settings?.appearance || {}),
    },
  };

  return {
    ...fallback,
    ...store,
    settings: mergedSettings,
    activeProject,
    projects,
    sessions: (store.sessions || fallback.sessions).map((session) => {
      const adoptSessionProject = shouldAdoptLaunchProject
        && !hasSessionMessages(session)
        && !session.projectPath
        && isGenericSessionTitle(session.title);
      return {
        ...session,
        project: adoptSessionProject ? launchProject.name : session.project || activeProject.name,
        projectPath: adoptSessionProject ? launchProject.path : session.projectPath || activeProject.path || "",
        messages: Array.isArray(session.messages) ? session.messages : [],
        pinned: Boolean(session.pinned),
        archived: Boolean(session.archived),
        pinnedAt: session.pinned ? isoOrEmpty(session.pinnedAt) : "",
        archivedAt: session.archived ? isoOrEmpty(session.archivedAt) : "",
        renamedAt: isoOrEmpty(session.renamedAt),
        forkedAt: isoOrEmpty(session.forkedAt),
        forkedFromId: String(session.forkedFromId || ""),
        forkedFromTitle: String(session.forkedFromTitle || ""),
        forkedFromClaudeSessionId: String(session.forkedFromClaudeSessionId || ""),
      };
    }),
    automations: Array.isArray(store.automations)
      ? store.automations.map((automation) => normalizeAutomation(automation, { ...store, activeProject }))
          .filter((automation) => automation.prompt)
          .slice(0, AUTOMATION_LIMIT)
      : [],
    subagentRuns: Array.isArray(store.subagentRuns)
      ? store.subagentRuns.map((run) => normalizeSubagentRun(run, { ...store, activeProject }))
          .filter((run) => run.task)
          .slice(0, SUBAGENT_RUN_LIMIT)
      : [],
    commandRuns: Array.isArray(store.commandRuns)
      ? store.commandRuns.map((run) => normalizeCommandRun(run, { ...store, activeProject }))
          .filter((run) => run.command)
          .slice(0, COMMAND_RUN_LIMIT)
      : [],
    runEvents: Array.isArray(store.runEvents)
      ? store.runEvents.map((event) => normalizeRunEvent(event, { ...store, activeProject }))
          .filter((event) => event.title)
          .slice(0, RUN_EVENT_LIMIT)
      : [],
    sourceRefs: Array.isArray(store.sourceRefs)
      ? store.sourceRefs.map((source) => normalizeSourceRef(source, { ...store, activeProject }))
          .filter((source) => source.path)
          .slice(0, SOURCE_REF_LIMIT)
      : [],
    browserVisits: Array.isArray(store.browserVisits)
      ? store.browserVisits.map((visit) => normalizeBrowserVisit(visit, { ...store, activeProject }))
          .filter((visit) => visit.url)
          .slice(0, BROWSER_VISIT_LIMIT)
      : [],
    notices: Array.isArray(store.notices)
      ? store.notices.map((notice) => normalizeNotice(notice, { ...store, activeProject }))
          .filter((notice) => notice.title)
          .slice(0, NOTICE_LIMIT)
      : [],
    capabilityStatus: normalizeCapabilityStatus(store.capabilityStatus, { ...store, activeProject }),
  };
}

function projectFromPath(projectPath) {
  return {
    name: path.basename(projectPath) || projectPath,
    path: projectPath,
  };
}

function addProject(store, project) {
  const key = project.path || project.name;
  const existing = (store.projects || []).filter((item) => (item.path || item.name) !== key);
  store.projects = [project, ...existing].slice(0, 12);
  store.activeProject = project;
}

function slashPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relativePathEscapesRoot(relativePath) {
  return relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath);
}

function resolveProjectRoot(projectPath) {
  const store = readStore();
  const candidate = projectPath || store.activeProject?.path;
  if (!candidate || !fs.existsSync(candidate)) {
    throw new Error("请先选择项目文件夹。");
  }
  const root = path.resolve(candidate);
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) throw new Error("项目路径不是文件夹。");
  return root;
}

function resolveInsideProject(projectPath, relativePath = "") {
  const root = resolveProjectRoot(projectPath);
  const target = path.resolve(root, relativePath || ".");
  const relative = path.relative(root, target);
  if (relativePathEscapesRoot(relative)) {
    throw new Error("路径超出了当前项目范围。");
  }
  return { root, target, relative: slashPath(relative) };
}

function trimOutput(value, maxChars = MAX_COMMAND_OUTPUT_CHARS) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[输出已截断]`;
}

function emitProcessChunk(sender, channel, requestId, stream, text) {
  if (!sender || sender.isDestroyed?.() || !text) return;
  sender.send(channel, {
    requestId,
    type: "chunk",
    stream,
    text: stripAnsi(String(text)),
  });
}

function emitProcessRunEvent(sender, channel, requestId, runEvent) {
  if (!sender || sender.isDestroyed?.() || !runEvent) return;
  sender.send(channel, {
    requestId,
    type: "run-event",
    runEvent,
  });
}

function createProcessRunEventEmitter(sender, channel, requestId, snapshot, intervalMs = 80) {
  let timer = null;
  let pending = false;
  const emit = () => {
    timer = null;
    if (!pending) return;
    pending = false;
    emitProcessRunEvent(sender, channel, requestId, snapshot?.());
  };
  return {
    schedule() {
      pending = true;
      if (!timer) timer = setTimeout(emit, intervalMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      emit();
    },
  };
}

function waitMilliseconds(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function posixProcessGroupExists(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

async function waitForPosixProcessGroupExit(processGroupId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!posixProcessGroupExists(processGroupId)) return true;
    await waitMilliseconds(50);
  }
  return !posixProcessGroupExists(processGroupId);
}

async function terminatePosixProcessTree(child) {
  const processGroupId = Number(child?.pid || 0);
  if (!processGroupId) return false;
  if (!posixProcessGroupExists(processGroupId)) return true;
  try {
    process.kill(-processGroupId, "SIGTERM");
  } catch (error) {
    if (error?.code === "ESRCH") return true;
    return false;
  }
  if (await waitForPosixProcessGroupExit(processGroupId, 1500)) return true;
  try {
    process.kill(-processGroupId, "SIGKILL");
  } catch (error) {
    if (error?.code === "ESRCH") return true;
    return false;
  }
  return waitForPosixProcessGroupExit(processGroupId, 3000);
}

function runWindowsTaskkill(pid) {
  return new Promise((resolve) => {
    let killer;
    try {
      killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch (_error) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(Boolean(confirmed));
    };
    const timeout = setTimeout(() => {
      try {
        if (!killer.killed) killer.kill();
      } catch {
        // The process may have exited while the timeout callback was queued.
      }
      killer.unref?.();
      finish(false);
    }, WINDOWS_TASKKILL_TIMEOUT_MS);
    killer.once("error", () => finish(false));
    killer.once("close", (code) => finish(code === 0));
  });
}

function captureWindowsProcessSnapshot(command, args, parseOutput, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (_error) {
      resolve(null);
      return;
    }
    let stdout = "";
    let settled = false;
    let timeout = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const stopChild = () => {
      child.stdout?.destroy();
      try {
        if (!child.killed) child.kill();
      } catch {
        // The process may have exited between the timeout and cleanup.
      }
      child.unref?.();
    };
    timeout = setTimeout(() => {
      stopChild();
      finish(null);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 2 * 1024 * 1024) {
        stopChild();
        finish(null);
      }
    });
    child.once("error", () => finish(null));
    child.once("close", (code) => {
      if (code !== 0) {
        finish(null);
        return;
      }
      try {
        finish(parseOutput(stdout));
      } catch (_error) {
        finish(null);
      }
    });
  });
}

function parseWmicProcessSnapshot(output) {
  const rows = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((part) => part.trim()));
  const headerIndex = rows.findIndex((parts) => (
    parts.includes("ProcessId") && parts.includes("ParentProcessId")
  ));
  if (headerIndex < 0) return null;
  const header = rows[headerIndex];
  const processIdIndex = header.indexOf("ProcessId");
  const parentProcessIdIndex = header.indexOf("ParentProcessId");
  const processes = rows
    .slice(headerIndex + 1)
    .map((parts) => ({
      pid: Number(parts[processIdIndex] || 0),
      parentPid: Number(parts[parentProcessIdIndex] || 0),
    }))
    .filter((item) => item.pid > 0 && Number.isFinite(item.parentPid));
  return processes.length ? processes : null;
}

function parseCimProcessSnapshot(output) {
  const parsed = JSON.parse(String(output || "").trim() || "[]");
  const processes = (Array.isArray(parsed) ? parsed : [parsed])
    .map((item) => ({
      pid: Number(item?.ProcessId || 0),
      parentPid: Number(item?.ParentProcessId || 0),
    }))
    .filter((item) => item.pid > 0);
  return processes.length ? processes : null;
}

async function listWindowsProcesses() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const wmic = path.join(systemRoot, "System32", "Wbem", "WMIC.exe");
  if (fs.existsSync(wmic)) {
    const snapshot = await captureWindowsProcessSnapshot(
      wmic,
      ["process", "get", "ProcessId,ParentProcessId", "/format:csv"],
      parseWmicProcessSnapshot,
      WINDOWS_WMIC_SNAPSHOT_TIMEOUT_MS,
    );
    if (snapshot) return snapshot;
  }

  const powershell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return captureWindowsProcessSnapshot(
    fs.existsSync(powershell) ? powershell : "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress",
    ],
    parseCimProcessSnapshot,
    WINDOWS_CIM_SNAPSHOT_TIMEOUT_MS,
  );
}

function windowsProcessTreeIds(processes, rootPid) {
  const children = new Map();
  for (const item of processes || []) {
    if (!children.has(item.parentPid)) children.set(item.parentPid, []);
    children.get(item.parentPid).push(item.pid);
  }
  const ids = [];
  const seen = new Set([rootPid]);
  const pending = [rootPid];
  while (pending.length) {
    const parentPid = pending.shift();
    for (const childPid of children.get(parentPid) || []) {
      if (seen.has(childPid)) continue;
      seen.add(childPid);
      ids.push(childPid);
      pending.push(childPid);
    }
  }
  return ids;
}

async function inspectWindowsProcessTree(knownPids) {
  const processes = await listWindowsProcesses();
  if (!processes) return null;
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const item of processes) {
      if (!knownPids.has(item.parentPid) || knownPids.has(item.pid)) continue;
      knownPids.add(item.pid);
      expanded = true;
    }
  }
  const livePids = new Set(processes.map((item) => item.pid));
  const knownAlive = [...knownPids].filter((pid) => livePids.has(pid));
  return { gone: knownAlive.length === 0, livePids: knownAlive };
}

async function terminateWindowsProcessTree(child) {
  const pid = Number(child?.pid || 0);
  if (!pid) return false;
  const before = await listWindowsProcesses();
  const knownPids = new Set([pid, ...windowsProcessTreeIds(before, pid)]);
  const taskkillConfirmed = await runWindowsTaskkill(pid);
  if (!taskkillConfirmed && knownPids.size > 1) {
    await Promise.all([...knownPids].reverse().map((processId) => runWindowsTaskkill(processId)));
  }

  const deadline = Date.now() + 2000;
  let cleanSnapshots = 0;
  const observeInspection = (inspection) => {
    if (!inspection) {
      cleanSnapshots = 0;
      return false;
    }
    if (inspection.gone) {
      cleanSnapshots += 1;
      return true;
    }
    cleanSnapshots = 0;
    return false;
  };
  while (Date.now() < deadline) {
    const inspection = await inspectWindowsProcessTree(knownPids);
    if (observeInspection(inspection)) {
      if (cleanSnapshots >= 2) return true;
    } else {
      if (inspection?.livePids?.length) {
        await Promise.all(inspection.livePids.map((processId) => runWindowsTaskkill(processId)));
      }
    }
    await waitMilliseconds(75);
  }
  const inspection = await inspectWindowsProcessTree(knownPids);
  if (!inspection) return false;
  if (!observeInspection(inspection)) return false;
  if (cleanSnapshots >= 2) return true;

  await waitMilliseconds(75);
  const confirmation = await inspectWindowsProcessTree(knownPids);
  return observeInspection(confirmation) && cleanSnapshots >= 2;
}

function terminateChildProcessTree(child) {
  if (!child?.pid) return Promise.resolve(false);
  return process.platform === "win32"
    ? terminateWindowsProcessTree(child)
    : terminatePosixProcessTree(child);
}

function killChildProcess(child) {
  if (!child || typeof child !== "object") return Promise.resolve(false);
  const currentAttempt = childTreeTerminationAttempts.get(child);
  if (currentAttempt) return currentAttempt;
  const attempt = terminateChildProcessTree(child).then((confirmed) => {
    if (!confirmed) childTreeTerminationAttempts.delete(child);
    return confirmed;
  });
  childTreeTerminationAttempts.set(child, attempt);
  return attempt;
}

function createProcessRequestHandle(child, onCancel) {
  let stopRequested = false;
  let stopConfirmed = false;
  let processClosed = false;
  let stopAttempt = null;
  let resolveTreeStopped;
  const treeStopped = new Promise((resolve) => {
    resolveTreeStopped = resolve;
  });
  const requestStop = (notifyCancel) => {
    if (!stopRequested && notifyCancel) onCancel?.();
    stopRequested = true;
    confirmPidlessStop();
    if (stopConfirmed) return Promise.resolve(true);
    if (stopAttempt) return stopAttempt;
    stopAttempt = terminateChildProcessTree(child).then((confirmed) => {
      stopAttempt = null;
      if (confirmed && !stopConfirmed) {
        stopConfirmed = true;
        resolveTreeStopped(true);
      }
      return confirmed;
    });
    return stopAttempt;
  };
  const confirmPidlessStop = () => {
    if (!stopRequested || stopConfirmed || child.pid || !processClosed) return;
    stopConfirmed = true;
    resolveTreeStopped(true);
  };
  const handle = {
    pid: child.pid,
    child,
    get stopRequested() {
      return stopRequested;
    },
    kill() {
      return requestStop(true);
    },
    terminate() {
      return requestStop(false);
    },
    markProcessClosed() {
      processClosed = true;
      confirmPidlessStop();
    },
    waitForTreeStop() {
      return stopRequested ? treeStopped : Promise.resolve(true);
    },
  };
  return handle;
}

function activeRequestIdError(requestId) {
  const error = new Error(`REQUEST_ID_ACTIVE: 请求 ${requestId} 正在运行。`);
  error.code = "REQUEST_ID_ACTIVE";
  return error;
}

function assertActiveRequestIdAvailable(requestId) {
  if (!requestId || !activeRequests.has(requestId)) return;
  throw activeRequestIdError(requestId);
}

function stopActiveRequest(requestId) {
  const request = activeRequests.get(requestId);
  if (!request) return false;
  if (typeof request.abort === "function") request.abort();
  else if (typeof request.kill === "function") request.kill();
  else if (request.pid) killChildProcess(request);
  return true;
}

function runtimeCompletion(properties = {}) {
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  return { ...properties, done, resolveDone };
}

function waitForRuntimeCompletion(runtime, timeoutMs) {
  if (!runtime?.done) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    runtime.done.then(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

let quitDrainPromise = null;
let quitDrainComplete = false;

function activeRunRuntimes() {
  return new Set([
    ...activeAutomationRuns.values(),
    ...activeSubagentRuns.values(),
    ...activeWorkspaceCommandRuns.values(),
  ]);
}

async function drainActiveRequestsForQuit(timeoutMs = QUIT_DRAIN_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while ((activeRequests.size || activeRunRuntimes().size) && Date.now() < deadline) {
    for (const requestId of [...activeRequests.keys()]) stopActiveRequest(requestId);
    const runtimes = [...activeRunRuntimes()];
    await Promise.race([
      waitMilliseconds(250),
      ...runtimes.map((runtime) => runtime.done),
    ]);
  }
  return !activeRequests.size && !activeRunRuntimes().size;
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function fileSnapshot(target, content) {
  const stat = fs.statSync(target);
  const buffer = Buffer.isBuffer(content) ? content : fs.readFileSync(target);
  return {
    path: "",
    name: path.basename(target),
    content: buffer.toString("utf8"),
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
    sha256: hashBuffer(buffer),
  };
}

function resolveNodeCommandShim(command, args = []) {
  if (process.platform !== "win32") return null;
  if (!/\.(?:cmd|bat)$/i.test(String(command || "")) || !fs.existsSync(command)) return null;
  const dir = path.dirname(command);
  let text = "";
  try {
    text = fs.readFileSync(command, "utf8");
  } catch {
    return null;
  }
  const match = text.match(/["']%~dp0([^"']+\.(?:cjs|mjs|js))["']\s+%[*]/i)
    || text.match(/["']%dp0%\\?([^"']+\.(?:cjs|mjs|js))["']\s+%[*]/i)
    || text.match(/["']([A-Za-z]:[^"']+\.(?:cjs|mjs|js))["']\s+%[*]/i);
  if (!match) return null;

  const scriptPath = path.isAbsolute(match[1])
    ? match[1]
    : path.resolve(dir, match[1].replace(/^[\\/]+/, ""));
  if (!fs.existsSync(scriptPath)) return null;

  const localNode = path.join(dir, "node.exe");
  return {
    command: fs.existsSync(localNode) ? localNode : "node",
    args: [scriptPath, ...args],
  };
}

function spawnDescriptor(command, args = []) {
  const nodeShim = resolveNodeCommandShim(command, args);
  if (nodeShim) return nodeShim;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(String(command || ""))) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/c", command, ...args],
    };
  }
  return { command, args };
}

function runProcess(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs || CLAUDE_TIMEOUT_MS);
  const maxOutputChars = Number(options.maxOutputChars || MAX_COMMAND_OUTPUT_CHARS);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    try {
      assertActiveRequestIdAvailable(options.requestId);
    } catch (error) {
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error.message,
        code: 1,
      });
      return;
    }
    let child;
    try {
      const childEnv = { ...process.env, ...(options.env || {}) };
      for (const [key, value] of Object.entries(childEnv)) {
        if (value === undefined || value === null) delete childEnv[key];
      }
      const spawnTarget = spawnDescriptor(command, args);
      child = spawn(spawnTarget.command, spawnTarget.args, {
        cwd: options.cwd || app.getPath("home"),
        windowsHide: true,
        env: childEnv,
        detached: process.platform !== "win32",
      });
    } catch (error) {
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error.message,
        code: 1,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    let settling = false;
    let timedOut = false;
    const requestHandle = createProcessRequestHandle(child);
    const finish = async (result) => {
      if (settled || settling) return;
      settling = true;
      if (requestHandle.stopRequested) await requestHandle.waitForTreeStop();
      settled = true;
      clearTimeout(timeout);
      if (options.requestId && activeRequests.get(options.requestId) === requestHandle) {
        activeRequests.delete(options.requestId);
      }
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: trimOutput(stdout, maxOutputChars),
        stderr: trimOutput(stderr, maxOutputChars),
        ...result,
      });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      requestHandle.terminate();
    }, timeoutMs);

    if (options.requestId) activeRequests.set(options.requestId, requestHandle);
    child.stdout.on("data", (chunk) => {
      stdout = trimOutput(stdout + chunk.toString("utf8"), maxOutputChars);
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + chunk.toString("utf8"), maxOutputChars);
    });
    child.on("error", (error) => {
      requestHandle.markProcessClosed();
      void finish(timedOut
        ? { code: 124, stderr: trimOutput(`${stderr}\n命令运行超过 ${timeoutMs} 毫秒，已停止。`, maxOutputChars) }
        : { code: 1, stderr: trimOutput(`${stderr}\n${error.message}`, maxOutputChars) });
    });
    child.on("close", (code) => {
      requestHandle.markProcessClosed();
      void finish(timedOut
        ? { code: 124, stderr: trimOutput(`${stderr}\n命令运行超过 ${timeoutMs} 毫秒，已停止。`, maxOutputChars) }
        : { code });
    });
  });
}

function runStreamingProcess(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs || CLAUDE_TIMEOUT_MS);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    try {
      assertActiveRequestIdAvailable(options.requestId);
    } catch (error) {
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error.message,
        code: 1,
      });
      return;
    }
    let child;
    try {
      const childEnv = { ...process.env, ...(options.env || {}) };
      for (const [key, value] of Object.entries(childEnv)) {
        if (value === undefined || value === null) delete childEnv[key];
      }
      const spawnTarget = spawnDescriptor(command, args);
      child = spawn(spawnTarget.command, spawnTarget.args, {
        cwd: options.cwd || app.getPath("home"),
        windowsHide: true,
        env: childEnv,
        detached: process.platform !== "win32",
      });
    } catch (error) {
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error.message,
        code: 1,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let settled = false;
    let settling = false;
    let cancelled = false;
    let timedOut = false;
    const requestHandle = createProcessRequestHandle(child, () => {
      cancelled = true;
    });
    const finish = async (result) => {
      if (settled || settling) return;
      settling = true;
      if (requestHandle.stopRequested) await requestHandle.waitForTreeStop();
      settled = true;
      clearTimeout(timeout);
      if (lineBuffer.trim()) options.onLine?.(lineBuffer.trim());
      if (options.requestId && activeRequests.get(options.requestId) === requestHandle) {
        activeRequests.delete(options.requestId);
      }
      const finalResult = options.cancelAsCode130 && cancelled
        ? { ...result, code: 130, cancelled: true }
        : result;
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        ...finalResult,
      });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      requestHandle.terminate();
    }, timeoutMs);

    if (options.requestId) activeRequests.set(options.requestId, requestHandle);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout = trimOutput(stdout + text);
      options.onChunk?.("stdout", text);
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) options.onLine?.(line.trim());
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr = trimOutput(stderr + text);
      options.onChunk?.("stderr", text);
    });
    child.on("error", (error) => {
      requestHandle.markProcessClosed();
      void finish(timedOut
        ? { code: 124, stderr: trimOutput(`${stderr}\n命令运行超过 ${timeoutMs} 毫秒，已停止。`) }
        : { code: 1, stderr: trimOutput(`${stderr}\n${error.message}`) });
    });
    child.on("close", (code) => {
      requestHandle.markProcessClosed();
      void finish(timedOut
        ? { code: 124, stderr: trimOutput(`${stderr}\n命令运行超过 ${timeoutMs} 毫秒，已停止。`) }
        : { code });
    });
  });
}

function parseJsonOutput(output) {
  const trimmed = String(output || "").trim();
  if (!trimmed) return null;
  const candidates = [trimmed, ...trimmed.split(/\r?\n/).filter((line) => /^[\[{]/.test(line.trim()))].reverse();
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trying later lines because Claude Code may print diagnostics before JSON.
    }
  }
  return null;
}

function parseJsonArrayOutput(output) {
  const parsed = parseJsonOutput(output);
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonListOutput(output, keys = []) {
  const parsed = parseJsonOutput(output);
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const candidateKeys = [...keys, "items", "data", "results", "plugins", "marketplaces", "servers"];
  for (const key of candidateKeys) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return [];
}

function stripAnsi(value) {
  return String(value || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function commandOutputExcerpt(result) {
  return stripAnsi([result?.stderr, result?.stdout].filter(Boolean).join("\n")).trim();
}

function statusCommandState(result, jsonResult = null) {
  const plain = result || {};
  const json = jsonResult || null;
  const plainError = commandOutputExcerpt(plain);
  const jsonError = json ? commandOutputExcerpt(json) : "";
  return {
    code: typeof plain.code === "number" ? plain.code : null,
    jsonCode: json && typeof json.code === "number" ? json.code : undefined,
    stdout: stripAnsi(plain.stdout || "").trim(),
    stderr: stripAnsi(plain.stderr || "").trim(),
    jsonStdout: json ? stripAnsi(json.stdout || "").trim() : undefined,
    jsonStderr: json ? stripAnsi(json.stderr || "").trim() : undefined,
    error: jsonError || plainError,
  };
}

function pluginNameFromId(idValue) {
  const idText = String(idValue || "").trim();
  return idText.split("@")[0] || idText;
}

function pluginMarketplaceFromId(idValue) {
  const idText = String(idValue || "").trim();
  return idText.includes("@") ? idText.split("@").slice(1).join("@") : "";
}

function parseClaudePluginText(rawOutput) {
  const lines = stripAnsi(rawOutput).split(/\r?\n/);
  const items = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const head = line.match(/^>\s+(.+)$/);
    if (head) {
      if (current?.id) items.push(current);
      current = {
        id: head[1].trim(),
        name: pluginNameFromId(head[1]),
        marketplace: pluginMarketplaceFromId(head[1]),
        source: "claude-code",
      };
      continue;
    }
    if (!current) continue;
    const pair = line.match(/^([^:]+):\s*(.+)$/);
    if (!pair) continue;
    const key = pair[1].trim().toLowerCase();
    const value = pair[2].trim();
    if (key === "version") current.version = value;
    if (key === "scope") current.scope = value;
    if (key === "status") {
      current.status = value;
      current.enabled = /enabled/i.test(value);
    }
  }
  if (current?.id) items.push(current);
  return items;
}

function summarizeStructuredList(value, separator = ", ") {
  if (Array.isArray(value)) return value
    .map((item) => summarizeStructuredList(item, separator))
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, itemValue]) => itemValue !== false && itemValue !== null && itemValue !== undefined && itemValue !== "")
      .map(([key, itemValue]) => itemValue === true ? key : `${key}:${summarizeStructuredList(itemValue, separator)}`)
      .join(separator);
  }
  return String(value || "").trim();
}

function pluginToolsSummary(plugin) {
  return summarizeStructuredList(plugin?.tools || plugin?.toolNames || plugin?.commands || plugin?.slashCommands || plugin?.mcpTools);
}

function pluginPermissionsSummary(plugin) {
  return summarizeStructuredList(plugin?.permissions || plugin?.allowedTools || plugin?.capabilities || plugin?.permissionSummary);
}

function pluginErrorSummary(plugin) {
  const error = plugin?.error || plugin?.lastError || plugin?.errors || plugin?.diagnostics;
  return summarizeStructuredList(error, " · ");
}

function normalizeClaudePluginItems(jsonOutput, rawOutput) {
  const jsonItems = parseJsonListOutput(jsonOutput, ["plugins", "installedPlugins"]);
  const sourceItems = jsonItems.length ? jsonItems : parseClaudePluginText(rawOutput);
  return sourceItems.map((plugin) => {
    const idText = String(plugin.id || plugin.name || "").trim();
    const statusText = String(plugin.status || plugin.state || "").trim();
    const enabled = typeof plugin.enabled === "boolean"
      ? plugin.enabled
      : typeof plugin.disabled === "boolean"
        ? !plugin.disabled
        : /enabled|active|ready|ok|connected/i.test(statusText);
    const source = plugin.source || plugin.installSource || plugin.registry || plugin.repository || plugin.repo || plugin.url || "claude-code";
    const toolSource = plugin.tools || plugin.toolNames || plugin.commands || plugin.slashCommands || plugin.mcpTools;
    return {
      id: idText,
      name: String(plugin.name || pluginNameFromId(idText)).trim() || idText,
      marketplace: String(plugin.marketplace || pluginMarketplaceFromId(idText)).trim(),
      version: String(plugin.version || "unknown"),
      description: String(plugin.description || plugin.summary || ""),
      scope: String(plugin.scope || ""),
      enabled,
      status: statusText || (enabled ? "enabled" : "disabled"),
      installPath: String(plugin.installPath || plugin.path || plugin.location || ""),
      installedAt: String(plugin.installedAt || ""),
      lastUpdated: String(plugin.lastUpdated || ""),
      source: marketplacePluginSourceSummary(source) || "claude-code",
      tools: pluginToolsSummary(plugin),
      toolDetails: structuredToolDetails(toolSource),
      permissions: pluginPermissionsSummary(plugin),
      error: pluginErrorSummary(plugin),
    };
  }).filter((plugin) => plugin.id);
}

function normalizeMarketplaceItems(jsonOutput, rawOutput) {
  const jsonItems = parseJsonListOutput(jsonOutput, ["marketplaces"]);
  if (jsonItems.length) {
    return jsonItems.map((item) => ({
      name: String(item.name || "").trim(),
      source: String(item.source || ""),
      repo: String(item.repo || item.url || item.path || ""),
      installLocation: String(item.installLocation || item.path || ""),
      version: String(item.version || item.release || item.revision || ""),
      status: String(item.status || item.state || (item.enabled === true ? "enabled" : item.enabled === false ? "disabled" : "")),
      description: String(item.description || item.summary || ""),
      tools: summarizeStructuredList(item.tools || item.toolNames || item.commands || item.capabilities),
      permissions: summarizeStructuredList(item.permissions || item.allowedTools || item.permissionSummary),
      error: pluginErrorSummary(item),
      raw: item,
    })).filter((item) => item.name);
  }

  const lines = stripAnsi(rawOutput).split(/\r?\n/);
  const items = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const head = line.match(/^>\s+(.+)$/);
    if (head) {
      if (current?.name) items.push(current);
      current = { name: head[1].trim(), source: "", repo: "", installLocation: "", raw: {} };
      continue;
    }
    const sourceMatch = line.match(/^Source:\s*(.+)$/i);
    if (current && sourceMatch) {
      const source = sourceMatch[1].trim();
      const typedSource = source.match(/^([^()]+?)\s*\((.+)\)$/);
      current.source = typedSource ? typedSource[1].trim() : source;
      current.repo = typedSource ? typedSource[2].trim() : source;
    }
    const pair = line.match(/^([^:]+):\s*(.+)$/);
    if (!current || !pair) continue;
    const key = pair[1].trim().toLowerCase();
    const value = pair[2].trim();
    if (key === "version") current.version = value;
    if (key === "status" || key === "state") current.status = value;
    if (key === "description" || key === "summary") current.description = value;
    if (key === "repo" || key === "repository" || key === "url") current.repo = value;
    if (key === "install location" || key === "install path" || key === "location" || key === "path") current.installLocation = value;
    if (key === "tools" || key === "commands") current.tools = value;
    if (key === "permissions" || key === "allowed tools") current.permissions = value;
    if (key === "error" || key === "last error") current.error = value;
  }
  if (current?.name) items.push(current);
  return items;
}

function readJsonFileSafe(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function marketplacePluginSourceSummary(source) {
  if (!source) return "";
  if (typeof source === "string") return source;
  return [source.source, source.url, source.path, source.ref].filter(Boolean).join(" · ");
}

function marketplacePluginPermissionsSummary(plugin) {
  const permissions = plugin?.permissions || plugin?.allowedTools || plugin?.tools || plugin?.capabilities;
  return summarizeStructuredList(permissions);
}

function marketplacePluginRiskSummary(plugin) {
  const explicit = plugin?.risk || plugin?.risks || plugin?.security || plugin?.warning;
  return summarizeStructuredList(explicit, " · ");
}

function marketplacePluginName(plugin) {
  return String(plugin?.name || plugin?.id || plugin?.slug || plugin?.packageName || "").trim();
}

function marketplacePluginAuthor(plugin, manifest) {
  const author = plugin?.author || plugin?.owner || plugin?.publisher || manifest?.owner || manifest?.author;
  return typeof author === "string" ? author : author?.name || "";
}

function marketplacePluginSource(plugin) {
  return plugin?.source || plugin?.repository || plugin?.repo || plugin?.url || plugin?.homepage || "";
}

function marketplacePluginCatalogItem(plugin, manifest, marketplace, root, installedState) {
  const name = marketplacePluginName(plugin);
  if (!name) return null;
  const idText = `${name}@${marketplace.name}`;
  const identityKeys = [idText, name].map((value) => value.toLowerCase());
  const installed = identityKeys.some((key) => installedState.ids.has(key));
  const installedScopes = [...new Set(identityKeys.flatMap((key) => (
    [...(installedState.scopesById.get(key) || [])]
  )))].sort((left, right) => ["user", "project", "local"].indexOf(left) - ["user", "project", "local"].indexOf(right));
  const toolSource = plugin.tools || plugin.toolNames || plugin.commands || plugin.slashCommands || plugin.mcpTools || plugin.capabilities;
  return {
    id: idText,
    name,
    marketplace: marketplace.name,
    version: String(plugin.version || manifest?.version || "unknown"),
    description: String(plugin.description || plugin.summary || manifest?.description || manifest?.metadata?.description || ""),
    category: String(plugin.category || plugin.type || ""),
    author: String(marketplacePluginAuthor(plugin, manifest) || ""),
    homepage: String(plugin.homepage || plugin.url || ""),
    source: marketplacePluginSourceSummary(marketplacePluginSource(plugin)),
    tools: summarizeStructuredList(toolSource),
    toolDetails: structuredToolDetails(toolSource),
    permissions: marketplacePluginPermissionsSummary(plugin),
    risk: marketplacePluginRiskSummary(plugin),
    installLocation: root,
    installed,
    installedScopes,
  };
}

function marketplaceManifestRootCandidates(marketplace) {
  return [
    marketplace?.installLocation,
    marketplace?.repo,
    marketplace?.path,
    marketplace?.source,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => (
      fs.existsSync(value) &&
      fs.statSync(value).isDirectory()
    ));
}

function readMarketplaceManifest(marketplace) {
  for (const root of marketplaceManifestRootCandidates(marketplace)) {
    const direct = readJsonFileSafe(path.join(root, ".claude-plugin", "marketplace.json"));
    if (direct) return { manifest: direct, root };
    const nested = readJsonFileSafe(path.join(root, "marketplace.json"));
    if (nested) return { manifest: nested, root };
  }
  return { manifest: null, root: "" };
}

function marketplacePluginManifestRoot(manifestFile) {
  const dir = path.dirname(manifestFile);
  return path.basename(dir) === ".claude-plugin" ? path.dirname(dir) : dir;
}

function readMarketplacePluginManifests(root) {
  const manifests = [];
  const queue = [{ dir: root, depth: 0 }];
  const seenFiles = new Set();
  let inspectedDirs = 0;
  while (queue.length && manifests.length < 240 && inspectedDirs < 1200) {
    const { dir, depth } = queue.shift();
    inspectedDirs += 1;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name === "plugin.json") {
        const file = path.join(dir, entry.name);
        if (seenFiles.has(file)) continue;
        seenFiles.add(file);
        const plugin = readJsonFileSafe(file);
        if (plugin && typeof plugin === "object") {
          manifests.push({
            plugin,
            root: marketplacePluginManifestRoot(file),
            manifestPath: file,
          });
          if (manifests.length >= 240) break;
        }
      }
    }
    if (depth >= 5 || manifests.length >= 240) continue;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_DIRS.has(entry.name) || IGNORED_DIR_PATTERNS.some((pattern) => pattern.test(entry.name))) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return manifests;
}

function loadMarketplacePluginCatalog(marketplaces, installedPlugins) {
  const installedIds = new Set();
  const installedScopesById = new Map();
  for (const plugin of installedPlugins || []) {
    const identityKeys = [
      plugin.id,
      plugin.name,
      plugin.name && plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : "",
    ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
    const scope = String(plugin.scope || "").trim().toLowerCase();
    for (const key of identityKeys) {
      installedIds.add(key);
      if (!["user", "project", "local"].includes(scope)) continue;
      const scopes = installedScopesById.get(key) || new Set();
      scopes.add(scope);
      installedScopesById.set(key, scopes);
    }
  }
  const installedState = { ids: installedIds, scopesById: installedScopesById };
  const catalog = [];
  const seenCatalogIds = new Set();
  function addCatalogItem(plugin, manifest, marketplace, root) {
    const item = marketplacePluginCatalogItem(plugin, manifest, marketplace, root, installedState);
    if (!item?.id || seenCatalogIds.has(item.id.toLowerCase())) return false;
    seenCatalogIds.add(item.id.toLowerCase());
    catalog.push(item);
    return catalog.length >= 240;
  }
  for (const marketplace of marketplaces || []) {
    const roots = marketplaceManifestRootCandidates(marketplace);
    const { manifest, root } = readMarketplaceManifest(marketplace);
    const plugins = Array.isArray(manifest?.plugins) ? manifest.plugins : [];
    for (const plugin of plugins) {
      if (addCatalogItem(plugin, manifest, marketplace, root)) return catalog;
    }
    for (const candidateRoot of roots) {
      for (const pluginManifest of readMarketplacePluginManifests(candidateRoot)) {
        if (addCatalogItem(pluginManifest.plugin, pluginManifest.plugin, marketplace, pluginManifest.root)) return catalog;
      }
    }
  }
  return catalog;
}

function normalizeSkillId(value, fallback) {
  const text = String(value || fallback || "skill")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || "skill";
}

function parseYamlScalar(value) {
  const text = String(value || "").trim();
  return text.replace(/^["']|["']$/g, "");
}

function parseSkillFrontmatter(content) {
  const text = String(content || "").replace(/^\uFEFF/, "");
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  const stack = [{ indent: -1, target: result }];
  for (const rawLine of match[1].split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const lineMatch = rawLine.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!lineMatch) continue;
    const indent = lineMatch[1].length;
    const key = lineMatch[2];
    const rawValue = lineMatch[3];
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].target;
    if (rawValue.trim() === "") {
      parent[key] = parent[key] && typeof parent[key] === "object" ? parent[key] : {};
      stack.push({ indent, target: parent[key] });
      continue;
    }
    parent[key] = parseYamlScalar(rawValue);
  }
  return result;
}

function firstMarkdownParagraph(content) {
  const body = String(content || "").replace(/^---\s*\r?\n[\s\S]*?\r?\n---/, "");
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const text = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"))
      .join(" ")
      .trim();
    if (text) return text.slice(0, 240);
  }
  return "";
}

function skillRootsForScan(cwd) {
  const envRoots = String(process.env.CLAUDEX_SKILL_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  const roots = envRoots.length
    ? envRoots
    : [
      path.join(app.getPath("home"), ".codex", "skills"),
      path.join(app.getPath("home"), ".codex", "plugins", "cache"),
      cwd ? path.join(cwd, ".codex", "skills") : "",
      cwd ? path.join(cwd, ".agents", "skills") : "",
    ].filter(Boolean);
  const seen = new Set();
  return roots
    .map((root) => path.resolve(root))
    .filter((root) => {
      const key = root.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return fs.existsSync(root);
    });
}

function findSkillFiles(root) {
  const files = [];
  const queue = [{ dir: root, depth: 0 }];
  const ignored = new Set([".git", "node_modules", "dist", "build", "release", ".next", "coverage"]);
  while (queue.length && files.length < MAX_SKILL_REGISTRY_ITEMS) {
    const { dir, depth } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(fullPath);
        if (files.length >= MAX_SKILL_REGISTRY_ITEMS) break;
        continue;
      }
      if (!entry.isDirectory()) continue;
      if (ignored.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".system") continue;
      if (depth + 1 <= MAX_SKILL_SCAN_DEPTH) queue.push({ dir: fullPath, depth: depth + 1 });
    }
  }
  return files;
}

function loadSkillRegistry(cwd) {
  const roots = skillRootsForScan(cwd);
  const items = [];
  const seenPaths = new Set();
  for (const root of roots) {
    for (const file of findSkillFiles(root)) {
      const pathKey = file.toLowerCase();
      if (seenPaths.has(pathKey)) continue;
      seenPaths.add(pathKey);
      let stat = null;
      let content = "";
      try {
        stat = fs.statSync(file);
        content = fs.readFileSync(file, "utf8").slice(0, MAX_SKILL_FILE_BYTES);
      } catch {
        continue;
      }
      const meta = parseSkillFrontmatter(content);
      const metadata = meta.metadata && typeof meta.metadata === "object" ? meta.metadata : {};
      const name = String(meta.name || metadata.name || path.basename(path.dirname(file))).trim();
      const description = String(
        meta.description ||
        metadata["short-description"] ||
        metadata.shortDescription ||
        meta["short-description"] ||
        firstMarkdownParagraph(content) ||
        "本地 SKILL.md",
      ).trim();
      const relativePath = path.relative(root, file);
      items.push({
        id: normalizeSkillId(name, relativePath),
        name,
        description,
        path: file,
        root,
        relativePath,
        source: "local-skill",
        status: "installed",
        enabled: true,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
      if (items.length >= MAX_SKILL_REGISTRY_ITEMS) break;
    }
    if (items.length >= MAX_SKILL_REGISTRY_ITEMS) break;
  }
  items.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  return {
    roots,
    items,
    truncated: items.length >= MAX_SKILL_REGISTRY_ITEMS,
  };
}

function mcpOutputSegments(value) {
  return String(value || "")
    .split(/\s*(?:·|\|)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseMcpTools(segments) {
  const segment = segments.find((item) => /\b\d+\s*(?:tools?|工具)/i.test(item));
  const match = segment?.match(/\b(\d+)\s*(?:tools?|工具)/i);
  return match ? Number(match[1]) : null;
}

function structuredToolLabels(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return String(item).trim();
        if (!item || typeof item !== "object") return "";
        return String(item.name || item.id || item.tool || item.command || item.title || "").trim();
      })
      .filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, itemValue]) => itemValue !== false && itemValue !== null && itemValue !== undefined && itemValue !== "")
      .map(([key, itemValue]) => {
        if (itemValue === true) return key;
        if (itemValue && typeof itemValue === "object") {
          return String(itemValue.name || itemValue.id || itemValue.tool || itemValue.command || key).trim();
        }
        return key;
      })
      .filter(Boolean);
  }
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarizeToolSchema(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value
    .map((item) => summarizeToolSchema(item))
    .filter(Boolean)
    .join(", ");
  if (typeof value !== "object") return String(value || "").trim();
  const properties = value.properties && typeof value.properties === "object"
    ? Object.keys(value.properties)
    : [];
  const required = Array.isArray(value.required) ? value.required : [];
  const type = String(value.type || "").trim();
  const parts = [
    type,
    properties.length ? `properties:${properties.join(",")}` : "",
    required.length ? `required:${required.join(",")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : summarizeStructuredList(value, " · ");
}

function structuredToolDetails(value) {
  const details = [];
  function pushTool(item, fallbackName = "") {
    if (item === false || item === null || item === undefined || item === "") return;
    if (typeof item === "string" || typeof item === "number") {
      const text = String(item).trim();
      const name = String(fallbackName || text).trim();
      if (name) details.push({ name, description: fallbackName ? text : "", schema: "" });
      return;
    }
    if (typeof item !== "object") return;
    const name = String(item.name || item.id || item.tool || item.command || item.title || fallbackName || "").trim();
    if (!name) return;
    const description = String(item.description || item.summary || item.detail || "").trim();
    const schema = summarizeToolSchema(item.inputSchema || item.input_schema || item.schema || item.parameters || item.args || item.arguments);
    details.push({ name, description, schema });
  }
  if (Array.isArray(value)) {
    value.forEach((item) => pushTool(item));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, itemValue]) => {
      if (itemValue === true) pushTool(key);
      else pushTool(itemValue, key);
    });
  } else {
    String(value || "")
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => pushTool(item));
  }
  const seen = new Set();
  return details.filter((tool) => {
    const key = tool.name.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function structuredToolCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    return Object.values(value).filter((itemValue) => itemValue !== false && itemValue !== null && itemValue !== undefined && itemValue !== "").length;
  }
  return null;
}

function normalizeMcpStatusValue(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "unknown";
  if (/\b(?:ok|ready|connected|enabled|running|active|success|succeeded)\b/.test(text)) return "ok";
  if (/\b(?:error|failed|failure|disconnected|unavailable|denied|missing|timeout)\b/.test(text)) return "error";
  if (/\b(?:pending|starting|waiting|paused)\b/.test(text)) return "pending";
  return "unknown";
}

function normalizeMcpScopeValue(value) {
  const scope = String(value || "").trim().toLowerCase();
  return ["local", "user", "project"].includes(scope) ? scope : "";
}

function parseMcpScope(segments) {
  const text = (segments || []).map((item) => String(item || "")).join(" | ");
  const match = text.match(/(?:^|[|\s([])scope\s*[:=]?\s*(local|user|project)(?:$|[|\s)\]])/i)
    || text.match(/(?:^|[|\s([])(local|user|project)\s+scope(?:$|[|\s)\]])/i);
  return String(match?.[1] || "").trim().toLowerCase();
}

function parseMcpGetScope(rawOutput) {
  const text = stripAnsi(rawOutput);
  const scopeLine = text.match(/^\s*Scope:\s*([^\r\n]+)$/im)?.[1] || "";
  const scope = normalizeMcpScopeValue(scopeLine.match(/\b(local|user|project)\b/i)?.[1]);
  if (scope) return scope;
  const removeHint = text.match(/\bmcp\s+remove\b[^\r\n]*(?:--scope|-s)\s+(local|user|project)\b/i);
  return normalizeMcpScopeValue(removeHint?.[1]);
}

async function hydrateMcpServerScopes(claudeCommand, cwd, servers) {
  const rows = Array.isArray(servers) ? servers : [];
  const unresolved = rows.filter((server) => (
    server?.name && !normalizeMcpScopeValue(server.scope)
  ));
  if (!unresolved.length) return rows;

  const scopeByName = new Map();
  for (let index = 0; index < unresolved.length; index += 4) {
    const batch = unresolved.slice(index, index + 4);
    const results = await Promise.all(batch.map(async (server) => ({
      name: String(server.name || "").trim(),
      result: await runClaudeCommand(claudeCommand, ["mcp", "get", String(server.name || "").trim()], { cwd, timeoutMs: 30000 }),
    })));
    for (const { name, result } of results) {
      const scope = result?.code === 0
        ? parseMcpGetScope([result?.stdout, result?.stderr].filter(Boolean).join("\n"))
        : "";
      if (name && scope) scopeByName.set(name.toLowerCase(), scope);
    }
  }

  return rows.map((server) => {
    const existingScope = normalizeMcpScopeValue(server?.scope);
    const hydratedScope = scopeByName.get(String(server?.name || "").trim().toLowerCase()) || "";
    return existingScope || hydratedScope
      ? { ...server, scope: existingScope || hydratedScope }
      : server;
  });
}

function parseMcpSource(segments) {
  const segment = segments.find((item) => (
    /https?:\/\/|wss?:\/\//i.test(item) ||
    /^[A-Za-z]:[\\/]/.test(item) ||
    /^[/~]/.test(item) ||
    /\.(?:c?js|mjs|py|ts|json)\b/i.test(item) ||
    /\b(?:npx|node|python|python3|uvx|docker)\b/i.test(item)
  ));
  return segment || "";
}

function parseMcpTransport(segments, source) {
  const explicit = segments.find((item) => /^(?:stdio|sse|http|https|websocket|ws|wss|tcp|ipc)$/i.test(item));
  if (explicit) return explicit.toLowerCase();
  const sourceText = String(source || "").toLowerCase();
  if (/^wss?:\/\//.test(sourceText)) return "ws";
  if (/\/sse\b|transport=sse/.test(sourceText)) return "sse";
  if (/^https?:\/\//.test(sourceText)) return "http";
  if (sourceText) return "stdio";
  return "";
}

function parseMcpError(segments, status, source) {
  if (status !== "error") return "";
  const sourceText = String(source || "");
  const segment = segments.find((item) => (
    item !== sourceText &&
    !/\b\d+\s*(?:tools?|工具)/i.test(item) &&
    !/^(?:stdio|sse|http|https|websocket|ws|wss|tcp|ipc)$/i.test(item) &&
    /\b(?:disconnected|not connected|failed|failure|error|unavailable|denied|missing|timeout|timed out|auth|token)\b/i.test(item)
  ));
  return String(segment || "")
    .replace(/^(?:error|failed|failure|disconnected|not connected)[:\s-]*/i, "")
    .trim();
}

function parseMcpServers(rawOutput) {
  const text = stripAnsi(rawOutput).trim();
  if (!text || /no mcp servers configured/i.test(text)) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^checking|^name\s+/i.test(line))
    .map((line) => {
      const clean = line.replace(/^(?:[✓✔✗✘×!⏸\-\*]|â\S+|Ã\S+)\s*/, "").trim();
      const pair = clean.match(/^([^:\s]+)\s*[:\s]\s*(.*)$/);
      const name = pair?.[1] || clean.split(/\s+/)[0] || clean;
      const detail = pair?.[2] || clean.replace(name, "").trim();
      const lower = line.toLowerCase();
      const status = /\b(pending|paused|waiting)\b|⏸/.test(lower)
        ? "pending"
        : /\b(disconnected|not connected|failed|failure|error|unavailable|denied|timeout|timed out)\b|[✗✘×!]/.test(lower)
          ? "error"
          : /\b(connected|ok|running|enabled)\b|[✓✔]/.test(lower)
            ? "ok"
            : "unknown";
      const segments = mcpOutputSegments(detail);
      const tools = parseMcpTools(segments);
      const source = parseMcpSource(segments);
      const transport = parseMcpTransport(segments, source);
      const error = parseMcpError(segments, status, source);
      const scope = parseMcpScope([detail, line]);
      return { name, detail, status, raw: line, tools, transport, source, error, scope };
    })
    .filter((item) => item.name);
}

function normalizeMcpServers(jsonOutput, rawOutput) {
  const rawServers = parseMcpServers(rawOutput);
  const jsonItems = parseJsonListOutput(jsonOutput, ["mcpServers", "servers"]);
  if (!jsonItems.length) return rawServers;
  const rawByName = new Map(rawServers.map((server) => [String(server.name || "").toLowerCase(), server]));
  const seen = new Set();
  const normalized = jsonItems
    .map((item) => {
      const name = String(item?.name || item?.id || item?.server || item?.label || "").trim();
      if (!name) return null;
      const rawMatch = rawByName.get(name.toLowerCase()) || {};
      seen.add(name.toLowerCase());
      const toolSource = item?.toolNames || item?.tools || item?.availableTools || item?.capabilities || item?.commands;
      const toolNames = structuredToolLabels(toolSource);
      const toolDetails = structuredToolDetails(toolSource);
      const explicitToolCount = Number(item?.toolCount ?? item?.toolsCount ?? item?.tool_count);
      const tools = Number.isFinite(explicitToolCount)
        ? explicitToolCount
        : structuredToolCount(toolSource) ?? (typeof rawMatch.tools === "number" ? rawMatch.tools : null);
      const status = normalizeMcpStatusValue(item?.status || item?.state || item?.connection || item?.connected || rawMatch.status);
      const source = String(item?.source || item?.path || item?.command || item?.url || item?.endpoint || rawMatch.source || "").trim();
      const transport = String(item?.transport || item?.type || rawMatch.transport || parseMcpTransport([source], source) || "").trim();
      const detail = String(item?.detail || item?.description || item?.summary || rawMatch.detail || "").trim();
      const error = pluginErrorSummary(item) || rawMatch.error || "";
      const scope = String(item?.scope || item?.configScope || item?.configurationScope || rawMatch.scope || "").trim().toLowerCase();
      return {
        name,
        detail,
        status,
        raw: rawMatch.raw || JSON.stringify(item),
        tools,
        toolNames,
        toolDetails,
        toolsSummary: toolNames.join(", "),
        transport,
        source,
        error,
        scope,
      };
    })
    .filter(Boolean);
  for (const rawServer of rawServers) {
    const key = String(rawServer.name || "").toLowerCase();
    if (key && !seen.has(key)) normalized.push(rawServer);
  }
  return normalized;
}

function splitArgs(value) {
  const args = [];
  let current = "";
  let quote = "";
  let escaping = false;
  for (const char of String(value || "")) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}

function normalizeCustomMarketplaceUrl(value) {
  const source = String(value || "").trim();
  if (!source || source.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(source)) return "";
  try {
    const parsed = new URL(source);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (!parsed.hostname || parsed.username || parsed.password) return "";
    return parsed.href.length <= 2048 ? parsed.href : "";
  } catch (_error) {
    return "";
  }
}

function normalizeMarketplaceCliName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 240 || name.startsWith("-") || /[\s\u0000-\u001f\u007f]/.test(name)) return "";
  return name;
}

function isIgnoredWorkspaceDir(name) {
  return IGNORED_DIRS.has(name) || IGNORED_DIR_PATTERNS.some((pattern) => pattern.test(name));
}

function posixShellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function shellCommandForPlatform(command) {
  const raw = String(command || "").trim();
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", raw],
    };
  }
  return {
    command: process.platform === "darwin" ? "/bin/zsh" : "/bin/bash",
    args: ["-lc", raw],
  };
}

function openExternalTerminal(cwd, command = "") {
  const raw = String(command || "").trim();
  if (process.platform === "win32") {
    const args = raw ? ["/K", raw] : ["/K"];
    return spawn(process.env.ComSpec || "cmd.exe", args, {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
  }

  if (process.platform === "darwin") {
    const scriptCommand = raw ? `cd ${posixShellQuote(cwd)}; ${raw}` : `cd ${posixShellQuote(cwd)}`;
    return spawn("osascript", [
      "-e",
      `tell application "Terminal" to do script ${JSON.stringify(scriptCommand)}`,
      "-e",
      `tell application "Terminal" to activate`,
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
  }

  const scriptCommand = raw ? `cd ${posixShellQuote(cwd)}; ${raw}; exec bash` : `cd ${posixShellQuote(cwd)}; exec bash`;
  return spawn("x-terminal-emulator", ["-e", "bash", "-lc", scriptCommand], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
}

function commandCandidates(command) {
  const raw = String(command || "").trim() || "claude";
  if (path.isAbsolute(raw) || raw.includes("\\") || raw.includes("/")) return [raw];
  const pathExts = process.platform === "win32" ? [".exe", ".com", ".cmd", ".bat"] : [""];
  const paths = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const names = path.extname(raw) ? [raw] : pathExts.map((ext) => `${raw}${ext}`);
  const directClaudeBins = [];
  const found = [];
  for (const folder of paths) {
    if (raw === "claude") {
      const directBin = path.join(
        folder,
        "node_modules",
        "@anthropic-ai",
        "claude-code",
        "bin",
        process.platform === "win32" ? "claude.exe" : "claude",
      );
      if (fs.existsSync(directBin)) directClaudeBins.push(directBin);
    }
    for (const name of names) {
      const candidate = path.join(folder, name);
      if (fs.existsSync(candidate)) found.push(candidate);
    }
  }
  return [...new Set([...directClaudeBins, ...found, raw])];
}

function existingCommandCandidate(command) {
  return commandCandidates(command).find((candidate) => candidate !== command && fs.existsSync(candidate)) || "";
}

function ideOptions() {
  const candidates = [
    { id: "vscode", label: "VS Code", command: "code" },
    { id: "cursor", label: "Cursor", command: "cursor" },
    { id: "windsurf", label: "Windsurf", command: "windsurf" },
  ];
  return candidates
    .map((item) => ({ ...item, executable: existingCommandCandidate(item.command) }))
    .filter((item) => item.executable);
}

function parseGitBranchStatus(firstLine) {
  const first = String(firstLine || "");
  if (!first.startsWith("## ")) {
    return { branch: "", upstream: "", remote: "", ahead: 0, behind: 0, upstreamStatus: "" };
  }
  const raw = first.slice(3).trim();
  const statusMatch = raw.match(/\s+\[([^\]]+)\]$/);
  const upstreamStatus = statusMatch?.[1] || "";
  const head = statusMatch ? raw.slice(0, statusMatch.index).trim() : raw;
  const [branchPart, upstreamPart = ""] = head.split("...");
  const branch = branchPart.replace(/^No commits yet on\s+/, "").trim();
  const upstream = upstreamPart.trim();
  const remote = upstream.includes("/") ? upstream.split("/")[0] : "";
  const ahead = Number((upstreamStatus.match(/ahead\s+(\d+)/i) || [])[1] || 0);
  const behind = Number((upstreamStatus.match(/behind\s+(\d+)/i) || [])[1] || 0);
  return { branch, upstream, remote, ahead, behind, upstreamStatus };
}

function parseGitEnvironment(result) {
  const output = stripAnsi(`${result.stdout || ""}\n${result.stderr || ""}`).trim();
  if (result.code !== 0) {
    return {
      available: false,
      branch: "",
      upstream: "",
      remote: "",
      ahead: 0,
      behind: 0,
      upstreamStatus: "",
      changes: 0,
      files: [],
      summary: gitStatusSummary([]),
      raw: output,
    };
  }
  const lines = output.split(/\r?\n/).filter(Boolean);
  const first = lines[0] || "";
  const branchStatus = parseGitBranchStatus(first);
  const files = parseGitStatusFiles(lines.filter((line) => !line.startsWith("## ")));
  const changes = files.length;
  return {
    available: result.code === 0,
    ...branchStatus,
    changes,
    files,
    summary: gitStatusSummary(files),
    raw: output,
  };
}

function parseGitStatusFiles(lines) {
  return lines.map((line) => {
    const code = line.slice(0, 2);
    const pathPart = line.slice(3).trim();
    const [from, to] = pathPart.split(/\s+->\s+/);
    const isUntracked = code === "??";
    const conflict = /U|AA|DD/.test(code);
    const staged = !conflict && Boolean(code[0] && code[0] !== " " && code[0] !== "?");
    const unstaged = !conflict && Boolean(code[1] && code[1] !== " " && code[1] !== "?");
    const renamed = /R/.test(code) || Boolean(to);
    const deleted = /D/.test(code);
    const kind = conflict
      ? "conflict"
      : isUntracked
        ? "untracked"
        : renamed
          ? "renamed"
          : deleted
            ? "deleted"
            : staged && unstaged
              ? "mixed"
              : staged
                ? "staged"
                : unstaged
                  ? "unstaged"
                  : "changed";
    return {
      status: code.trim() || code,
      staged,
      unstaged,
      untracked: isUntracked,
      conflict,
      kind,
      path: to || from || pathPart,
      previousPath: to ? from : "",
    };
  }).filter((item) => item.path);
}

function gitStatusSummary(files = []) {
  const nonConflicted = files.filter((file) => !file.conflict);
  return {
    total: files.length,
    staged: nonConflicted.filter((file) => file.staged).length,
    unstaged: nonConflicted.filter((file) => file.unstaged).length,
    untracked: nonConflicted.filter((file) => file.untracked).length,
    mixed: nonConflicted.filter((file) => file.kind === "mixed").length,
    renamed: nonConflicted.filter((file) => /R/.test(file.status || "") || file.previousPath).length,
    deleted: nonConflicted.filter((file) => /D/.test(file.status || "")).length,
    conflicted: files.filter((file) => file.conflict).length,
  };
}

function gitText(result) {
  return stripAnsi(result.stdout || result.stderr).trim();
}

function parseGitRemotes(result) {
  const output = gitText(result);
  const byName = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
    if (!match) continue;
    const [, name, url, kind] = match;
    const existing = byName.get(name) || { name, fetchUrl: "", pushUrl: "" };
    if (kind === "fetch") existing.fetchUrl = url;
    if (kind === "push") existing.pushUrl = url;
    byName.set(name, existing);
  }
  return [...byName.values()];
}

function parseDiffGitPath(value) {
  const raw = String(value || "").trim().replace(/^"|"$/g, "");
  return raw.replace(/^[ab]\//, "");
}

function parseGitDiffFileHeader(line) {
  const value = String(line || "");
  const combinedMatch = /^diff --(?:cc|combined)\s+(.+)$/.exec(value);
  if (combinedMatch) {
    const filePath = parseDiffGitPath(combinedMatch[1]);
    return {
      path: filePath,
      previousPath: "",
    };
  }
  const match = /^diff --git\s+(.+?)\s+(.+)$/.exec(value);
  if (!match) return null;
  const previousPath = parseDiffGitPath(match[1]);
  const nextPath = parseDiffGitPath(match[2]);
  return {
    path: nextPath || previousPath,
    previousPath: previousPath !== nextPath ? previousPath : "",
  };
}

function parseGitDiffFiles(diffText) {
  const lines = String(diffText || "").split(/\r?\n/);
  const files = [];
  let section = "";
  let current = null;
  const finish = () => {
    if (!current) return;
    const text = current.lines.join("\n").trim();
    if (!text) {
      current = null;
      return;
    }
    const diffLines = current.lines.filter((line) => !line.startsWith("+++ ") && !line.startsWith("--- "));
    files.push({
      id: `${current.section || "diff"}:${current.path}:${files.length}`,
      section: current.section,
      path: current.path,
      previousPath: current.previousPath,
      additions: diffLines.filter((line) => line.startsWith("+")).length,
      deletions: diffLines.filter((line) => line.startsWith("-")).length,
      text,
    });
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith("# ")) {
      section = line.slice(2).trim();
      continue;
    }
    const header = parseGitDiffFileHeader(line);
    if (header) {
      finish();
      current = {
        ...header,
        section,
        lines: section ? [`# ${section}`, line] : [line],
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  finish();
  return files.slice(0, 80);
}

function resolveGitStatusPath(cwd, relativePath = "") {
  const root = path.resolve(cwd);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return target;
}

function buildUntrackedFileDiffs(cwd, files = [], maxChars = MAX_GIT_DIFF_CHARS) {
  const sections = [];
  const stats = [];
  let usedChars = 0;
  for (const item of files.filter((file) => file.status === "??").slice(0, 24)) {
    const relativePath = slashPath(item.path || "");
    const target = resolveGitStatusPath(cwd, relativePath);
    if (!target || !fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    if (!stat.isFile()) continue;
    const header = [
      `diff --git a/${relativePath} b/${relativePath}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${relativePath}`,
    ];
    let body = [];
    let additions = 0;
    let previewNote = "";
    if (stat.size > 65536) {
      previewNote = `# Untracked file is ${stat.size} bytes; preview skipped.`;
    } else {
      const buffer = fs.readFileSync(target);
      if (buffer.includes(0)) {
        previewNote = "# Binary file preview skipped.";
      } else {
        const lines = buffer.toString("utf8").split(/\r?\n/);
        if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
        additions = lines.length > 1 || lines[0] ? lines.length : 0;
        body = [
          `@@ -0,0 +1,${Math.max(additions, 1)} @@`,
          ...lines.map((line) => `+${line}`),
        ];
      }
    }
    if (previewNote) body = [previewNote];
    const text = [...header, ...body].join("\n");
    if (usedChars + text.length > maxChars) break;
    usedChars += text.length;
    sections.push(text);
    stats.push(`${relativePath} | ${additions || 0} ${additions ? "+".repeat(Math.min(additions, 40)) : ""}`);
  }
  return {
    stat: stats.join("\n"),
    text: sections.join("\n\n"),
  };
}

async function loadGitEnvironment(cwd) {
  const rootResult = await runProcess("git", ["rev-parse", "--show-toplevel"], { cwd, timeoutMs: 8000 });
  const gitRootRaw = rootResult.code === 0 ? gitText(rootResult).split(/\r?\n/)[0] || "" : "";
  const gitRoot = gitRootRaw ? path.resolve(gitRootRaw) : "";
  const gitCwd = gitRoot || cwd;
  const status = parseGitEnvironment(await runProcess("git", ["status", "--short", "--branch"], { cwd: gitCwd, timeoutMs: 8000 }));
  if (!status.available) {
    return {
      ...status,
      root: gitRoot,
      cwd,
      relativePath: gitRoot ? slashPath(path.relative(gitRoot, cwd)) || "." : "",
    };
  }
  const [remoteResult, worktreeStat, stagedStat, worktreeDiff, stagedDiff] = await Promise.all([
    runProcess("git", ["remote", "-v"], { cwd: gitCwd, timeoutMs: 8000 }),
    runProcess("git", ["diff", "--stat", "--no-ext-diff"], { cwd: gitCwd, timeoutMs: 8000 }),
    runProcess("git", ["diff", "--cached", "--stat", "--no-ext-diff"], { cwd: gitCwd, timeoutMs: 8000 }),
    runProcess("git", ["diff", "--no-ext-diff", "--find-renames", "--unified=3", "--"], {
      cwd: gitCwd,
      timeoutMs: 10000,
      maxOutputChars: MAX_GIT_DIFF_CHARS,
    }),
    runProcess("git", ["diff", "--cached", "--no-ext-diff", "--find-renames", "--unified=3", "--"], {
      cwd: gitCwd,
      timeoutMs: 10000,
      maxOutputChars: MAX_GIT_DIFF_CHARS,
    }),
  ]);
  const remotes = parseGitRemotes(remoteResult);
  const primaryRemote = status.remote
    ? remotes.find((remote) => remote.name === status.remote) || remotes[0]
    : remotes[0];
  const untrackedDiff = buildUntrackedFileDiffs(gitCwd, status.files);
  const statParts = [
    gitText(stagedStat),
    gitText(worktreeStat),
    untrackedDiff.stat,
  ].filter(Boolean);
  const diffSections = [
    { label: "Staged changes", text: gitText(stagedDiff) },
    { label: "Working tree changes", text: gitText(worktreeDiff) },
    { label: "Untracked files", text: untrackedDiff.text },
  ].filter((section) => section.text);
  const diffText = diffSections.map((section) => `# ${section.label}\n${section.text}`).join("\n\n");
  const fileDiffs = parseGitDiffFiles(diffText);
  const filesWithDiffStats = status.files.map((file) => {
    const diff = fileDiffs.find((item) => item.path === file.path || item.previousPath === file.path);
    return diff ? {
      ...file,
      additions: diff.additions,
      deletions: diff.deletions,
      hasDiff: true,
    } : file;
  });
  return {
    ...status,
    root: gitRoot,
    cwd,
    relativePath: gitRoot ? slashPath(path.relative(gitRoot, cwd)) || "." : "",
    remotes,
    remote: status.remote || primaryRemote?.name || "",
    remoteUrl: primaryRemote?.pushUrl || primaryRemote?.fetchUrl || "",
    files: filesWithDiffStats,
    stat: statParts.join("\n"),
    diff: {
      text: trimOutput(diffText, MAX_GIT_DIFF_CHARS),
      truncated: diffText.length > MAX_GIT_DIFF_CHARS || /\[输出已截断\]/.test(diffText),
      files: status.files.length,
      fileDiffs,
    },
  };
}

async function runClaudeCommand(command, args = [], options = {}) {
  let lastResult = null;
  const claudeOptions = {
    ...options,
    env: claudeProcessEnv(options.env),
  };
  for (const candidate of commandCandidates(command)) {
    const result = await runProcess(candidate, args, claudeOptions);
    lastResult = result;
    if (!(result.code === 1 && /ENOENT/i.test(result.stderr || ""))) return result;
  }
  return lastResult || { code: 1, stdout: "", stderr: "未找到 Claude 命令。", durationMs: 0 };
}

function configuredClaudeCommand(store = readStore()) {
  return String(store.settings?.claudeCode?.claudeCommand || "claude").trim() || "claude";
}

function claudeProcessEnv(extra = {}) {
  const env = { ...process.env, ...envBag(), ...(extra || {}) };
  if (env.ANTHROPIC_API_KEY) {
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
  }
  return env;
}

function readStore() {
  const file = dataPath();
  const legacyFile = legacyDataPath();
  if (!fs.existsSync(file) && fs.existsSync(legacyFile)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(legacyFile, file);
  }

  if (!fs.existsSync(file)) {
    const initial = defaultStore();
    writeStore(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return normalizeStore(parsed);
  } catch {
    const backup = `${file}.broken-${Date.now()}`;
    fs.copyFileSync(file, backup);
    const initial = defaultStore();
    writeStore(initial);
    return normalizeStore(initial);
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(dataPath()), { recursive: true });
  fs.writeFileSync(dataPath(), JSON.stringify(store, null, 2), "utf8");
}

function broadcastStoreUpdate(store) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
    try {
      win.webContents.send("app:state-updated", sanitizeStore(store, win.webContents.id));
    } catch (_error) {
      // A renderer can disappear between the lifecycle checks and send().
    }
  }
}

function encryptSecret(value) {
  if (!value) return undefined;
  if (safeStorage.isEncryptionAvailable()) {
    return {
      scheme: "safeStorage",
      value: safeStorage.encryptString(value).toString("base64"),
    };
  }
  return {
    scheme: "base64",
    value: Buffer.from(value, "utf8").toString("base64"),
  };
}

function decryptSecret(secret) {
  if (!secret?.value) return "";
  if (secret.scheme === "safeStorage") {
    return safeStorage.decryptString(Buffer.from(secret.value, "base64"));
  }
  if (secret.scheme === "base64") {
    return Buffer.from(secret.value, "base64").toString("utf8");
  }
  return "";
}

function activeChatRequestsForStore(store) {
  const chatEvents = new Map(
    (store.runEvents || [])
      .filter((event) => event?.type === "chat" && event?.id)
      .map((event) => [event.id, event]),
  );
  return Array.from(activeChatRequestIds, (requestId) => {
    const event = chatEvents.get(requestId);
    const runtime = activeChatRequestRuntime.get(requestId) || {};
    return {
      requestId,
      ownerWebContentsId: Number(runtime.ownerWebContentsId || 0),
      sessionId: String(runtime.sessionId || event?.sessionId || ""),
      status: cancelledChatRequestIds.has(requestId) ? "stopping" : "running",
      title: String(event?.title || ""),
      detail: String(event?.detail || ""),
      content: String(runtime.content || ""),
      streamStatus: String(runtime.streamStatus || ""),
      streamRevision: Number(runtime.streamRevision || 0),
      activities: Array.isArray(runtime.activities)
        ? runtime.activities.map((item) => ({ ...item })).slice(-8)
        : [],
      createdAt: isoOrEmpty(runtime.createdAt || event?.createdAt),
    };
  });
}

function sanitizeStore(store, runtimeRendererId = null) {
  const apiKeyState = Object.fromEntries(
    Object.entries(store.settings.apiKeys || {}).map(([provider, secret]) => [
      provider,
      Boolean(secret?.value),
    ]),
  );

  return {
    ...store,
    runtimeRendererId: Number(runtimeRendererId || 0),
    activeChatRequests: activeChatRequestsForStore(store),
    settings: {
      ...store.settings,
      apiKeys: apiKeyState,
      dataFile: dataPath(),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      appLocale: app.getLocale(),
      env: {
        anthropicKey: Boolean(envValue("ANTHROPIC_API_KEY") || envValue("ANTHROPIC_AUTH_TOKEN")),
        anthropicApiKey: Boolean(envValue("ANTHROPIC_API_KEY")),
        anthropicAuthToken: Boolean(envValue("ANTHROPIC_AUTH_TOKEN")),
        anthropicBaseUrl: envValue("ANTHROPIC_BASE_URL"),
        openaiKey: Boolean(envValue("OPENAI_API_KEY")),
        openaiBaseUrl: envValue("OPENAI_BASE_URL"),
        openrouterKey: Boolean(envValue("OPENROUTER_API_KEY")),
        deepseekKey: Boolean(envValue("DEEPSEEK_API_KEY")),
        minimaxKey: Boolean(envValue("MINIMAX_API_KEY")),
        mimoKey: Boolean(envValue("MIMO_API_KEY") || envValue("XIAOMI_MIMO_API_KEY")),
        envFileDirs: [process.cwd(), path.dirname(process.execPath)],
      },
    },
  };
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

function providerResponseError(message, code = "PROVIDER_RESPONSE_ERROR") {
  const error = new Error(message);
  error.code = code;
  error.preserveOnCancel = true;
  return error;
}

async function fetchWithTimeout(url, options, timeoutMs, requestId, consumeResponse) {
  assertActiveRequestIdAvailable(requestId);
  const controller = new AbortController();
  const durationMs = Number(timeoutMs || 600000);
  let timedOut = false;
  let response = null;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, durationMs);
  if (requestId) activeRequests.set(requestId, controller);
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await consumeResponse(response, controller.signal);
    return { response, payload };
  } catch (error) {
    if (response && !response.ok) {
      // Once failure headers arrive, preserve the provider error even if stopping interrupts its body.
      throw providerResponseError(`服务商返回 HTTP ${response.status}`, "PROVIDER_HTTP_ERROR");
    }
    if (timedOut) {
      throw providerResponseError(`模型请求超过 ${durationMs} 毫秒，已停止。`, "REQUEST_TIMEOUT");
    }
    if (isAbortError(error)) throw error;
    if (!isAbortError(error) && error && typeof error === "object") {
      error.preserveOnCancel = true;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (requestId && activeRequests.get(requestId) === controller) {
      activeRequests.delete(requestId);
    }
  }
}

function parseJsonText(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

async function readErrorResponse(response) {
  const text = await response.text();
  return { text, json: parseJsonText(text) };
}

async function consumeTextStream(response, consumer, isComplete) {
  if (!response.body?.getReader) {
    consumer.push(await response.text());
    return consumer.finish();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) consumer.push(decoder.decode(value, { stream: true }));
      if (isComplete?.()) {
        try {
          await reader.cancel("provider stream complete");
        } catch (_cancelError) {
          // The server may close at the same time as its terminal event.
        }
        break;
      }
    }
    const tail = decoder.decode();
    if (tail) consumer.push(tail);
    return consumer.finish();
  } catch (error) {
    try {
      await reader.cancel(error?.message || "stream failed");
    } catch (_cancelError) {
      // The transport may already be closed by abort or timeout.
    }
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch (_error) {
      // Ignore an already released reader.
    }
  }
}

function createSseJsonConsumer(onPayload) {
  let buffer = "";
  let rawText = "";
  let sawDataFrame = false;
  let sawDone = false;
  const processBlock = (block) => {
    const value = String(block || "").trim();
    if (!value) return;
    const dataLines = value
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length) {
      sawDataFrame = true;
      const data = dataLines.join("\n").trim();
      if (!data) return;
      if (data === "[DONE]") {
        sawDone = true;
        return;
      }
      if (sawDone) {
        throw providerResponseError("服务商在流式完成标记后继续返回了数据。");
      }
      const payload = parseJsonText(data);
      if (!payload) throw providerResponseError("服务商返回了无效的流式事件。");
      onPayload(payload);
    }
  };
  const drain = () => {
    while (true) {
      const separator = buffer.match(/\r?\n\r?\n/);
      if (!separator || separator.index === undefined) return;
      const block = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator[0].length);
      processBlock(block);
    }
  };
  return {
    push(text) {
      const next = String(text || "");
      rawText += next;
      buffer += next;
      drain();
    },
    finish() {
      drain();
      processBlock(buffer);
      buffer = "";
      if (!sawDataFrame) {
        const payload = parseJsonText(rawText.trim());
        if (!payload) throw providerResponseError("服务商返回了无效的 JSON 响应。");
        onPayload(payload);
      }
      return {
        framing: sawDataFrame ? "sse" : "json",
        sawDone,
      };
    },
    state() {
      return {
        framing: sawDataFrame ? "sse" : "json",
        sawDone,
      };
    },
  };
}

function createNdjsonConsumer(onPayload) {
  let buffer = "";
  let eventCount = 0;
  const processLine = (line) => {
    const value = String(line || "").trim();
    if (!value) return;
    const payload = parseJsonText(value);
    if (!payload) throw providerResponseError("Ollama 返回了无效的流式事件。");
    eventCount += 1;
    onPayload(payload);
  };
  return {
    push(text) {
      buffer += String(text || "");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    },
    finish() {
      processLine(buffer);
      buffer = "";
      return { eventCount };
    },
  };
}

function mergeProviderUsage(current, next) {
  if (!next || typeof next !== "object" || Array.isArray(next)) return current;
  const values = Object.fromEntries(
    Object.entries(next).filter(([, value]) => value !== undefined && value !== null),
  );
  return Object.keys(values).length ? { ...(current || {}), ...values } : current;
}

function isJsonContentType(response) {
  const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase();
  return contentType.includes("json") && !contentType.includes("ndjson");
}

function isOfficialOpenAiBaseUrl(baseUrl) {
  try {
    return new URL(String(baseUrl || "")).hostname.toLowerCase() === "api.openai.com";
  } catch {
    return false;
  }
}

function truncatedProviderStream(provider) {
  return providerResponseError(
    `${provider} 流式响应在完成标记前结束。`,
    "PROVIDER_STREAM_TRUNCATED",
  );
}

function textFromOpenAiContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => typeof part === "string" ? part : part?.text || part?.content || "")
    .join("");
}

function joinUrl(baseUrl, suffix) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}${suffix}`;
}

function isLocalBaseUrl(baseUrl) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(baseUrl || "");
}

function isOpenAiCompatibleProvider(provider) {
  return OPENAI_COMPATIBLE_PROVIDERS.has(provider || "openai-compatible");
}

function providerEnvKey(provider) {
  const keys = PROVIDER_ENV_KEYS[provider] || PROVIDER_ENV_KEYS["openai-compatible"];
  return keys.map((key) => envValue(key)).find(Boolean) || "";
}

function providerAuthHeaders(provider, apiKey) {
  if (!apiKey) return {};
  if (provider === "xiaomi-mimo") return { "api-key": apiKey };
  return { Authorization: `Bearer ${apiKey}` };
}

function requireKeyIfNeeded(provider, baseUrl, apiKey) {
  if (provider === "ollama") return;
  if (isOpenAiCompatibleProvider(provider) && isLocalBaseUrl(baseUrl)) return;
  if (!apiKey) {
    throw new Error("缺少 API 密钥。请打开设置，并为当前服务商保存密钥。");
  }
}

function normalizeMessages(store, session) {
  const systemPrompt = buildSystemPrompt(store, session);
  return [
    { role: "system", content: systemPrompt },
    ...session.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: message.content })),
  ];
}

function buildSystemPrompt(store, session) {
  const systemPrompt = store.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const project = store.activeProject || { name: session.project || "本地工作区", path: session.projectPath || "" };
  const enabledCapabilities = Object.entries({
    ...DEFAULT_CAPABILITIES,
    ...(store.settings.capabilities || {}),
  })
    .filter(([, enabled]) => enabled)
    .map(([key]) => CAPABILITY_CONTEXT[key])
    .filter(Boolean);
  const customMarketplaces = Array.isArray(store.settings.customMarketplaces)
    ? store.settings.customMarketplaces.filter(Boolean).slice(0, 12)
    : [];
  const claudexContext = [
    "Claudex 桌面端上下文：",
    `- 当前项目：${project.name || "本地工作区"}${project.path ? ` (${project.path})` : ""}`,
    enabledCapabilities.length ? "- 已启用能力：" : "",
    ...enabledCapabilities.map((item) => `  - ${item}`),
    customMarketplaces.length ? "- 自定义插件市场：" : "",
    ...customMarketplaces.map((item) => `  - ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
  return `${systemPrompt}\n\n${claudexContext}`;
}

function providerErrorFromPayload(result, fallback) {
  const payload = result?.json;
  const message = payload?.error?.message
    || (typeof payload?.error === "string" ? payload.error : "")
    || payload?.message
    || String(result?.text || "").trim();
  return message || fallback;
}

async function requestOpenAiCompatible(store, session, apiKey, requestId, sender) {
  const { provider, model, baseUrl, temperature } = store.settings;
  requireKeyIfNeeded(provider, baseUrl, apiKey);
  emitDirectApiStatus(sender, requestId, session, `正在连接 ${provider || "API"}`);
  let content = "";
  let usage = null;
  let finishReason = "";
  const { response, payload } = await fetchWithTimeout(joinUrl(baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...providerAuthHeaders(provider, apiKey),
    },
    body: JSON.stringify({
      model,
      messages: normalizeMessages(store, session),
      temperature: Number(temperature ?? 0.2),
      stream: true,
      ...(isOfficialOpenAiBaseUrl(baseUrl) ? { stream_options: { include_usage: true } } : {}),
    }),
  }, store.settings.timeoutMs, requestId, async (nextResponse) => {
    if (!nextResponse.ok) return { error: await readErrorResponse(nextResponse) };
    const consumer = createSseJsonConsumer((event) => {
      if (event?.error) {
        throw providerResponseError(event.error?.message || String(event.error));
      }
      const choice = event?.choices?.[0] || {};
      usage = mergeProviderUsage(usage, event?.usage);
      const previousFinishReason = finishReason;
      finishReason = String(choice?.finish_reason || finishReason || "");
      const delta = textFromOpenAiContent(choice?.delta?.content);
      const full = textFromOpenAiContent(choice?.message?.content);
      const text = delta || (!content ? full : "");
      if (previousFinishReason && text) {
        throw providerResponseError("服务商在 finish_reason 后继续返回了助手内容。");
      }
      if (!text) return;
      content += text;
      emitDirectApiDelta(sender, requestId, session, text);
    });
    const stream = await consumeTextStream(
      nextResponse,
      consumer,
      () => consumer.state().sawDone,
    );
    if (stream.framing === "sse" && !stream.sawDone && !finishReason) {
      throw truncatedProviderStream(provider || "OpenAI-compatible API");
    }
    return { content, usage, finishReason };
  });

  if (!response.ok) {
    throw providerResponseError(providerErrorFromPayload(payload?.error, `服务商返回 HTTP ${response.status}`));
  }
  content = payload?.content || content;
  if (!content) throw providerResponseError("服务商响应中没有助手内容。");
  return {
    text: content,
    ...(payload?.usage || usage ? { usage: payload?.usage || usage } : {}),
    ...(payload?.finishReason || finishReason ? { finishReason: payload?.finishReason || finishReason } : {}),
  };
}

async function requestAnthropic(store, session, apiKey, requestId, sender) {
  const { model, baseUrl, temperature } = store.settings;
  const bearerToken = apiKey ? "" : envValue("ANTHROPIC_AUTH_TOKEN");
  requireKeyIfNeeded("anthropic", baseUrl, apiKey || bearerToken);
  emitDirectApiStatus(sender, requestId, session, "正在连接 Anthropic");
  let text = "";
  let usage = null;
  let finishReason = "";
  let sawMessageStop = false;
  const { response, payload } = await fetchWithTimeout(joinUrl(baseUrl || "https://api.anthropic.com/v1", "/messages"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : { "x-api-key": apiKey }),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: Number(temperature ?? 0.2),
      stream: true,
      system: buildSystemPrompt(store, session),
      messages: session.messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({ role: message.role, content: message.content })),
    }),
  }, store.settings.timeoutMs, requestId, async (nextResponse) => {
    if (!nextResponse.ok) return { error: await readErrorResponse(nextResponse) };
    const consumer = createSseJsonConsumer((event) => {
      if (sawMessageStop) {
        throw providerResponseError("Anthropic 在 message_stop 后继续返回了数据。");
      }
      if (event?.type === "error" || event?.error) {
        throw providerResponseError(event?.error?.message || event?.message || "Anthropic 流式请求失败。");
      }
      usage = mergeProviderUsage(usage, event?.message?.usage);
      usage = mergeProviderUsage(usage, event?.usage);
      finishReason = String(event?.delta?.stop_reason || event?.stop_reason || event?.message?.stop_reason || finishReason || "");
      if (event?.type === "message_stop") {
        sawMessageStop = true;
        return;
      }
      let delta = event?.delta?.type === "text_delta" ? event.delta.text || "" : "";
      if (!delta && !text && Array.isArray(event?.content)) {
        delta = event.content
          .filter((part) => part?.type === "text")
          .map((part) => part.text || "")
          .join("\n");
      }
      if (!delta) return;
      text += delta;
      emitDirectApiDelta(sender, requestId, session, delta);
    });
    const stream = await consumeTextStream(nextResponse, consumer, () => sawMessageStop);
    if (stream.framing === "sse" && !sawMessageStop) {
      throw truncatedProviderStream("Anthropic");
    }
    return { text, usage, finishReason };
  });

  if (!response.ok) {
    throw providerResponseError(providerErrorFromPayload(payload?.error, `Anthropic 返回 HTTP ${response.status}`));
  }
  text = payload?.text || text;
  if (!text.trim()) throw providerResponseError("Anthropic 响应中没有文本内容。");
  return {
    text,
    ...(payload?.usage || usage ? { usage: payload?.usage || usage } : {}),
    ...(payload?.finishReason || finishReason ? { finishReason: payload?.finishReason || finishReason } : {}),
  };
}

async function requestOllama(store, session, requestId, sender) {
  const { model, baseUrl, temperature } = store.settings;
  emitDirectApiStatus(sender, requestId, session, "正在连接 Ollama");
  let content = "";
  let usage = null;
  let finishReason = "";
  let sawDone = false;
  const consumeEvent = (event) => {
    if (sawDone) {
      throw providerResponseError("Ollama 在 done:true 后继续返回了数据。");
    }
    if (event?.error) throw providerResponseError(String(event.error));
    const delta = String(event?.message?.content || "");
    if (delta) {
      content += delta;
      emitDirectApiDelta(sender, requestId, session, delta);
    }
    finishReason = String(event?.done_reason || finishReason || "");
    usage = mergeProviderUsage(usage, {
      prompt_eval_count: event?.prompt_eval_count,
      eval_count: event?.eval_count,
    });
    if (event?.done === true) {
      sawDone = true;
    }
  };
  const { response, payload } = await fetchWithTimeout(joinUrl(baseUrl || "http://localhost:11434", "/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      options: { temperature: Number(temperature ?? 0.2) },
      messages: normalizeMessages(store, session),
    }),
  }, store.settings.timeoutMs, requestId, async (nextResponse) => {
    if (!nextResponse.ok) return { error: await readErrorResponse(nextResponse) };
    if (isJsonContentType(nextResponse)) {
      const event = parseJsonText(await nextResponse.text());
      if (!event) throw providerResponseError("Ollama 返回了无效的 JSON 响应。");
      consumeEvent(event);
      if (event?.done === false) throw truncatedProviderStream("Ollama");
      return { content, usage, finishReason };
    }
    const consumer = createNdjsonConsumer(consumeEvent);
    await consumeTextStream(nextResponse, consumer, () => sawDone);
    if (!sawDone) throw truncatedProviderStream("Ollama");
    return { content, usage, finishReason };
  });

  if (!response.ok) {
    throw providerResponseError(providerErrorFromPayload(payload?.error, `Ollama 返回 HTTP ${response.status}`));
  }
  content = payload?.content || content;
  if (!content) throw providerResponseError("Ollama 响应中没有助手内容。");
  return {
    text: content,
    ...(payload?.usage || usage ? { usage: payload?.usage || usage } : {}),
    ...(payload?.finishReason || finishReason ? { finishReason: payload?.finishReason || finishReason } : {}),
  };
}

async function requestAssistant(store, session, requestId, sender) {
  if (store.settings.claudeCode?.executionMode !== "api") {
    return requestClaudeCode(store, session, requestId);
  }
  const provider = store.settings.provider;
  const apiKey =
    decryptSecret(store.settings.apiKeys?.[provider]) ||
    providerEnvKey(provider);
  if (provider === "anthropic") return requestAnthropic(store, session, apiKey, requestId, sender);
  if (provider === "ollama") return requestOllama(store, session, requestId, sender);
  return requestOpenAiCompatible(store, session, apiKey, requestId, sender);
}

function cleanOption(value) {
  return String(value ?? "").trim();
}

function splitLineValues(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pushOption(args, flag, value) {
  const next = cleanOption(value);
  if (next) args.push(flag, next);
}

function pushFlag(args, flag, enabled) {
  if (enabled) args.push(flag);
}

function pushRepeatable(args, flag, value) {
  for (const item of splitLineValues(value)) args.push(flag, item);
}

function pushVariadic(args, flag, value) {
  const items = splitLineValues(value);
  if (items.length) args.push(flag, ...items);
}

function appendClaudeCodeOptions(args, store, session, { stream = false } = {}) {
  const claudeCode = { ...CLAUDE_CODE_SETTINGS, ...(store.settings.claudeCode || {}) };
  pushOption(args, "--model", store.settings.model || "claude-sonnet-4-5-20250929");
  pushOption(args, "--permission-mode", claudeCode.permissionMode || "default");
  pushOption(args, "--append-system-prompt", buildSystemPrompt(store, session));
  pushOption(args, "--effort", claudeCode.effort);
  pushOption(args, "--agent", claudeCode.agent);
  pushOption(args, "--allowedTools", claudeCode.allowedTools);
  pushOption(args, "--disallowedTools", claudeCode.disallowedTools);
  pushOption(args, "--tools", claudeCode.tools);
  pushOption(args, "--fallback-model", claudeCode.fallbackModel);
  pushOption(args, "--max-budget-usd", claudeCode.maxBudgetUsd);
  pushOption(args, "--name", claudeCode.sessionName);
  pushOption(args, "--settings", claudeCode.settings);
  pushOption(args, "--setting-sources", claudeCode.settingSources);
  pushVariadic(args, "--add-dir", claudeCode.addDirs);
  pushVariadic(args, "--mcp-config", claudeCode.mcpConfig);
  pushRepeatable(args, "--plugin-dir", claudeCode.pluginDir);
  pushRepeatable(args, "--plugin-url", claudeCode.pluginUrl);
  pushFlag(args, "--strict-mcp-config", claudeCode.strictMcpConfig);
  pushFlag(args, "--safe-mode", claudeCode.safeMode);
  pushFlag(args, "--bare", claudeCode.bareMode);
  pushFlag(args, "--ide", claudeCode.ide);
  pushFlag(args, "--no-session-persistence", claudeCode.noSessionPersistence);
  pushFlag(args, "--ax-screen-reader", claudeCode.axScreenReader);
  if (claudeCode.chromeMode === "on") args.push("--chrome");
  if (claudeCode.chromeMode === "off") args.push("--no-chrome");
  if (claudeCode.verbose && !args.includes("--verbose")) args.push("--verbose");
  if (session.claudeSessionId) args.push("--resume", session.claudeSessionId);
  const extraArgs = splitArgs(claudeCode.extraArgs);
  if (extraArgs.length) args.push(...extraArgs);
  if (stream && !args.includes("--verbose")) args.push("--verbose");
  return claudeCode;
}

function buildClaudeChatArgs(store, session, { stream = false } = {}) {
  const args = [
    "-p",
    session.messages[session.messages.length - 1]?.content || "",
    "--output-format",
    stream ? "stream-json" : "json",
  ];
  if (stream) {
    args.push("--include-partial-messages", "--include-hook-events");
  }
  appendClaudeCodeOptions(args, store, session, { stream });
  return args;
}

async function requestClaudeCode(store, session, requestId) {
  const project = store.activeProject || { path: session.projectPath || "" };
  const cwd = project.path && fs.existsSync(project.path) ? project.path : app.getPath("home");
  const claudeCode = { ...CLAUDE_CODE_SETTINGS, ...(store.settings.claudeCode || {}) };
  const args = buildClaudeChatArgs(store, session);
  const result = await runClaudeCommand(claudeCode.claudeCommand || "claude", args, {
    cwd,
    requestId,
    timeoutMs: Number(store.settings.timeoutMs || CLAUDE_TIMEOUT_MS),
    env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
  });
  const payload = parseJsonOutput(result.stdout);
  if (result.code !== 0 || payload?.is_error) {
    const message = payload?.result || payload?.error || result.stderr || result.stdout || `Claude Code 已退出，代码 ${result.code}`;
    const error = new Error(stripAnsi(message));
    error.stdout = stripAnsi(result.stdout || "");
    error.stderr = stripAnsi(result.stderr || "");
    error.code = typeof result.code === "number" ? result.code : 1;
    throw error;
  }
  if (!payload?.result) {
    const error = new Error(stripAnsi(result.stdout || "Claude Code 没有返回结果。"));
    error.stdout = stripAnsi(result.stdout || "");
    error.stderr = stripAnsi(result.stderr || "");
    error.code = typeof result.code === "number" ? result.code : 1;
    throw error;
  }
  if (payload.session_id) {
    session.claudeSessionId = payload.session_id;
  }
  return {
    text: payload.result,
    stdout: stripAnsi(result.stdout || ""),
    stderr: stripAnsi(result.stderr || ""),
    code: typeof result.code === "number" ? result.code : 0,
    claudeSessionId: payload.session_id || "",
  };
}

function updateActiveChatRequestRuntime(requestId, update) {
  const current = activeChatRequestRuntime.get(requestId);
  if (!current) return null;
  const patch = typeof update === "function" ? update(current) : update;
  const next = {
    ...current,
    ...(patch || {}),
    streamRevision: Number(current.streamRevision || 0) + 1,
  };
  activeChatRequestRuntime.set(requestId, next);
  return next;
}

function activeChatStreamCheckpoint(requestId) {
  const runtime = activeChatRequestRuntime.get(requestId);
  if (!runtime) return {};
  return {
    content: String(runtime.content || ""),
    streamStatus: String(runtime.streamStatus || ""),
    streamRevision: Number(runtime.streamRevision || 0),
    activities: Array.isArray(runtime.activities)
      ? runtime.activities.map((item) => ({ ...item })).slice(-8)
      : [],
  };
}

function sendChatStreamEvent(sender, requestId, event) {
  if (!sender || sender.isDestroyed()) return;
  try {
    sender.send("chat:stream-event", {
      ...event,
      ...activeChatStreamCheckpoint(requestId),
    });
  } catch (_error) {
    // The request remains owned by main if its renderer reloads or closes.
  }
}

function emitDirectApiStatus(sender, requestId, session, text) {
  updateActiveChatRequestRuntime(requestId, { streamStatus: String(text || "") });
  sendChatStreamEvent(sender, requestId, {
    requestId,
    sessionId: session.id,
    type: "status",
    text: String(text || ""),
  });
}

function emitDirectApiDelta(sender, requestId, session, text) {
  const delta = String(text || "");
  if (!delta) return;
  updateActiveChatRequestRuntime(requestId, (current) => ({
    content: `${current.content || ""}${delta}`,
    streamStatus: "",
  }));
  sendChatStreamEvent(sender, requestId, {
    requestId,
    sessionId: session.id,
    type: "delta",
    text: delta,
  });
}

function appendActiveChatActivity(requestId, text) {
  const value = stripAnsi(String(text || "")).trim();
  if (!value) return;
  updateActiveChatRequestRuntime(requestId, (current) => ({
    activities: [
      ...(current.activities || []),
      { id: `${requestId}:activity:${Date.now()}:${(current.activities || []).length}`, text: value },
    ].slice(-8),
  }));
}

function emitClaudeStreamLine(sender, requestId, session, line) {
  const payload = parseJsonOutput(line);
  if (!payload) return;
  const base = { requestId, sessionId: session.id };
  const send = (event) => sendChatStreamEvent(sender, requestId, event);
  const emitActivity = (text, extra = {}) => {
    if (!text) return;
    appendActiveChatActivity(requestId, text);
    send({
      ...base,
      type: "activity",
      text: stripAnsi(String(text)),
      ...extra,
    });
  };
  if (payload.type === "system" && payload.subtype === "init") {
    if (payload.session_id) session.claudeSessionId = payload.session_id;
    updateActiveChatRequestRuntime(requestId, {
      streamStatus: `Claude Code ${payload.claude_code_version || ""}`.trim(),
    });
    send({
      ...base,
      type: "status",
      text: `Claude Code ${payload.claude_code_version || ""}`.trim(),
      claudeSessionId: payload.session_id,
    });
    emitActivity(`Claude Code ${payload.claude_code_version || ""}`.trim(), { claudeSessionId: payload.session_id });
    return;
  }
  if (payload.type === "system" && payload.subtype === "status") {
    updateActiveChatRequestRuntime(requestId, {
      streamStatus: payload.status || "\u6b63\u5728\u5904\u7406",
    });
    send({
      ...base,
      type: "status",
      text: payload.status || "正在处理",
    });
    emitActivity(payload.status || "正在处理");
    return;
  }
  if (payload.type === "system" && payload.subtype) {
    emitActivity(payload.subtype);
    return;
  }
  if (payload.type === "assistant" && Array.isArray(payload.message?.content)) {
    for (const block of payload.message.content) {
      if (block?.type === "tool_use") emitActivity(`正在使用 ${block.name || "工具"}`);
    }
    return;
  }
  if (payload.type === "stream_event" && payload.event?.type === "content_block_delta") {
    const delta = payload.event.delta;
    if (delta?.type === "text_delta" && delta.text) {
      updateActiveChatRequestRuntime(requestId, (current) => ({
        content: `${current.content || ""}${delta.text}`,
        streamStatus: "",
      }));
      send({
        ...base,
        type: "delta",
        text: delta.text,
      });
    }
    return;
  }
  if (payload.type === "stream_event" && payload.event?.type === "content_block_start") {
    const block = payload.event.content_block;
    if (block?.type === "tool_use") emitActivity(`正在使用 ${block.name || "工具"}`);
    return;
  }
  if (payload.type === "hook_event") {
    emitActivity(payload.hook_event_name || payload.name || "钩子事件");
    return;
  }
  if (payload.type === "tool_result") {
    emitActivity(payload.is_error ? "工具返回错误" : "工具已完成");
    return;
  }
  if (payload.type === "result") {
    send({
      ...base,
      type: payload.is_error ? "error" : "done",
      text: payload.result || "",
      claudeSessionId: payload.session_id,
      durationMs: payload.duration_ms,
    });
    emitActivity(payload.is_error ? "运行结束但有错误" : "运行已完成");
  }
}

async function requestClaudeCodeStream(store, session, requestId, sender) {
  const project = store.activeProject || { path: session.projectPath || "" };
  const cwd = project.path && fs.existsSync(project.path) ? project.path : app.getPath("home");
  const claudeCode = { ...CLAUDE_CODE_SETTINGS, ...(store.settings.claudeCode || {}) };
  const args = buildClaudeChatArgs(store, session, { stream: true });

  let finalPayload = null;
  const result = await runStreamingProcess(commandCandidates(claudeCode.claudeCommand || "claude")[0], args, {
    cwd,
    requestId,
    timeoutMs: Number(store.settings.timeoutMs || CLAUDE_TIMEOUT_MS),
    cancelAsCode130: true,
    env: claudeProcessEnv({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }),
    onLine: (line) => {
      const payload = parseJsonOutput(line);
      if (payload?.type === "result") finalPayload = payload;
      emitClaudeStreamLine(sender, requestId, session, line);
    },
  });
  const payload = finalPayload || parseJsonOutput(result.stdout);
  const hasCompletedResult = payload?.type === "result" && !payload?.is_error;
  if (payload?.is_error) {
    const message = payload?.result || payload?.error || result.stderr || `Claude Code exited with ${result.code}`;
    const error = new Error(stripAnsi(message));
    error.preserveOnCancel = true;
    throw error;
  }
  if (result.cancelled && !hasCompletedResult) return { cancelled: true };
  if (result.code !== 0 && !hasCompletedResult) {
    const message = payload?.result || payload?.error || result.stderr || `Claude Code exited with ${result.code}`;
    throw new Error(stripAnsi(message));
  }
  if (!payload?.result) {
    throw new Error(stripAnsi(result.stdout || "Claude Code 没有返回结果。"));
  }
  if (payload.session_id) {
    session.claudeSessionId = payload.session_id;
  }
  return {
    text: payload.result,
    permissionDenials: Array.isArray(payload.permission_denials) ? payload.permission_denials : [],
  };
}

function automationProjectFromPayload(store, payload = {}) {
  const candidatePath = String(payload.projectPath || "").trim();
  if (candidatePath && fs.existsSync(candidatePath)) return projectFromPath(candidatePath);
  const active = store.activeProject || localWorkspaceProject();
  return active?.path ? projectFromPath(active.path) : active;
}

function ensureAutomationSession(store, automation) {
  const existing = (store.sessions || []).find((session) => session.id === automation.threadId);
  const project = automation.project || store.activeProject || localWorkspaceProject();
  if (existing && sessionMatchesProject(existing, project)) return existing;
  const createdAt = now();
  const session = {
    id: id("session"),
    title: `自动化：${titleFromUserContent(automation.prompt)}`,
    project: project.name,
    projectPath: project.path,
    createdAt,
    updatedAt: createdAt,
    messages: [],
    pinned: false,
    archived: false,
  };
  store.sessions = [session, ...(store.sessions || [])];
  automation.threadId = session.id;
  return session;
}

function commitClaudeSessionIdIfCurrent(session, expectedSessionId, nextSessionId) {
  if (!session) return false;
  const expected = String(expectedSessionId || "");
  const next = String(nextSessionId || "");
  if (!next || String(session.claudeSessionId || "") !== expected) return false;
  session.claudeSessionId = next;
  return true;
}

function findAutomationOrThrow(store, automationId) {
  const automation = (store.automations || []).find((item) => item.id === automationId);
  if (!automation) throw new Error("没有找到这个自动化任务。");
  return automation;
}

function assertAutomationNotRunning(automationId) {
  if (!automationRunLocks.has(automationId) && !activeAutomationRuns.has(automationId)) return;
  const error = new Error("AUTOMATION_RUNNING: 请先停止正在运行的自动化任务。");
  error.code = "AUTOMATION_RUNNING";
  throw error;
}

function findAutomationRunEntry(store, runId) {
  const targetId = String(runId || "");
  if (!targetId) return null;
  for (const automation of store.automations || []) {
    const history = Array.isArray(automation.history) ? automation.history : [];
    const entry = history.find((item) => item?.id === targetId)
      || (automation.lastRun?.id === targetId ? automation.lastRun : null);
    if (entry) return { automation, entry };
  }
  return null;
}

function interruptedAutomationEntry(entry, endedAt) {
  const startedAt = isoOrEmpty(entry?.startedAt) || endedAt;
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  return {
    ...entry,
    status: "failed",
    startedAt,
    endedAt,
    durationMs: Number.isFinite(startedMs) && Number.isFinite(endedMs)
      ? Math.max(0, endedMs - startedMs)
      : Number(entry?.durationMs || 0),
    detail: AUTOMATION_INTERRUPTED_MESSAGE,
    error: AUTOMATION_INTERRUPTED_MESSAGE,
    summary: AUTOMATION_INTERRUPTED_MESSAGE,
    stderr: trimOutput([entry?.stderr || "", AUTOMATION_INTERRUPTED_MESSAGE].filter(Boolean).join("\n")),
    code: null,
  };
}

function recoverInterruptedAutomationRuns() {
  const store = readStore();
  const endedAt = now();
  const recoveredRunIds = new Set();
  let changed = false;

  for (const automation of store.automations || []) {
    const history = Array.isArray(automation.history) ? automation.history : [];
    const runningEntries = history.filter((entry) => entry?.status === "running");
    let currentRunningEntry = automation.lastRun?.status === "running"
      ? automation.lastRun
      : history[0]?.status === "running"
        ? history[0]
        : null;
    if (
      automation.lastRun?.status === "running" &&
      !runningEntries.some((entry) => entry.id === automation.lastRun.id)
    ) {
      runningEntries.push(automation.lastRun);
    }
    if (!currentRunningEntry && automation.status === "running") {
      const scheduledOnceWasDue = automation.enabled &&
        automation.schedule?.type === "once" &&
        automation.schedule?.runAt &&
        new Date(automation.schedule.runAt).getTime() <= Date.now();
      currentRunningEntry = {
        id: id("automation_run"),
        trigger: scheduledOnceWasDue ? "scheduled" : "manual",
        status: "running",
        startedAt: automation.updatedAt || automation.createdAt || endedAt,
        endedAt: "",
        durationMs: 0,
        sessionId: automation.threadId || "",
        detail: "",
        error: "",
        summary: "",
        stdout: "",
        stderr: "",
        code: null,
        artifacts: [],
      };
      runningEntries.push(currentRunningEntry);
    }
    if (!runningEntries.length) continue;

    const recoveredById = new Map(
      runningEntries.map((entry) => [entry.id, interruptedAutomationEntry(entry, endedAt)]),
    );
    const syntheticEntries = runningEntries.filter(
      (entry) => !history.some((historyEntry) => historyEntry.id === entry.id),
    );
    automation.history = [
      ...syntheticEntries.map((entry) => recoveredById.get(entry.id)),
      ...history.map((entry) => recoveredById.get(entry.id) || entry),
    ].slice(0, AUTOMATION_HISTORY_LIMIT);

    const recoveredLastRun = automation.lastRun?.id
      ? recoveredById.get(automation.lastRun.id)
      : null;
    const recoveredCurrentRun = currentRunningEntry?.id
      ? recoveredById.get(currentRunningEntry.id)
      : recoveredLastRun;
    if (recoveredCurrentRun) automation.lastRun = recoveredCurrentRun;

    for (const recoveredEntry of recoveredById.values()) {
      recoveredRunIds.add(recoveredEntry.id);
      upsertAutomationRunEvent(store, automation, recoveredEntry, "error");
      if (recoveredEntry.trigger === "scheduled" && automation.schedule?.type === "once") {
        automation.enabled = false;
      }
      const session = (store.sessions || []).find((item) => item.id === recoveredEntry.sessionId);
      if (session) {
        session.messages = Array.isArray(session.messages) ? session.messages : [];
        const hasTerminalMessage = session.messages.some((message) => (
          message?.automationRunId === recoveredEntry.id &&
          ["assistant", "cancelled", "error"].includes(message?.role)
        ));
        if (!hasTerminalMessage) {
          session.messages.push({
            role: "error",
            content: AUTOMATION_INTERRUPTED_MESSAGE,
            createdAt: endedAt,
            automationId: automation.id,
            automationRunId: recoveredEntry.id,
          });
          session.updatedAt = endedAt;
        }
      }
    }

    if (automation.status === "running" || recoveredLastRun) {
      automation.status = "failed";
      updateAutomationAfterMutation(automation);
    } else {
      automation.updatedAt = endedAt;
    }
    changed = true;
  }

  for (const event of [...(store.runEvents || [])]) {
    if (event?.type !== "automation" || event.status !== "running" || recoveredRunIds.has(event.id)) continue;
    const startedMs = new Date(event.createdAt || endedAt).getTime();
    upsertRunEvent(store, {
      ...event,
      status: "error",
      detail: [event.detail || "", AUTOMATION_INTERRUPTED_MESSAGE].filter(Boolean).join(" · "),
      code: null,
      durationMs: Number.isFinite(startedMs) ? Math.max(0, Date.now() - startedMs) : event.durationMs,
      stderr: trimOutput([event.stderr || "", AUTOMATION_INTERRUPTED_MESSAGE].filter(Boolean).join("\n")),
    });
    changed = true;
  }

  if (changed) writeStore(store);
  return store;
}

function interruptedDurationMs(startedAt, endedAt, fallback = 0) {
  const startedMs = new Date(startedAt || endedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  return Number.isFinite(startedMs) && Number.isFinite(endedMs)
    ? Math.max(0, endedMs - startedMs)
    : Number(fallback || 0);
}

function recoverInterruptedLocalRuns() {
  const store = readStore();
  const endedAt = now();
  const recoveredSubagentEventIds = new Set();
  let changed = false;

  for (const item of [...(store.subagentRuns || [])]) {
    const run = normalizeSubagentRun(item, store);
    if (run.status !== "running" || !run.runtimeOwner || run.runtimeOwner === runtimeInstanceId) continue;
    const recovered = normalizeSubagentRun({
      ...run,
      status: "error",
      summary: SUBAGENT_INTERRUPTED_MESSAGE,
      stderr: trimOutput([run.stderr || "", SUBAGENT_INTERRUPTED_MESSAGE].filter(Boolean).join("\n")),
      code: null,
      durationMs: interruptedDurationMs(run.startedAt, endedAt, run.durationMs),
      endedAt,
      runtimeOwner: "",
    }, store);
    upsertSubagentRun(store, recovered);
    upsertSubagentRunEvent(store, recovered, "error");
    recoveredSubagentEventIds.add(recovered.requestId || recovered.id);
    changed = true;
  }

  for (const event of [...(store.runEvents || [])]) {
    if (
      event?.status !== "running" ||
      !event.runtimeOwner ||
      event.runtimeOwner === runtimeInstanceId ||
      recoveredSubagentEventIds.has(event.id)
    ) {
      continue;
    }
    const isSubagent = event.type === "subagent";
    const isWorkspaceCommand = event.type === "workspace-command" || event.type === "git-command";
    if (!isSubagent && !isWorkspaceCommand) continue;
    const message = isSubagent ? SUBAGENT_INTERRUPTED_MESSAGE : WORKSPACE_COMMAND_INTERRUPTED_MESSAGE;
    upsertRunEvent(store, {
      ...event,
      status: "error",
      detail: [event.detail || "", message].filter(Boolean).join(" · "),
      code: null,
      durationMs: interruptedDurationMs(event.createdAt, endedAt, event.durationMs),
      stderr: trimOutput([event.stderr || "", message].filter(Boolean).join("\n")),
      runtimeOwner: "",
    });
    changed = true;
  }

  if (changed) writeStore(store);
  return store;
}

async function runAutomationById(automationId, { requestId = "", trigger = "manual" } = {}) {
  if (automationRunLocks.has(automationId)) {
    throw new Error("这个自动化任务正在运行。");
  }
  if (requestId && [...activeAutomationRuns.values()].some((runtime) => runtime.runId === requestId)) {
    const error = new Error("AUTOMATION_REQUEST_ACTIVE: 这个自动化运行标识正在使用。");
    error.code = "AUTOMATION_REQUEST_ACTIVE";
    throw error;
  }
  assertActiveRequestIdAvailable(requestId);
  automationRunLocks.add(automationId);
  const runId = requestId || id("automation_run");
  const runtime = {
    automationId,
    runId,
    requestId: requestId || runId,
    cancelled: false,
    done: null,
    resolveDone: null,
  };
  runtime.done = new Promise((resolve) => {
    runtime.resolveDone = resolve;
  });
  activeAutomationRuns.set(automationId, runtime);
  const startedAt = now();
  const startedMs = Date.now();
  try {
    const store = readStore();
    const automation = findAutomationOrThrow(store, automationId);
    if (!automation.prompt) throw new Error("自动化提示词为空。");
    const session = ensureAutomationSession(store, automation);
    const startedClaudeSessionId = String(session.claudeSessionId || "");
    const automationArtifactRoot = automation.project?.path && fs.existsSync(automation.project.path)
      ? automation.project.path
      : "";
    const automationArtifactBefore = automationArtifactRoot
      ? workspaceArtifactSnapshot(automationArtifactRoot)
      : new Map();
    const runningEntry = {
      id: runId,
      trigger,
      status: "running",
      startedAt,
      endedAt: "",
      durationMs: 0,
      sessionId: session.id,
      detail: "",
      error: "",
      summary: "",
      stdout: "",
      stderr: "",
      code: null,
    };
    automation.status = "running";
    prependAutomationHistory(automation, runningEntry);
    upsertAutomationRunEvent(store, automation, runningEntry, "running");

    const userContent = automation.prompt.trim();
    if (!session.messages.some((message) => message.automationRunId === runId && message.role === "user")) {
      session.messages.push({
        role: "user",
        content: userContent,
        createdAt: startedAt,
        automationId: automation.id,
        automationRunId: runId,
      });
    }
    if (isGenericSessionTitle(session.title)) {
      session.title = titleFromUserContent(userContent);
    }
    session.updatedAt = startedAt;
    writeStore(store);
    broadcastStoreUpdate(store);

    const commitOutcome = ({
      status,
      eventStatus,
      messageRole,
      messageContent,
      detail = "",
      error = "",
      summary = "",
      stdout = "",
      stderr = "",
      code = null,
      artifacts = [],
      claudeSessionId = "",
    }) => {
      const latestStore = readStore();
      const latestAutomation = findAutomationOrThrow(latestStore, automationId);
      const latestSession = (latestStore.sessions || []).find((item) => item.id === session.id);
      if (latestSession) {
        latestSession.messages = Array.isArray(latestSession.messages) ? latestSession.messages : [];
        if (
          messageContent &&
          !latestSession.messages.some((message) => message.automationRunId === runId && message.role === messageRole)
        ) {
          latestSession.messages.push({
            role: messageRole,
            content: messageContent,
            createdAt: now(),
            automationId: latestAutomation.id,
            automationRunId: runId,
          });
        }
        commitClaudeSessionIdIfCurrent(latestSession, startedClaudeSessionId, claudeSessionId);
        latestSession.updatedAt = now();
      }

      const existingEntry = (latestAutomation.history || []).find((entry) => entry.id === runId)
        || (latestAutomation.lastRun?.id === runId ? latestAutomation.lastRun : null);
      const finalEntry = {
        ...runningEntry,
        ...(existingEntry || {}),
        status,
        endedAt: now(),
        durationMs: Date.now() - startedMs,
        detail,
        error,
        summary,
        stdout: stdout || existingEntry?.stdout || "",
        stderr: stderr || existingEntry?.stderr || "",
        code,
        artifacts,
      };
      prependAutomationHistory(latestAutomation, finalEntry);
      if (trigger === "scheduled" && latestAutomation.schedule?.type === "once") {
        latestAutomation.enabled = false;
      }
      latestAutomation.status = status;
      updateAutomationAfterMutation(latestAutomation);
      if (status === "failed" && trigger === "scheduled") {
        upsertNotice(latestStore, {
          level: "error",
          source: "automation",
          title: "Scheduled automation failed",
          detail: error,
          key: `automation:${latestAutomation.id}:scheduled-failure`,
          action: `automation:${latestAutomation.id}`,
          sessionId: latestSession?.id || session.id,
          project: latestAutomation.project,
        });
      }
      upsertAutomationRunEvent(latestStore, latestAutomation, finalEntry, eventStatus);
      writeStore(latestStore);
      broadcastStoreUpdate(latestStore);
      return { store: latestStore, entry: finalEntry };
    };

    const runtimeStore = {
      ...store,
      activeProject: automation.project || store.activeProject || localWorkspaceProject(),
    };
    try {
      const assistantPromise = requestAssistant(runtimeStore, session, runtime.requestId);
      if (runtime.cancelled) stopActiveRequest(runtime.requestId);
      const assistantResult = await assistantPromise;
      if (runtime.cancelled) {
        const error = new Error("自动化已停止。");
        error.code = 130;
        throw error;
      }
      const assistantText = typeof assistantResult === "string" ? assistantResult : assistantResult.text;
      const stdout = typeof assistantResult === "object" ? assistantResult.stdout || "" : "";
      const stderr = typeof assistantResult === "object" ? assistantResult.stderr || "" : "";
      const code = typeof assistantResult === "object" && typeof assistantResult.code === "number" ? assistantResult.code : 0;
      const summary = titleFromUserContent(assistantText || "自动化任务已完成。");
      const committed = commitOutcome({
        status: "succeeded",
        eventStatus: "ok",
        messageRole: "assistant",
        messageContent: assistantText || "自动化任务已完成。",
        detail: summary,
        summary,
        stdout,
        stderr,
        code,
        artifacts: workspaceFileArtifactsSince(automationArtifactBefore, automationArtifactRoot, automation.project),
        claudeSessionId: assistantResult?.claudeSessionId || session.claudeSessionId || "",
      });
      return {
        ...sanitizeStore(committed.store),
        automationRun: committed.entry,
      };
    } catch (error) {
      const wasCancelled = runtime.cancelled && !error?.preserveOnCancel;
      const message = wasCancelled ? "自动化已停止。" : error.message || String(error);
      const stderr = wasCancelled
        ? trimOutput([error.stderr || "", message].filter(Boolean).join("\n"))
        : error.stderr || "";
      const committed = commitOutcome({
        status: wasCancelled ? "cancelled" : "failed",
        eventStatus: wasCancelled ? "cancelled" : "error",
        messageRole: wasCancelled ? "cancelled" : "error",
        messageContent: message,
        detail: wasCancelled ? message : "",
        error: wasCancelled ? "" : message,
        summary: wasCancelled ? message : "",
        stdout: error.stdout || "",
        stderr,
        code: wasCancelled ? 130 : typeof error.code === "number" ? error.code : 1,
        artifacts: workspaceFileArtifactsSince(automationArtifactBefore, automationArtifactRoot, automation.project),
      });
      return {
        ...sanitizeStore(committed.store),
        automationRun: committed.entry,
      };
    }
  } finally {
    if (activeAutomationRuns.get(automationId) === runtime) activeAutomationRuns.delete(automationId);
    automationRunLocks.delete(automationId);
    runtime.resolveDone?.();
  }
}

function dueAutomations(store) {
  const at = Date.now();
  return (store.automations || []).filter((automation) => {
    if (automationRunLocks.has(automation.id)) return false;
    const nextRun = automationNextRun(automation);
    if (!nextRun) return false;
    return new Date(nextRun).getTime() <= at;
  });
}

function startAutomationScheduler() {
  if (automationSchedulerTimer) return;
  const tick = async () => {
    if (automationSchedulerRunning) return;
    automationSchedulerRunning = true;
    let store;
    try {
      store = readStore();
    } catch {
      automationSchedulerRunning = false;
      return;
    }
    try {
      for (const automation of dueAutomations(store).slice(0, 2)) {
        await runAutomationById(automation.id, { trigger: "scheduled", requestId: id("automation") }).catch(() => {});
      }
    } finally {
      automationSchedulerRunning = false;
    }
  };
  automationSchedulerTimer = setInterval(tick, AUTOMATION_POLL_MS);
  setTimeout(tick, 2500);
}

function subagentProjectFromPayload(store, payload = {}) {
  return automationProjectFromPayload(store, payload);
}

function subagentPrompt(task, nickname) {
  return [
    `你是 Claudex 子代理 ${nickname || "Subagent"}。`,
    "请独立完成下面这个子任务，输出简洁的状态、证据和下一步。",
    "",
    String(task || "").trim(),
  ].join("\n");
}

const SUBAGENT_WORKSPACE_ARTIFACT_SCAN_LIMIT = 800;
const SUBAGENT_WORKSPACE_FILE_ARTIFACT_LIMIT = 6;
const SUBAGENT_WORKSPACE_FILE_ARTIFACT_MAX_BYTES = 64 * 1024;

function isSensitiveWorkspaceArtifact(relativePath = "") {
  const normalized = slashPath(relativePath).toLowerCase();
  const base = path.basename(normalized);
  return base === ".env"
    || base.startsWith(".env.")
    || /\.(?:pem|key|p12|pfx|crt|cer|der|kdbx|sqlite|db)$/i.test(base);
}

function shouldIgnoreWorkspaceArtifactDir(name = "") {
  return isIgnoredWorkspaceDir(name) || name === ".cache" || name === ".tmp";
}

function workspaceArtifactSnapshot(root) {
  if (!root || !fs.existsSync(root)) return new Map();
  let rootStat;
  try {
    rootStat = fs.statSync(root);
  } catch {
    return new Map();
  }
  if (!rootStat.isDirectory()) return new Map();
  const snapshot = new Map();
  const queue = [root];
  while (queue.length && snapshot.size < SUBAGENT_WORKSPACE_ARTIFACT_SCAN_LIMIT) {
    const dir = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (snapshot.size >= SUBAGENT_WORKSPACE_ARTIFACT_SCAN_LIMIT) break;
      if (entry.isDirectory()) {
        if (!shouldIgnoreWorkspaceArtifactDir(entry.name)) queue.push(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = slashPath(path.relative(root, fullPath));
      if (!relativePath || isSensitiveWorkspaceArtifact(relativePath)) continue;
      try {
        const stat = fs.statSync(fullPath);
        snapshot.set(relativePath, {
          path: relativePath,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        // ignore files that disappeared while scanning
      }
    }
  }
  return snapshot;
}

function readWorkspaceArtifactContent(root, relativePath) {
  const fullPath = path.resolve(root, relativePath);
  const relative = path.relative(root, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    return "";
  }
  if (!stat.isFile() || stat.size > SUBAGENT_WORKSPACE_FILE_ARTIFACT_MAX_BYTES) return "";
  try {
    const content = fs.readFileSync(fullPath, "utf8");
    if (content.includes("\u0000")) return "";
    return trimOutput(content, 6000);
  } catch {
    return "";
  }
}

function workspaceFileArtifactsFromSnapshots({ before, after, root, project } = {}) {
  if (!(before instanceof Map) || !(after instanceof Map) || !root) return [];
  return [...after.values()]
    .filter((entry) => {
      const previous = before.get(entry.path);
      return !previous || previous.size !== entry.size || Math.round(previous.mtimeMs) !== Math.round(entry.mtimeMs);
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
    .slice(0, SUBAGENT_WORKSPACE_FILE_ARTIFACT_LIMIT)
    .map((entry) => {
      const content = readWorkspaceArtifactContent(root, entry.path);
      return {
        type: "file",
        label: entry.path,
        path: entry.path,
        projectPath: root,
        projectLabel: project?.name || project?.path || "",
        size: entry.size,
        updatedAt: entry.updatedAt,
        content,
      };
    });
}

function subagentWorkspaceFileArtifacts(options = {}) {
  return workspaceFileArtifactsFromSnapshots(options);
}

function workspaceFileArtifactsSince(before, root, project) {
  return workspaceFileArtifactsFromSnapshots({
    before,
    after: root ? workspaceArtifactSnapshot(root) : new Map(),
    root,
    project,
  });
}

function subagentArtifactsFromResult({ summary = "", stdout = "", stderr = "" } = {}) {
  const artifacts = [];
  if (String(summary || "").trim()) {
    artifacts.push({
      type: "summary",
      label: "Summary",
      content: trimOutput(String(summary || ""), 6000),
    });
  }
  if (String(stdout || "").trim()) {
    artifacts.push({
      type: "stdout",
      label: "stdout",
      content: trimOutput(String(stdout || ""), 6000),
    });
  }
  if (String(stderr || "").trim()) {
    artifacts.push({
      type: "stderr",
      label: "stderr",
      content: trimOutput(String(stderr || ""), 6000),
    });
  }
  return artifacts.slice(0, 12);
}

function emitSubagentEvent(sender, payload) {
  if (!sender || sender.isDestroyed?.()) return;
  sender.send("subagent:stream-event", payload);
}

async function runSubagent(payload = {}, sender) {
  const task = String(payload.task || "").trim();
  if (!task) throw new Error("子代理任务为空。");
  const store = readStore();
  const project = subagentProjectFromPayload(store, payload);
  const cwd = project?.path && fs.existsSync(project.path) ? project.path : app.getPath("home");
  const workspaceArtifactBefore = project?.path && path.resolve(cwd) === path.resolve(project.path)
    ? workspaceArtifactSnapshot(cwd)
    : new Map();
  const runId = id("subagent");
  const requestId = payload.requestId || id("subagent_request");
  if (activeSubagentRuns.has(runId) || activeSubagentRuns.has(requestId)) {
    const error = new Error("SUBAGENT_REQUEST_ACTIVE: 这个子代理请求正在运行。");
    error.code = "SUBAGENT_REQUEST_ACTIVE";
    throw error;
  }
  assertActiveRequestIdAvailable(requestId);
  const runtime = runtimeCompletion({ runId, requestId, cancelled: false });
  activeSubagentRuns.set(runId, runtime);
  activeSubagentRuns.set(requestId, runtime);
  const startedAt = now();
  const nickname = String(payload.nickname || "Subagent").trim() || "Subagent";
  const session = {
    id: payload.sessionId || "",
    title: nickname,
    project: project?.name || store.activeProject?.name || "本地工作区",
    projectPath: project?.path || "",
    messages: [{ role: "user", content: task, createdAt: startedAt }],
  };
  const args = buildClaudeChatArgs({ ...store, activeProject: project }, session);
  const claudeCommand = configuredClaudeCommand(store);
  const run = normalizeSubagentRun({
    id: runId,
    requestId,
    nickname,
    task,
    status: "running",
    sessionId: payload.sessionId || "",
    project,
    cwd,
    command: claudeCommand,
    args,
    startedAt,
    artifacts: [],
    runtimeOwner: runtimeInstanceId,
  }, store);
  try {
    upsertSubagentRun(store, run);
    upsertSubagentRunEvent(store, run, "running");
    writeStore(store);
    emitSubagentEvent(sender, { type: "start", run });

    let stdout = "";
    let stderr = "";
    const resultPromise = runStreamingProcess(commandCandidates(claudeCommand)[0], args, {
      cwd,
      requestId,
      timeoutMs: Number(store.settings.timeoutMs || CLAUDE_TIMEOUT_MS),
      env: claudeProcessEnv({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }),
      onChunk: (stream, text) => {
        if (stream === "stderr") stderr = trimOutput(`${stderr}${text || ""}`);
        else stdout = trimOutput(`${stdout}${text || ""}`);
        persistSubagentChunk({ runId, requestId, stream, text });
        emitSubagentEvent(sender, {
          type: "chunk",
          runId,
          requestId,
          stream,
          text: stripAnsi(text || ""),
        });
      },
    });
    if (runtime.cancelled) stopActiveRequest(requestId);
    const result = await resultPromise;
    const parsed = parseJsonOutput(result.stdout);
    const wasCancelled = runtime.cancelled;
    const finalStatus = wasCancelled ? "cancelled" : result.code === 0 && !parsed?.is_error ? "done" : "error";
    const summary = parsed?.result || (result.stdout || result.stderr || "").trim();
    const cleanStdout = stripAnsi(result.stdout || stdout);
    const cleanStderr = stripAnsi(wasCancelled
      ? [result.stderr || stderr, "子代理已停止。"].filter(Boolean).join("\n")
      : result.stderr || stderr);
    const cleanSummary = stripAnsi(wasCancelled ? "子代理已停止。" : summary);
    const workspaceArtifactAfter = project?.path && path.resolve(cwd) === path.resolve(project.path)
      ? workspaceArtifactSnapshot(cwd)
      : new Map();
    const workspaceFileArtifacts = subagentWorkspaceFileArtifacts({
      before: workspaceArtifactBefore,
      after: workspaceArtifactAfter,
      root: cwd,
      project,
    });
    const nextStore = readStore();
    const existing = (nextStore.subagentRuns || []).find((item) => item.id === runId) || run;
    const finalRun = normalizeSubagentRun({
      ...existing,
      status: finalStatus,
      stdout: cleanStdout,
      stderr: cleanStderr,
      summary: cleanSummary,
      code: wasCancelled ? 130 : result.code,
      durationMs: result.durationMs,
      endedAt: now(),
      runtimeOwner: "",
      artifacts: [
        ...subagentArtifactsFromResult({
          summary: cleanSummary,
          stdout: cleanStdout,
          stderr: cleanStderr,
        }),
        ...workspaceFileArtifacts,
      ].slice(0, 12),
    }, nextStore);
    upsertSubagentRun(nextStore, finalRun);
    upsertSubagentRunEvent(
      nextStore,
      finalRun,
      finalStatus === "done" ? "ok" : finalStatus === "cancelled" ? "cancelled" : "error",
    );
    writeStore(nextStore);
    emitSubagentEvent(sender, { type: finalStatus, run: finalRun });
    return {
      ...sanitizeStore(nextStore),
      subagentRun: finalRun,
    };
  } finally {
    if (activeSubagentRuns.get(runId) === runtime) activeSubagentRuns.delete(runId);
    if (activeSubagentRuns.get(requestId) === runtime) activeSubagentRuns.delete(requestId);
    runtime.resolveDone?.();
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, "..", "dist", "assets", "claudex-mark.png");
  const window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1040,
    minHeight: 720,
    show: false,
    backgroundColor: "#111111",
    autoHideMenuBar: true,
    title: "Claudex",
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });

  window.setMenuBarVisibility(false);
  window.once("ready-to-show", () => window.show());
  window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  return window;
}

app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});

app.on("before-quit", (event) => {
  if (quitDrainComplete || (!activeRequests.size && !activeRunRuntimes().size)) return;
  event.preventDefault();
  if (quitDrainPromise) return;
  quitDrainPromise = drainActiveRequestsForQuit().catch(() => false).then(() => {
    quitDrainComplete = true;
    app.quit();
  });
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  recoverInterruptedAutomationRuns();
  recoverInterruptedLocalRuns();
  createWindow();
  startAutomationScheduler();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (automationSchedulerTimer) clearInterval(automationSchedulerTimer);
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:get-state", (_event) => sanitizeStore(readStore(), _event.sender.id));

ipcMain.handle("app:save-settings", (_event, nextSettings) => {
  const store = readStore();
  const provider = nextSettings.provider || store.settings.provider;
  const claudeCode = {
    ...CLAUDE_CODE_SETTINGS,
    ...(store.settings.claudeCode || {}),
    ...(nextSettings.claudeCode || {}),
  };
  store.settings = {
    ...store.settings,
    provider,
    model: nextSettings.model || store.settings.model,
    baseUrl: nextSettings.baseUrl || store.settings.baseUrl,
    temperature: Number(nextSettings.temperature ?? store.settings.temperature ?? 0.2),
    timeoutMs: Number(nextSettings.timeoutMs ?? store.settings.timeoutMs ?? 600000),
    language: nextSettings.language || store.settings.language || "zh",
    appearance: {
      ...(store.settings.appearance || {}),
      ...(nextSettings.appearance || {}),
    },
    systemPrompt: nextSettings.systemPrompt ?? store.settings.systemPrompt,
    capabilities: { ...(store.settings.capabilities || DEFAULT_CAPABILITIES) },
    customMarketplaces: Array.isArray(nextSettings.customMarketplaces)
      ? nextSettings.customMarketplaces.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12)
      : Array.isArray(store.settings.customMarketplaces)
        ? store.settings.customMarketplaces
        : [],
    claudeCode,
    apiKeys: { ...(store.settings.apiKeys || {}) },
  };

  if (typeof nextSettings.apiKey === "string" && nextSettings.apiKey.trim()) {
    store.settings.apiKeys[provider] = encryptSecret(nextSettings.apiKey.trim());
  }

  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("app:save-capabilities", (_event, capabilities) => {
  const store = readStore();
  store.settings.capabilities = {
    ...DEFAULT_CAPABILITIES,
    ...(store.settings.capabilities || {}),
    ...(capabilities || {}),
  };
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("notice:record", (_event, payload = {}) => {
  const store = readStore();
  const project = payload.projectPath && fs.existsSync(payload.projectPath)
    ? projectFromPath(payload.projectPath)
    : payload.project || store.activeProject || localWorkspaceProject();
  const notice = upsertNotice(store, {
    ...payload,
    project,
    lastSeenAt: now(),
  });
  writeStore(store);
  broadcastStoreUpdate(store);
  return {
    ...sanitizeStore(store),
    notice,
  };
});

ipcMain.handle("run-event:record", (_event, payload = {}) => {
  const store = readStore();
  const automationRun = payload.type === "automation" ? findAutomationRunEntry(store, payload.id) : null;
  const eventPayload = automationRun
    ? {
        ...payload,
        projectPath: automationRun.automation.project?.path || payload.projectPath || "",
        project: automationRun.automation.project,
        cwd: automationRun.automation.project?.path || payload.cwd || "",
        sessionId: automationRun.entry.sessionId || automationRun.automation.threadId || payload.sessionId || "",
        stdout: payload.stdout || automationRun.entry.stdout || "",
        stderr: payload.stderr || automationRun.entry.stderr || "",
        code: typeof payload.code === "number" ? payload.code : automationRun.entry.code,
        durationMs: typeof payload.durationMs === "number" ? payload.durationMs : automationRun.entry.durationMs,
      }
    : payload;
  const project = eventPayload.projectPath && fs.existsSync(eventPayload.projectPath)
    ? projectFromPath(eventPayload.projectPath)
    : eventPayload.project || store.activeProject || localWorkspaceProject();
  const runEvent = upsertRunEvent(store, {
    ...eventPayload,
    project,
  });
  writeStore(store);
  broadcastStoreUpdate(store);
  return {
    ...sanitizeStore(store),
    runEvent,
  };
});

ipcMain.handle("notice:dismiss", (_event, { noticeId } = {}) => {
  const store = readStore();
  const dismissedAt = now();
  store.notices = (store.notices || []).map((notice) => (
    notice.id === noticeId ? { ...notice, dismissedAt } : notice
  ));
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("notice:clear", () => {
  const store = readStore();
  const dismissedAt = now();
  store.notices = (store.notices || []).map((notice) => (
    notice.dismissedAt ? notice : { ...notice, dismissedAt }
  ));
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("automation:create", (_event, payload = {}) => {
  const prompt = String(payload.prompt || "").trim();
  if (!prompt) throw new Error("自动化提示词为空。");
  const store = readStore();
  const createdAt = now();
  const project = automationProjectFromPayload(store, payload);
  const runAt = isoOrEmpty(payload.runAt);
  const scheduleType = normalizeAutomationScheduleType(payload.scheduleType || payload.schedule?.type || payload.repeat);
  const automation = normalizeAutomation({
    id: id("automation"),
    prompt,
    schedule: {
      type: scheduleType,
      runAt,
    },
    project,
    threadId: payload.threadId || "",
    enabled: Boolean(runAt),
    status: runAt ? "scheduled" : "idle",
    createdAt,
    updatedAt: createdAt,
    history: [],
  }, store);
  store.automations = [automation, ...(store.automations || [])].slice(0, AUTOMATION_LIMIT);
  const runEvent = upsertAutomationActionRunEvent(store, automation, "create");
  writeStore(store);
  return {
    ...sanitizeStore(store),
    automation,
    runEvent,
  };
});

ipcMain.handle("automation:set-enabled", (_event, { automationId, enabled } = {}) => {
  assertAutomationNotRunning(automationId);
  const store = readStore();
  const automation = findAutomationOrThrow(store, automationId);
  automation.enabled = Boolean(enabled);
  automation.status = automation.enabled ? "scheduled" : "paused";
  updateAutomationAfterMutation(automation);
  const runEvent = upsertAutomationActionRunEvent(store, automation, automation.enabled ? "resume" : "pause");
  writeStore(store);
  return {
    ...sanitizeStore(store),
    automation,
    runEvent,
  };
});

ipcMain.handle("automation:delete", (_event, { automationId } = {}) => {
  assertAutomationNotRunning(automationId);
  const store = readStore();
  const automation = findAutomationOrThrow(store, automationId);
  const runEvent = upsertAutomationActionRunEvent(store, automation, "delete");
  store.automations = (store.automations || []).filter((automation) => automation.id !== automationId);
  writeStore(store);
  return {
    ...sanitizeStore(store),
    automation,
    runEvent,
  };
});

ipcMain.handle("automation:run-now", async (_event, { automationId, requestId } = {}) => {
  return runAutomationById(automationId, { requestId, trigger: "manual" });
});

ipcMain.handle("automation:cancel", async (_event, { automationId, runId } = {}) => {
  const runtime = activeAutomationRuns.get(automationId);
  if (!runtime || (runId && runtime.runId !== runId)) {
    const error = new Error("AUTOMATION_NOT_RUNNING: 没有找到对应的运行中自动化任务。");
    error.code = "AUTOMATION_NOT_RUNNING";
    throw error;
  }

  runtime.cancelled = true;
  stopActiveRequest(runtime.requestId);

  const settled = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), RUN_STOP_WAIT_MS);
    runtime.done.then(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
  if (!settled) {
    const error = new Error(
      `AUTOMATION_STOP_TIMEOUT: ${RUN_STOP_WAIT_MS} 毫秒内未确认底层任务停止，请稍后重试。`,
    );
    error.code = "AUTOMATION_STOP_TIMEOUT";
    throw error;
  }

  const latestStore = readStore();
  const latestAutomation = findAutomationOrThrow(latestStore, automationId);
  const latestEntry = (latestAutomation.history || []).find((entry) => entry.id === runtime.runId)
    || (latestAutomation.lastRun?.id === runtime.runId ? latestAutomation.lastRun : null);
  if (!latestEntry || latestEntry.status === "running") {
    const error = new Error("AUTOMATION_STOP_NOT_CONFIRMED: 自动化运行尚未进入终态。");
    error.code = "AUTOMATION_STOP_NOT_CONFIRMED";
    throw error;
  }
  return {
    ...sanitizeStore(latestStore),
    automationRun: latestEntry,
  };
});

ipcMain.handle("subagent:run", async (_event, payload = {}) => {
  return runSubagent(payload, _event.sender);
});

ipcMain.handle("subagent:cancel", async (_event, { runId, requestId } = {}) => {
  const runtimeByRunId = runId ? activeSubagentRuns.get(runId) : null;
  const runtimeByRequestId = requestId ? activeSubagentRuns.get(requestId) : null;
  if (runtimeByRunId && runtimeByRequestId && runtimeByRunId !== runtimeByRequestId) {
    const error = new Error("SUBAGENT_RUN_MISMATCH: runId 与 requestId 不属于同一次运行。");
    error.code = "SUBAGENT_RUN_MISMATCH";
    throw error;
  }
  const runtime = runtimeByRunId || runtimeByRequestId;
  if (!runtime) {
    const error = new Error("SUBAGENT_NOT_RUNNING: 没有找到对应的运行中子代理。");
    error.code = "SUBAGENT_NOT_RUNNING";
    throw error;
  }
  if ((runId && runtime.runId !== runId) || (requestId && runtime.requestId !== requestId)) {
    const error = new Error("SUBAGENT_RUN_MISMATCH: 运行标识不匹配。");
    error.code = "SUBAGENT_RUN_MISMATCH";
    throw error;
  }
  runtime.cancelled = true;
  stopActiveRequest(runtime.requestId);

  if (!await waitForRuntimeCompletion(runtime, RUN_STOP_WAIT_MS)) {
    const error = new Error(
      `SUBAGENT_STOP_TIMEOUT: ${RUN_STOP_WAIT_MS} 毫秒内未确认底层任务停止，请稍后重试。`,
    );
    error.code = "SUBAGENT_STOP_TIMEOUT";
    throw error;
  }

  const store = readStore();
  const run = findSubagentRun(store, { runId: runtime.runId, requestId: runtime.requestId });
  if (!run || run.status === "running") {
    const error = new Error("SUBAGENT_STOP_NOT_CONFIRMED: 子代理尚未进入终态。");
    error.code = "SUBAGENT_STOP_NOT_CONFIRMED";
    throw error;
  }
  return {
    ...sanitizeStore(store),
    subagentRun: run,
  };
});

ipcMain.handle("subagent:archive", (_event, { runId, requestId, archived = true } = {}) => {
  const store = readStore();
  const run = findSubagentRun(store, { runId, requestId });
  if (!run) throw new Error("没有找到这个子代理记录。");
  const normalized = normalizeSubagentRun({
    ...run,
    archivedAt: archived ? now() : "",
  }, store);
  upsertSubagentRun(store, normalized);
  const runEvent = upsertSubagentActionRunEvent(store, normalized, archived ? "archive" : "restore");
  writeStore(store);
  return {
    ...sanitizeStore(store),
    subagentRun: normalized,
    runEvent,
  };
});

ipcMain.handle("subagent:continue", (_event, { runId, requestId, sessionId, projectPath } = {}) => {
  const store = readStore();
  const run = findSubagentRun(store, { runId, requestId });
  if (!run) throw new Error("没有找到这个子代理记录。");
  const normalized = normalizeSubagentRun(run, store);
  const requestedProjectPath = String(projectPath || "").trim();
  const runProject = requestedProjectPath && fs.existsSync(requestedProjectPath)
    ? projectFromPath(requestedProjectPath)
    : normalized.cwd && fs.existsSync(normalized.cwd)
      ? projectFromPath(normalized.cwd)
      : normalized.project || store.activeProject || localWorkspaceProject();
  const originalSession = store.sessions.find((item) => item.id === normalized.sessionId && sessionMatchesProject(item, runProject));
  const requestedSession = store.sessions.find((item) => item.id === sessionId && sessionMatchesProject(item, runProject));
  const session = originalSession
    || requestedSession
    || visibleProjectSessions(store, runProject)[0]
    || ensureProjectDraftSession(store, runProject)
    || store.sessions[0];
  if (!session) throw new Error("没有可用的聊天会话。");
  const targetProject = {
    name: session.project || runProject?.name || localWorkspaceProject().name,
    path: session.projectPath || runProject?.path || "",
  };
  if (projectKeyForStore(targetProject)) addProject(store, targetProject);
  const continuedAt = now();
  if (!(normalized.continuedAt && normalized.continuedSessionId === session.id)) {
    session.messages = sessionMessages(session);
    session.messages.push({
      role: "assistant",
      content: subagentContinuationMessage(normalized),
      createdAt: continuedAt,
      source: {
        type: "subagent",
        runId: normalized.id,
        requestId: normalized.requestId,
      },
    });
  }
  session.updatedAt = continuedAt;
  const continuedRun = normalizeSubagentRun({
    ...normalized,
    project: runProject,
    cwd: normalized.cwd || runProject?.path || "",
    continuedAt,
    continuedSessionId: session.id,
  }, store);
  upsertSubagentRun(store, continuedRun);
  const runEvent = upsertSubagentActionRunEvent(store, continuedRun, "continue");
  writeStore(store);
  return {
    ...sanitizeStore(store),
    selectedSessionId: session.id,
    subagentRun: continuedRun,
    runEvent,
  };
});

ipcMain.handle("app:select-project", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择项目文件夹",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const store = readStore();
  addProject(store, projectFromPath(result.filePaths[0]));
  ensureActiveProjectDraftSession(store);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("app:set-active-project", (_event, project) => {
  const store = readStore();
  const projectName = String(project?.name || "").trim();
  const nextProject = project?.path
    ? { name: projectName || path.basename(project.path) || project.path, path: project.path }
    : { name: projectName || "本地工作区", path: "" };
  addProject(store, nextProject);
  ensureActiveProjectDraftSession(store);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:create-session", (_event, title = "新聊天") => {
  const store = readStore();
  const createdAt = now();
  const project = store.activeProject || { name: "本地工作区", path: "" };
  const currentProjectKey = String(project.path || project.name || "").trim().toLowerCase();
  const reusableIndex = store.sessions.findIndex(
    (item) => !item.archived && !hasSessionMessages(item) && isGenericSessionTitle(item.title) && sessionProjectKey(item) === currentProjectKey,
  );
  if (reusableIndex >= 0) {
    const [reusable] = store.sessions.splice(reusableIndex, 1);
    reusable.title = "新聊天";
    reusable.project = project.name;
    reusable.projectPath = project.path;
    reusable.updatedAt = createdAt;
    reusable.pinned = false;
    reusable.archived = false;
    reusable.pinnedAt = "";
    reusable.archivedAt = "";
    reusable.renamedAt = "";
    reusable.forkedAt = "";
    reusable.forkedFromId = "";
    reusable.forkedFromTitle = "";
    reusable.forkedFromClaudeSessionId = "";
    reusable.claudeSessionId = "";
    store.sessions.unshift(reusable);
    writeStore(store);
    return sanitizeStore(store);
  }

  const session = {
    id: id("session"),
    title: isGenericSessionTitle(title) ? "新聊天" : title,
    project: project.name,
    projectPath: project.path,
    createdAt,
    updatedAt: createdAt,
    messages: [],
    pinned: false,
    archived: false,
    pinnedAt: "",
    archivedAt: "",
    renamedAt: "",
    forkedAt: "",
    forkedFromId: "",
    forkedFromTitle: "",
    forkedFromClaudeSessionId: "",
    claudeSessionId: "",
  };
  store.sessions.unshift(session);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:update-session", (_event, { sessionId, title, pinned, archived } = {}) => {
  const store = readStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("没有找到这个聊天。");
  const updatedAt = now();
  const previousTitle = sessionDisplayTitleForStore(session);
  if (typeof title === "string") {
    const nextTitle = title.trim();
    if (nextTitle && nextTitle !== session.title) {
      session.title = nextTitle;
      session.renamedAt = updatedAt;
      upsertThreadActionRunEvent(store, session, "rename", [
        `原标题: ${previousTitle}`,
        `新标题: ${sessionDisplayTitleForStore(session)}`,
      ].join(" · "));
    }
  }
  if (typeof pinned === "boolean" && session.pinned !== pinned) {
    session.pinned = pinned;
    session.pinnedAt = pinned ? updatedAt : "";
    upsertThreadActionRunEvent(store, session, pinned ? "pin" : "unpin");
  }
  if (typeof archived === "boolean" && session.archived !== archived) {
    session.archived = archived;
    session.archivedAt = archived ? updatedAt : "";
    upsertThreadActionRunEvent(store, session, archived ? "archive" : "restore");
  }
  session.updatedAt = updatedAt;
  ensureActiveProjectDraftSession(store);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:delete-session", (_event, sessionId) => {
  const store = readStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("没有找到这个聊天。");
  upsertThreadActionRunEvent(store, session, "delete", [
    threadProjectForEvent(store, session)?.name || "本地工作区",
    `${sessionMessages(session).length} 条消息`,
    "原聊天已从本地列表删除，审计事件保留",
  ].filter(Boolean).join(" · "));
  store.sessions = store.sessions.filter((item) => item.id !== sessionId);
  ensureActiveProjectDraftSession(store);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:fork-session", (_event, sessionId) => {
  const store = readStore();
  const source = store.sessions.find((item) => item.id === sessionId);
  if (!source) throw new Error("没有找到这个聊天。");
  const createdAt = now();
  const fork = {
    ...source,
    id: id("session"),
    title: `Fork: ${sessionDisplayTitleForStore(source)}`,
    createdAt,
    updatedAt: createdAt,
    pinned: false,
    archived: false,
    pinnedAt: "",
    archivedAt: "",
    renamedAt: "",
    forkedAt: createdAt,
    forkedFromId: source.id,
    forkedFromTitle: sessionDisplayTitleForStore(source),
    forkedFromClaudeSessionId: String(source.claudeSessionId || ""),
    claudeSessionId: "",
    messages: sessionMessages(source).map((message) => ({ ...message })),
  };
  store.sessions.unshift(fork);
  upsertThreadActionRunEvent(store, source, "fork", [
    `源聊天: ${source.id}`,
    `目标聊天: ${fork.id}`,
    `${sessionMessages(source).length} 条消息`,
  ].join(" · "), { targetSession: fork });
  writeStore(store);
  return {
    ...sanitizeStore(store),
    selectedSessionId: fork.id,
  };
});

function cancelActiveChatRequest(requestId) {
  if (!activeChatRequestIds.has(requestId)) return false;
  cancelledChatRequestIds.add(requestId);
  broadcastStoreUpdate(readStore());
  stopActiveRequest(requestId);
  return true;
}

function claimActiveChatRequest({ requestId, ownerWebContents, sessionId, createdAt }) {
  if (activeChatRequestIds.size > 0) {
    const error = new Error("已有回复正在运行，请停止后再试。");
    error.code = "CHAT_REQUEST_ACTIVE";
    throw error;
  }
  activeChatRequestIds.add(requestId);
  cancelledChatRequestIds.delete(requestId);
  activeChatRequestRuntime.set(requestId, {
    ownerWebContentsId: Number(ownerWebContents?.id || 0),
    sessionId,
    content: "",
    streamStatus: "",
    streamRevision: 0,
    activities: [],
    createdAt,
  });
  const cancelOnOwnerDestroyed = () => {
    cancelActiveChatRequest(requestId);
  };
  if (ownerWebContents && !ownerWebContents.isDestroyed()) {
    ownerWebContents.once("destroyed", cancelOnOwnerDestroyed);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (ownerWebContents && !ownerWebContents.isDestroyed()) {
      ownerWebContents.removeListener("destroyed", cancelOnOwnerDestroyed);
    }
    activeChatRequestIds.delete(requestId);
    cancelledChatRequestIds.delete(requestId);
    activeChatRequestRuntime.delete(requestId);
  };
}

ipcMain.handle("chat:send-message", async (_event, { sessionId, content, requestId, claudeSessionId }) => {
  if (!content || !String(content).trim()) throw new Error("消息为空。");
  const store = readStore();
  const session = store.sessions.find((item) => item.id === sessionId) || store.sessions[0];
  if (!session) throw new Error("没有可用的聊天会话。");
  const runId = requestId || id("request");
  const createdAt = now();
  const releaseRequest = claimActiveChatRequest({
    requestId: runId,
    ownerWebContents: _event.sender,
    sessionId: session.id,
    createdAt,
  });

  try {
    const resumeId = String(claudeSessionId || "").trim();
    if (resumeId && !session.claudeSessionId) session.claudeSessionId = resumeId;
    const startedClaudeSessionId = String(session.claudeSessionId || "");
    const userContent = String(content).trim();
    session.messages.push({ role: "user", content: userContent, requestId: runId, createdAt });
    if (isGenericSessionTitle(session.title)) {
      session.title = titleFromUserContent(userContent);
    }
    session.updatedAt = createdAt;
    const project = session.projectPath && fs.existsSync(session.projectPath)
      ? projectFromPath(session.projectPath)
      : store.activeProject || localWorkspaceProject();
    const chatRunEvent = (targetSession, status, detail) => ({
      id: runId,
      type: "chat",
      status,
      title: `聊天: ${sessionDisplayTitleForStore(targetSession || session)}`,
      detail,
      cwd: session.projectPath || project?.path || "",
      project,
      sessionId: session.id,
      createdAt,
    });
    upsertRunEvent(store, chatRunEvent(session, "running", userContent.slice(0, 140)));
    writeStore(store);
    broadcastStoreUpdate(store);

    const commitOutcome = (status, detail, terminalMessage) => {
      const latestStore = readStore();
      const latestSession = latestStore.sessions.find((item) => item.id === session.id);
      if (latestSession) {
        latestSession.messages = sessionMessages(latestSession);
        if (terminalMessage) {
          const terminalIndex = latestSession.messages.findIndex((message) => (
            message?.requestId === runId && ["assistant", "cancelled", "error"].includes(message?.role)
          ));
          const nextMessage = { ...terminalMessage, requestId: runId };
          if (terminalIndex >= 0) latestSession.messages[terminalIndex] = nextMessage;
          else latestSession.messages.push(nextMessage);
          latestSession.updatedAt = nextMessage.createdAt || now();
        }
        commitClaudeSessionIdIfCurrent(latestSession, startedClaudeSessionId, session.claudeSessionId);
      }
      const runEvent = upsertRunEvent(
        latestStore,
        chatRunEvent(latestSession || session, status, detail),
      );
      writeStore(latestStore);
      releaseRequest();
      broadcastStoreUpdate(latestStore);
      return { latestStore, runEvent };
    };

    const finishCancelled = () => {
      const { latestStore, runEvent } = commitOutcome("cancelled", "已停止本次回复。", {
        role: "cancelled",
        content: "已停止本次回复。",
        createdAt: now(),
      });
      return {
        ...sanitizeStore(latestStore, _event.sender.id),
        requestStatus: "cancelled",
        cancelledRequestId: runId,
        runEvent,
      };
    };

    try {
      const assistantResult =
        store.settings.claudeCode?.executionMode !== "api"
          ? await requestClaudeCodeStream(store, session, runId, _event.sender)
          : await requestAssistant(store, session, runId, _event.sender);
      if (assistantResult?.cancelled) return finishCancelled();
      const assistantText = typeof assistantResult === "string" ? assistantResult : assistantResult.text;
      const permissionDenials = typeof assistantResult === "object" && Array.isArray(assistantResult.permissionDenials) ? assistantResult.permissionDenials : [];
      const usage = typeof assistantResult === "object" && assistantResult?.usage && typeof assistantResult.usage === "object"
        ? assistantResult.usage
        : null;
      const finishReason = typeof assistantResult === "object" ? String(assistantResult?.finishReason || "") : "";
      const { latestStore, runEvent } = commitOutcome("ok", "已完成", {
        role: "assistant",
        content: assistantText,
        createdAt: now(),
        ...(permissionDenials.length ? { permissionDenials } : {}),
        ...(usage ? { usage } : {}),
        ...(finishReason ? { finishReason } : {}),
      });
      return {
        ...sanitizeStore(latestStore, _event.sender.id),
        requestStatus: "ok",
        runEvent,
      };
    } catch (error) {
      if (cancelledChatRequestIds.has(runId) && !error?.preserveOnCancel) return finishCancelled();
      const message = error.message || "模型请求失败。";
      const { latestStore, runEvent } = commitOutcome("error", message, {
        role: "error",
        content: message,
        createdAt: now(),
      });
      return {
        ...sanitizeStore(latestStore, _event.sender.id),
        requestStatus: "error",
        requestError: message,
        runEvent,
      };
    }
  } finally {
    releaseRequest();
  }
});

ipcMain.handle("chat:cancel-request", (_event, requestId) => {
  const runtime = activeChatRequestRuntime.get(requestId);
  if (!activeChatRequestIds.has(requestId) || Number(runtime?.ownerWebContentsId || 0) !== _event.sender.id) {
    return false;
  }
  return cancelActiveChatRequest(requestId);
});

ipcMain.handle("app:open-data-file", async () => {
  await shell.showItemInFolder(dataPath());
  return true;
});

ipcMain.handle("app:open-project", async (_event, projectPath) => {
  const target = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  await shell.openPath(target);
  return true;
});

ipcMain.handle("app:open-terminal", async (_event, projectPath) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const child = openExternalTerminal(cwd);
  child.unref();
  return true;
});

ipcMain.handle("app:open-claude-terminal", async (_event, { projectPath, prompt = "" } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const command = String(prompt || "").trim()
    ? `claude ${JSON.stringify(String(prompt).trim())}`
    : "claude";
  const child = openExternalTerminal(cwd, command);
  child.unref();
  return true;
});

ipcMain.handle("browser:record-visit", (_event, payload = {}) => {
  const store = readStore();
  const project = payload.projectPath && fs.existsSync(payload.projectPath)
    ? projectFromPath(payload.projectPath)
    : store.activeProject || localWorkspaceProject();
  const visit = upsertBrowserVisit(store, {
    ...payload,
    project,
    url: payload.url,
    lastEventAt: now(),
  });
  writeStore(store);
  return {
    ...sanitizeStore(store),
    browserVisit: visit,
  };
});

ipcMain.handle("app:open-browser-url", async (_event, value) => {
  const payload = typeof value === "object" && value !== null ? value : { url: value };
  const url = normalizeUrlForStore(payload.url || "docs.anthropic.com");
  const store = readStore();
  const project = payload.projectPath && fs.existsSync(payload.projectPath)
    ? projectFromPath(payload.projectPath)
    : store.activeProject || localWorkspaceProject();
  upsertBrowserVisit(store, {
    id: payload.visitId || id("browser"),
    url,
    finalUrl: url,
    status: "external",
    external: true,
    project,
    startedAt: now(),
    endedAt: now(),
    lastEventAt: now(),
  });
  writeStore(store);
  await shell.openExternal(url);
  return sanitizeStore(store);
});

ipcMain.handle("app:list-ide-options", () => ideOptions());

ipcMain.handle("app:open-ide", async (_event, { projectPath, ideId } = {}) => {
  const options = ideOptions();
  const selected = options.find((item) => item.id === ideId) || options[0];
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  if (!selected) {
    await shell.openPath(cwd);
    return { opened: "folder" };
  }
  const child = spawn(selected.executable, [cwd], {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return { opened: selected.id };
});

ipcMain.handle("app:get-environment", async (_event, { projectPath } = {}) => {
  const requestedProjectPath = String(projectPath || "").trim();
  const hasRequestedProject = Boolean(requestedProjectPath);
  let projectExists = false;
  if (hasRequestedProject) {
    try {
      projectExists = fs.statSync(requestedProjectPath).isDirectory();
    } catch {
      projectExists = false;
    }
  }
  const projectMissing = hasRequestedProject && !projectExists;
  const cwd = projectExists ? requestedProjectPath : app.getPath("home");
  const git = await loadGitEnvironment(cwd);
  return {
    cwd,
    requestedProjectPath,
    projectExists,
    projectMissing,
    fallbackCwd: projectMissing ? cwd : "",
    git,
    ideOptions: ideOptions(),
  };
});

ipcMain.handle("claude:status", async (_event, { projectPath } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const claudeCommand = configuredClaudeCommand();
  const skillRegistry = loadSkillRegistry(cwd);
  const [version, auth, plugins, pluginsJson, mcp, mcpJson, marketplaces, marketplacesJson] = await Promise.all([
    runClaudeCommand(claudeCommand, ["--version"], { cwd, timeoutMs: 20000 }),
    runClaudeCommand(claudeCommand, ["auth", "status"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "list", "--json"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["mcp", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["mcp", "list", "--json"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "marketplace", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "marketplace", "list", "--json"], { cwd, timeoutMs: 30000 }),
  ]);
  const pluginItems = normalizeClaudePluginItems(pluginsJson.stdout, plugins.stdout || plugins.stderr);
  const marketplaceItems = normalizeMarketplaceItems(marketplacesJson.stdout, marketplaces.stdout || marketplaces.stderr);
  const mcpRaw = stripAnsi(mcp.stdout || mcp.stderr).trim();
  const mcpJsonItems = mcpJson.code === 0 ? parseJsonListOutput(mcpJson.stdout, ["mcpServers", "servers"]) : [];
  const mcpJsonOutput = mcpJsonItems.length ? mcpJson.stdout : "";
  const mcpJsonStatus = mcpJsonItems.length ? mcpJson : null;
  const normalizedMcpServers = normalizeMcpServers(mcpJsonOutput, mcpRaw);
  const mcpServers = await hydrateMcpServerScopes(claudeCommand, cwd, normalizedMcpServers);
  const status = {
    refreshedAt: now(),
    project: projectFromPath(cwd),
    available: version.code === 0,
    version: stripAnsi(version.stdout || version.stderr).trim(),
    versionCommand: statusCommandState(version),
    auth: parseJsonOutput(auth.stdout) || { raw: stripAnsi(auth.stdout || auth.stderr).trim(), code: auth.code },
    authCommand: statusCommandState(auth),
    plugins: stripAnsi(plugins.stdout || plugins.stderr).trim(),
    pluginItems,
    pluginCommand: statusCommandState(plugins, pluginsJson),
    skills: skillRegistry.items,
    skillItems: skillRegistry.items,
    skillRoots: skillRegistry.roots,
    skillsTruncated: skillRegistry.truncated,
    mcp: mcpRaw,
    mcpServers,
    mcpCommand: statusCommandState(mcp, mcpJsonStatus),
    marketplaces: marketplaceItems,
    marketplacePlugins: loadMarketplacePluginCatalog(marketplaceItems, pluginItems),
    marketplaceOutput: stripAnsi(marketplaces.stdout || marketplaces.stderr).trim(),
    marketplaceCommand: statusCommandState(marketplaces, marketplacesJson),
  };
  const store = readStore();
  store.capabilityStatus = mergeCapabilityStatusSnapshot(status, store.capabilityStatus, { ...store, activeProject: projectFromPath(cwd) });
  writeStore(store);
  broadcastStoreUpdate(store);
  return store.capabilityStatus;
});

function existingProjectDirectory(value) {
  const target = String(value || "").trim();
  if (!target) return "";
  try {
    return fs.statSync(target).isDirectory() ? target : "";
  } catch {
    return "";
  }
}

function scopedPluginInstallMutation(argv = []) {
  const sourceArgs = Array.isArray(argv) ? argv : [];
  const args = sourceArgs.map(String);
  const requested = args[0] === "plugin" && ["install", "i"].includes(args[1]);
  if (!requested) return null;
  if (sourceArgs.some((arg) => typeof arg !== "string") || args.length !== 5 || args[1] !== "install" || args[2] !== "--scope") {
    return { valid: false, scope: "", identifier: "" };
  }
  const scope = String(args[3] || "").trim().toLowerCase();
  const identifier = String(args[4] || "").trim();
  const validIdentifier = Boolean(
    identifier
    && !identifier.startsWith("-")
    && !/[\s\u0000-\u001f\u007f&|<>^()%!"]/u.test(identifier),
  );
  return {
    valid: ["user", "project", "local"].includes(scope) && validIdentifier,
    scope,
    identifier,
  };
}

function projectBoundCapabilityScope(argv = []) {
  const args = Array.isArray(argv) ? argv.map(String) : [];
  const isMcpMutation = args[0] === "mcp" && ["add", "remove"].includes(args[1]);
  const isScopedPluginMutation = args[0] === "plugin" && ["install", "enable", "disable", "update", "uninstall", "remove"].includes(args[1]);
  if (!isMcpMutation && !isScopedPluginMutation) return "";
  const delimiterIndex = args.indexOf("--");
  const optionArgs = delimiterIndex >= 0 ? args.slice(0, delimiterIndex) : args;
  const scopeIndex = optionArgs.findIndex((item) => item === "--scope" || item === "-s");
  const inlineScope = optionArgs.find((item) => item.startsWith("--scope=") || item.startsWith("-s="));
  const scope = String(
    scopeIndex >= 0
      ? optionArgs[scopeIndex + 1] || ""
      : inlineScope
        ? inlineScope.slice(inlineScope.indexOf("=") + 1)
        : isMcpMutation ? "local" : "",
  ).trim().toLowerCase();
  return ["local", "project"].includes(scope) ? scope : "";
}

ipcMain.handle("claude:run", async (_event, { projectPath, args, requestId, sessionId = "", persistCommandRun = false, commandRunKind = "claude", capabilityContext = null } = {}) => {
  const rawArgv = Array.isArray(args) ? args : splitArgs(args);
  const argv = rawArgv.map(String).filter(Boolean);
  if (!argv.length) throw new Error("Claude 命令为空。");
  const capabilityPluginInstall = commandRunKind === "capability" ? scopedPluginInstallMutation(rawArgv) : null;
  if (capabilityPluginInstall && (!Array.isArray(args) || !capabilityPluginInstall.valid)) {
    throw new Error("插件安装必须使用结构化参数：plugin install --scope <user|project|local> <plugin>。");
  }
  const requestedProjectDirectory = existingProjectDirectory(projectPath);
  const projectBoundScope = projectBoundCapabilityScope(argv);
  if (projectBoundScope && !requestedProjectDirectory) {
    throw new Error(`${projectBoundScope} 范围的本机能力变更需要有效的项目工作区。`);
  }
  const cwd = requestedProjectDirectory || app.getPath("home");
  const claudeCommand = configuredClaudeCommand();
  const runId = requestId || id("claude_command");
  const startedAtIso = now();
  const startedAt = Date.now();
  const normalizedCapabilityContext = normalizeCapabilityContext(capabilityContext);
  const project = projectFromPath(cwd);
  const commandLine = `claude ${argv.join(" ")}`;
  const runSessionId = String(sessionId || "");
  const persistClaudeRunEvent = Boolean(persistCommandRun) && commandRunKind !== "capability";
  const liveEventStore = persistClaudeRunEvent
    ? (() => {
        const store = readStore();
        return { ...store, runEvents: [...(store.runEvents || [])] };
      })()
    : null;
  const claudeRunEvent = ({ status = "running", code = null, durationMs = Date.now() - startedAt, stdout = "", stderr = "" } = {}) => ({
    id: runId,
    type: "claude-command",
    status,
    title: `Claude CLI: ${titleFromUserContent(commandLine)}`,
    detail: status === "running" ? cwd : status === "cancelled" ? "命令已取消。" : `退出码: ${typeof code === "number" ? code : "-"}`,
    commandLine,
    cwd,
    code: typeof code === "number" ? code : null,
    durationMs,
    stdout,
    stderr,
    project,
    sessionId: runSessionId,
    createdAt: startedAtIso,
  });
  let liveStdout = "";
  let liveStderr = "";
  const liveRunEventEmitter = liveEventStore
    ? createProcessRunEventEmitter(
        _event.sender,
        "claude:run-stream-event",
        runId,
        () => upsertRunEvent(liveEventStore, claudeRunEvent({ stdout: liveStdout, stderr: liveStderr })),
      )
    : null;
  let lastResult = null;
  for (const candidate of commandCandidates(claudeCommand)) {
    const result = await runStreamingProcess(candidate, argv, {
      cwd,
      requestId: runId,
      timeoutMs: CLAUDE_TIMEOUT_MS,
      cancelAsCode130: true,
      env: claudeProcessEnv({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }),
      onChunk: (stream, text) => {
        if (liveEventStore) {
          const cleanText = stripAnsi(String(text || ""));
          if (stream === "stderr") liveStderr = trimOutput(`${liveStderr}${cleanText}`);
          else liveStdout = trimOutput(`${liveStdout}${cleanText}`);
          liveRunEventEmitter.schedule();
        }
        emitProcessChunk(_event.sender, "claude:run-stream-event", runId, stream, text);
      },
    });
    lastResult = result;
    if (!(result.code === 1 && /ENOENT/i.test(result.stderr || ""))) break;
  }
  liveRunEventEmitter?.flush();
  const result = lastResult || {
    command: "claude",
    args: argv,
    cwd,
    code: 1,
    stdout: "",
    stderr: "未找到 Claude 命令。",
    durationMs: 0,
  };
  const sanitizedResult = {
    ...result,
    requestId: runId,
    args: argv,
    code: result.cancelled ? 130 : result.code,
    stdout: stripAnsi(result.stdout),
    stderr: stripAnsi(result.cancelled ? trimOutput(`${result.stderr || ""}\n命令已取消。`) : result.stderr),
    cancelled: Boolean(result.cancelled),
    ...(normalizedCapabilityContext ? { capabilityContext: normalizedCapabilityContext } : {}),
  };
  if (!persistCommandRun) return sanitizedResult;
  const store = readStore();
  const customMarketplaceAction = commandRunKind === "capability"
    && sanitizedResult.code === 0
    && normalizedCapabilityContext?.kind === "custom-marketplace"
    ? normalizedCapabilityContext.action
    : "";
  const currentCustomMarketplaceSources = Array.isArray(store.settings?.customMarketplaces)
    ? store.settings.customMarketplaces.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
  if (
    customMarketplaceAction === "add"
    && argv.length === 4
    && argv[0] === "plugin"
    && argv[1] === "marketplace"
    && argv[2] === "add"
  ) {
    const source = normalizeCustomMarketplaceUrl(argv[3]);
    if (source) {
      store.settings = {
        ...store.settings,
        customMarketplaces: [
          source,
          ...currentCustomMarketplaceSources.filter((item) => normalizeCustomMarketplaceUrl(item) !== source),
        ].slice(0, 12),
      };
    }
  }
  if (
    customMarketplaceAction === "remove"
    && argv.length === 6
    && argv[0] === "plugin"
    && argv[1] === "marketplace"
    && argv[2] === "remove"
    && argv[3] === "--scope"
    && argv[4] === "user"
  ) {
    const source = normalizeCustomMarketplaceUrl(normalizedCapabilityContext.id);
    const target = normalizeMarketplaceCliName(normalizedCapabilityContext.target);
    const commandTarget = normalizeMarketplaceCliName(argv[5]);
    if (source && target && commandTarget === target) {
      store.settings = {
        ...store.settings,
        customMarketplaces: currentCustomMarketplaceSources
          .filter((item) => normalizeCustomMarketplaceUrl(item) !== source)
          .slice(0, 12),
      };
    }
  }
  const persisted = upsertCommandRun(store, {
    ...sanitizedResult,
    id: runId,
    requestId: runId,
    sessionId: runSessionId,
    kind: commandRunKind === "capability" ? "capability" : "claude",
    command: commandLine,
    project,
    startedAt: startedAtIso,
    endedAt: now(),
    ...(normalizedCapabilityContext ? { capabilityContext: normalizedCapabilityContext } : {}),
  });
  const runEvent = persistClaudeRunEvent
    ? upsertRunEvent(store, claudeRunEvent({
        status: sanitizedResult.cancelled ? "cancelled" : sanitizedResult.code === 0 ? "ok" : "error",
        code: sanitizedResult.code,
        durationMs: sanitizedResult.durationMs,
        stdout: sanitizedResult.stdout,
        stderr: sanitizedResult.stderr,
      }))
    : null;
  writeStore(store);
  broadcastStoreUpdate(store);
  const sanitized = sanitizeStore(store);
  return {
    ...sanitizedResult,
    commandRun: persisted,
    commandRuns: sanitized.commandRuns,
    ...(runEvent ? { runEvent, runEvents: sanitized.runEvents } : {}),
  };
});

ipcMain.handle("workspace:search-files", (_event, { projectPath, query = "", limit = WORKSPACE_SEARCH_LIMIT } = {}) => {
  const root = resolveProjectRoot(projectPath);
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return { root, query: "", files: [] };
  const maxResults = Math.max(1, Math.min(Number(limit || WORKSPACE_SEARCH_LIMIT), WORKSPACE_SEARCH_LIMIT));
  const files = [];
  let scanned = 0;
  const queue = [root];
  while (queue.length && files.length < maxResults && scanned < WORKSPACE_SEARCH_SCAN_LIMIT) {
    const folder = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith(".") || entry.name === ".env")
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= maxResults || scanned >= WORKSPACE_SEARCH_SCAN_LIMIT) break;
      if (entry.isDirectory()) {
        if (!isIgnoredWorkspaceDir(entry.name)) queue.push(path.join(folder, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      scanned += 1;
      const fullPath = path.join(folder, entry.name);
      const relative = slashPath(path.relative(root, fullPath));
      if (!relative.toLowerCase().includes(needle)) continue;
      try {
        const stat = fs.statSync(fullPath);
        files.push({
          name: entry.name,
          path: relative,
          type: "file",
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        // Ignore files that changed while scanning.
      }
    }
  }
  return {
    root,
    query: needle,
    scanned,
    truncated: scanned >= WORKSPACE_SEARCH_SCAN_LIMIT,
    files,
  };
});

ipcMain.handle("workspace:list-files", (_event, { projectPath, relativePath = "", depth = 2 } = {}) => {
  const { root, target } = resolveInsideProject(projectPath, relativePath);
  const walk = (folder, currentDepth) => {
    const entries = fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".") || entry.name === ".env")
      .filter((entry) => !(entry.isDirectory() && isIgnoredWorkspaceDir(entry.name)))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, 120);

    return entries.map((entry) => {
      const fullPath = path.join(folder, entry.name);
      const relative = slashPath(path.relative(root, fullPath));
      const item = {
        name: entry.name,
        path: relative,
        type: entry.isDirectory() ? "directory" : "file",
      };
      if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        item.size = stat.size;
      }
      if (entry.isDirectory() && currentDepth > 0) {
        item.children = walk(fullPath, currentDepth - 1);
      }
      return item;
    });
  };

  return {
    root,
    path: slashPath(path.relative(root, target)),
    files: walk(target, Number(depth || 2)),
  };
});

ipcMain.handle("workspace:read-file", (_event, { projectPath, relativePath } = {}) => {
  const { root, target, relative } = resolveInsideProject(projectPath, relativePath);
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new Error("所选路径不是文件。");
  if (stat.size > MAX_TEXT_FILE_BYTES) throw new Error("文件太大，无法预览。");
  const buffer = fs.readFileSync(target);
  if (buffer.includes(0)) throw new Error("这里不能编辑二进制文件。");
  const snapshot = fileSnapshot(target, buffer);
  const store = readStore();
  const project = root ? projectFromPath(root) : store.activeProject || localWorkspaceProject();
  const sourceRef = upsertSourceRef(store, {
    type: "file",
    path: relative,
    title: path.basename(relative),
    project,
    size: stat.size,
    sha256: snapshot.sha256,
    updatedAt: snapshot.updatedAt,
    lastOpenedAt: now(),
  });
  writeStore(store);
  return {
    ...snapshot,
    path: relative,
    sourceRef,
    sourceRefs: sanitizeStore(store).sourceRefs,
  };
});

ipcMain.handle("workspace:save-file", (_event, { projectPath, relativePath, content, baseUpdatedAt, baseSha256 } = {}) => {
  const { target, relative } = resolveInsideProject(projectPath, relativePath);
  const nextContent = String(content ?? "");
  const hasBaseVersion = Boolean(baseUpdatedAt || baseSha256);
  const isMissingPathError = (error) => error?.code === "ENOENT";
  const hasFileIdentity = (stat) =>
    typeof stat?.dev === "bigint" && stat.dev > 0n && typeof stat?.ino === "bigint" && stat.ino > 0n;
  const sameFileIdentity = (left, right) =>
    hasFileIdentity(left) && hasFileIdentity(right) && left.dev === right.dev && left.ino === right.ino;
  const sameFileState = (left, right) =>
    typeof left?.size === "bigint" &&
    typeof right?.size === "bigint" &&
    typeof left?.mtimeNs === "bigint" &&
    typeof right?.mtimeNs === "bigint" &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs;
  const safeBigIntNumber = (value, label) => {
    if (
      typeof value !== "bigint" ||
      value < BigInt(Number.MIN_SAFE_INTEGER) ||
      value > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      const error = new Error(`文件 ${label} 超出安全数值范围。`);
      error.code = "WORKSPACE_FILE_METADATA_RANGE";
      throw error;
    }
    return Number(value);
  };
  const statSizeNumber = (stat) => safeBigIntNumber(stat.size, "size");
  const statUpdatedAt = (stat) => {
    if (typeof stat?.mtimeNs !== "bigint") {
      const error = new Error("文件 mtime 不可用。");
      error.code = "WORKSPACE_FILE_METADATA_UNAVAILABLE";
      throw error;
    }
    const wholeMilliseconds = stat.mtimeNs / 1_000_000n;
    const remainderNs = stat.mtimeNs % 1_000_000n;
    const roundedMilliseconds =
      remainderNs >= 500_000n
        ? wholeMilliseconds + 1n
        : remainderNs < -500_000n
          ? wholeMilliseconds - 1n
          : wholeMilliseconds;
    const milliseconds = safeBigIntNumber(roundedMilliseconds, "mtime");
    const updatedAt = new Date(milliseconds);
    if (Number.isNaN(updatedAt.getTime())) {
      const error = new Error("文件 mtime 无法转换为 ISO 时间。");
      error.code = "WORKSPACE_FILE_METADATA_RANGE";
      throw error;
    }
    return updatedAt.toISOString();
  };
  const conflictResult = ({ currentUpdatedAt = "", currentSha256 = "", currentBytes = 0, currentExists, reason }) => {
    const attemptedBuffer = Buffer.from(nextContent, "utf8");
    return {
      ok: false,
      conflict: true,
      code: "WORKSPACE_FILE_CONFLICT",
      message: "文件已被外部修改或删除。请确认磁盘状态后再处理草稿，避免覆盖或重建外部变更。",
      path: relative,
      details: {
        baseUpdatedAt: String(baseUpdatedAt || ""),
        baseSha256: String(baseSha256 || ""),
        currentUpdatedAt,
        currentSha256,
        attemptedSha256: hashBuffer(attemptedBuffer),
        attemptedBytes: attemptedBuffer.length,
        currentBytes,
        baseExists: true,
        currentExists,
        reason,
      },
    };
  };
  if (!hasBaseVersion) {
    let existingStat = null;
    try {
      existingStat = fs.statSync(target);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
    if (existingStat && !existingStat.isFile()) throw new Error("所选路径不是文件。");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, nextContent, "utf8");
    return {
      ...fileSnapshot(target),
      path: relative,
    };
  }

  const readOpenHandleSnapshot = (fd) => {
    const beforeRead = fs.fstatSync(fd, { bigint: true });
    const buffer = Buffer.alloc(statSizeNumber(beforeRead));
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const afterRead = fs.fstatSync(fd, { bigint: true });
    return {
      stat: afterRead,
      buffer: offset === buffer.length ? buffer : buffer.subarray(0, offset),
      stable: sameFileState(beforeRead, afterRead) && BigInt(offset) === afterRead.size,
    };
  };
  const evidenceFromSnapshot = (snapshot) => ({
    currentUpdatedAt: statUpdatedAt(snapshot.stat),
    currentSha256: hashBuffer(snapshot.buffer),
    currentBytes: snapshot.buffer.length,
    currentExists: true,
  });
  const readPathEvidence = () => {
    let evidenceFd;
    try {
      evidenceFd = fs.openSync(target, "r");
    } catch (error) {
      if (isMissingPathError(error)) {
        return {
          currentUpdatedAt: "",
          currentSha256: "",
          currentBytes: 0,
          currentExists: false,
        };
      }
      throw error;
    }
    try {
      const evidenceStat = fs.fstatSync(evidenceFd, { bigint: true });
      if (!evidenceStat.isFile()) {
        return {
          currentUpdatedAt: statUpdatedAt(evidenceStat),
          currentSha256: "",
          currentBytes: 0,
          currentExists: true,
        };
      }
      const snapshot = readOpenHandleSnapshot(evidenceFd);
      return evidenceFromSnapshot(snapshot);
    } finally {
      fs.closeSync(evidenceFd);
    }
  };
  const conflictForPathState = (reason) => {
    const evidence = readPathEvidence();
    return conflictResult({
      ...evidence,
      reason: evidence.currentExists ? reason : "deleted",
    });
  };
  const writeBufferToHandle = (fd, buffer) => {
    let offset = 0;
    while (offset < buffer.length) {
      const bytesWritten = fs.writeSync(fd, buffer, offset, buffer.length - offset, offset);
      if (bytesWritten === 0) {
        const error = new Error("无法完整写入文件。");
        error.code = "WORKSPACE_FILE_SHORT_WRITE";
        throw error;
      }
      offset += bytesWritten;
    }
  };
  const errorSummary = (error) => {
    const code = error?.code ? `${error.code}: ` : "";
    return `${code}${error?.message || String(error)}`;
  };

  let fd;
  try {
    try {
      fd = fs.openSync(target, "r+");
    } catch (error) {
      if (isMissingPathError(error)) return conflictResult({ currentExists: false, reason: "deleted" });
      try {
        const currentStat = fs.statSync(target, { bigint: true });
        if (!currentStat.isFile()) throw new Error("所选路径不是文件。");
      } catch (statError) {
        if (isMissingPathError(statError)) return conflictResult({ currentExists: false, reason: "deleted" });
        throw statError;
      }
      throw error;
    }

    const openedStat = fs.fstatSync(fd, { bigint: true });
    if (!openedStat.isFile()) throw new Error("所选路径不是文件。");
    const initialSnapshot = readOpenHandleSnapshot(fd);
    if (!hasFileIdentity(initialSnapshot.stat)) {
      return conflictResult({ ...evidenceFromSnapshot(initialSnapshot), reason: "identity-unavailable" });
    }
    const initialUpdatedAt = statUpdatedAt(initialSnapshot.stat);
    const initialSha256 = hashBuffer(initialSnapshot.buffer);
    const mtimeChanged = baseUpdatedAt && baseUpdatedAt !== initialUpdatedAt;
    const hashChanged = baseSha256 && baseSha256 !== initialSha256;
    if (!initialSnapshot.stable || mtimeChanged || hashChanged) {
      return conflictResult({
        currentUpdatedAt: initialUpdatedAt,
        currentSha256: initialSha256,
        currentBytes: initialSnapshot.buffer.length,
        currentExists: true,
        reason: "modified",
      });
    }

    const verifiedSnapshot = readOpenHandleSnapshot(fd);
    if (!hasFileIdentity(verifiedSnapshot.stat)) {
      return conflictResult({ ...evidenceFromSnapshot(verifiedSnapshot), reason: "identity-unavailable" });
    }
    if (
      !verifiedSnapshot.stable ||
      !sameFileIdentity(initialSnapshot.stat, verifiedSnapshot.stat) ||
      !sameFileState(initialSnapshot.stat, verifiedSnapshot.stat) ||
      !initialSnapshot.buffer.equals(verifiedSnapshot.buffer)
    ) {
      return conflictResult({
        ...evidenceFromSnapshot(verifiedSnapshot),
        reason: "modified",
      });
    }

    let pathStatBeforeWrite;
    try {
      pathStatBeforeWrite = fs.statSync(target, { bigint: true });
    } catch (error) {
      if (isMissingPathError(error)) return conflictForPathState("deleted");
      throw error;
    }
    if (!pathStatBeforeWrite.isFile()) return conflictForPathState("replaced");
    if (!hasFileIdentity(pathStatBeforeWrite)) return conflictForPathState("identity-unavailable");
    if (!sameFileIdentity(verifiedSnapshot.stat, pathStatBeforeWrite)) {
      return conflictForPathState("replaced");
    }

    const nextBuffer = Buffer.from(nextContent, "utf8");
    const originalBuffer = Buffer.from(verifiedSnapshot.buffer);
    try {
      fs.ftruncateSync(fd, 0);
      writeBufferToHandle(fd, nextBuffer);
      fs.fsyncSync(fd);
    } catch (writeError) {
      try {
        fs.ftruncateSync(fd, 0);
        writeBufferToHandle(fd, originalBuffer);
        fs.fsyncSync(fd);
      } catch (rollbackError) {
        const combinedError = new Error(
          `文件保存失败且原内容回滚失败。save=${errorSummary(writeError)}; rollback=${errorSummary(rollbackError)}`,
        );
        combinedError.code = "WORKSPACE_FILE_SAVE_ROLLBACK_FAILED";
        combinedError.cause = writeError;
        combinedError.originalError = writeError;
        combinedError.rollbackError = rollbackError;
        throw combinedError;
      }
      throw writeError;
    }

    const writtenSnapshot = readOpenHandleSnapshot(fd);
    if (!writtenSnapshot.stable || !writtenSnapshot.buffer.equals(nextBuffer)) {
      return conflictResult({
        ...evidenceFromSnapshot(writtenSnapshot),
        reason: "modified-during-save",
      });
    }
    if (!hasFileIdentity(writtenSnapshot.stat)) {
      return conflictResult({ ...evidenceFromSnapshot(writtenSnapshot), reason: "identity-unavailable" });
    }

    let pathStatAfterWrite;
    try {
      pathStatAfterWrite = fs.statSync(target, { bigint: true });
    } catch (error) {
      if (isMissingPathError(error)) return conflictForPathState("deleted");
      throw error;
    }
    if (!pathStatAfterWrite.isFile()) return conflictForPathState("replaced");
    if (!hasFileIdentity(pathStatAfterWrite)) return conflictForPathState("identity-unavailable");
    if (!sameFileIdentity(writtenSnapshot.stat, pathStatAfterWrite)) {
      return conflictForPathState("replaced");
    }

    return {
      path: relative,
      name: path.basename(target),
      content: writtenSnapshot.buffer.toString("utf8"),
      size: statSizeNumber(writtenSnapshot.stat),
      updatedAt: statUpdatedAt(writtenSnapshot.stat),
      sha256: hashBuffer(writtenSnapshot.buffer),
    };
  } finally {
    if (typeof fd === "number") fs.closeSync(fd);
  }
});

ipcMain.handle("workspace:save-file-as", async (event, { projectPath, relativePath, content } = {}) => {
  const failure = (code, message) => ({ ok: false, canceled: false, code, message });
  const codedError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };
  const hasFileIdentity = (stat) =>
    typeof stat?.dev === "bigint" && stat.dev > 0n && typeof stat?.ino === "bigint" && stat.ino > 0n;
  const sameFileIdentity = (left, right) =>
    hasFileIdentity(left) && hasFileIdentity(right) && left.dev === right.dev && left.ino === right.ino;
  const hasSingleLink = (stat) => typeof stat?.nlink === "bigint" && stat.nlink === 1n;
  const samePath = (left, right) => path.relative(left, right) === "" && path.relative(right, left) === "";
  const readHandleSnapshot = (fd) => {
    const before = fs.fstatSync(fd, { bigint: true });
    if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw codedError("WORKSPACE_SAVE_AS_FILE_TOO_LARGE", "另存目标过大，无法安全处理。");
    }
    const buffer = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    return {
      stat: after,
      buffer: offset === buffer.length ? buffer : buffer.subarray(0, offset),
      stable: before.size === after.size && before.mtimeNs === after.mtimeNs && BigInt(offset) === after.size,
    };
  };
  const writeBufferToHandle = (fd, buffer) => {
    let offset = 0;
    while (offset < buffer.length) {
      const bytesWritten = fs.writeSync(fd, buffer, offset, buffer.length - offset, offset);
      if (bytesWritten === 0) throw codedError("WORKSPACE_FILE_SHORT_WRITE", "无法完整写入文件。");
      offset += bytesWritten;
    }
  };
  const snapshotFromHandle = (target, relative, snapshot) => ({
    path: slashPath(relative),
    name: path.basename(target),
    content: snapshot.buffer.toString("utf8"),
    size: Number(snapshot.stat.size),
    updatedAt: new Date(Number(snapshot.stat.mtimeNs / 1_000_000n)).toISOString(),
    sha256: hashBuffer(snapshot.buffer),
  });

  try {
    const owner = BrowserWindow.fromWebContents(event?.sender);
    if (!owner || owner.isDestroyed()) {
      return failure("WORKSPACE_SAVE_AS_INVALID_SENDER", "无法确认另存窗口来源。");
    }

    const initialStore = readStore();
    const requestedRoot = resolveProjectRoot(projectPath);
    const trustedRoot = resolveProjectRoot(initialStore.activeProject?.path);
    const requestedRealRoot = fs.realpathSync(requestedRoot);
    const realRoot = fs.realpathSync(trustedRoot);
    if (!samePath(requestedRealRoot, realRoot)) {
      return failure("WORKSPACE_SAVE_AS_PROJECT_MISMATCH", "另存请求不属于当前项目。");
    }

    const { target } = resolveInsideProject(trustedRoot, relativePath);
    const extension = path.extname(target);
    const basename = path.basename(target, extension);
    const defaultPath = path.join(path.dirname(target), `${basename}.recovered${extension}`);
    const result = await dialog.showSaveDialog(owner, {
      title: "另存草稿",
      buttonLabel: "另存",
      defaultPath,
      properties: ["createDirectory", "showOverwriteConfirmation", "dontAddToRecent"],
      filters: [
        { name: "文本文件", extensions: extension ? [extension.slice(1)] : ["txt"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    const selectedPath = path.resolve(result.filePath);
    const selectedRelative = path.relative(trustedRoot, selectedPath);
    if (relativePathEscapesRoot(selectedRelative)) {
      return failure("WORKSPACE_SAVE_AS_OUTSIDE_PROJECT", "另存位置必须在当前项目内。");
    }

    const resolved = resolveInsideProject(trustedRoot, selectedRelative);
    let realParent;
    try {
      realParent = fs.realpathSync(path.dirname(resolved.target));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return failure("WORKSPACE_SAVE_AS_PARENT_MISSING", "另存目录不存在，请在当前项目内选择已有文件夹。");
    }
    if (relativePathEscapesRoot(path.relative(realRoot, realParent))) {
      return failure("WORKSPACE_SAVE_AS_OUTSIDE_PROJECT", "另存位置必须在当前项目内。");
    }

    const canonicalTarget = path.join(realParent, path.basename(resolved.target));
    const canonicalRelative = path.relative(realRoot, canonicalTarget);
    if (relativePathEscapesRoot(canonicalRelative)) {
      return failure("WORKSPACE_SAVE_AS_OUTSIDE_PROJECT", "另存位置必须在当前项目内。");
    }
    const parentIsStable = () => samePath(fs.realpathSync(path.dirname(canonicalTarget)), realParent);
    if (!parentIsStable()) {
      return failure("WORKSPACE_SAVE_AS_PARENT_CHANGED", "另存目录在确认后发生变化，请重新选择。");
    }

    let initialTargetStat = null;
    try {
      initialTargetStat = fs.lstatSync(canonicalTarget, { bigint: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (initialTargetStat?.isSymbolicLink()) {
      return failure("WORKSPACE_SAVE_AS_SYMLINK", "另存目标不能是符号链接。");
    }
    if (initialTargetStat && !initialTargetStat.isFile()) {
      return failure("WORKSPACE_SAVE_AS_NOT_FILE", "另存目标不是普通文件。");
    }
    if (initialTargetStat && !hasSingleLink(initialTargetStat)) {
      return failure("WORKSPACE_SAVE_AS_HARDLINK", "另存目标不能是硬链接文件。");
    }
    if (initialTargetStat?.size > BigInt(MAX_TEXT_FILE_BYTES)) {
      return failure("WORKSPACE_SAVE_AS_TARGET_TOO_LARGE", "另存目标过大，无法安全覆盖。");
    }

    const nextBuffer = Buffer.from(String(content ?? ""), "utf8");
    const createdNew = !initialTargetStat;
    let fd;
    let openedStat;
    let snapshot;
    let completed = false;
    try {
      try {
        fd = fs.openSync(canonicalTarget, createdNew ? "wx" : "r+");
      } catch (error) {
        if (createdNew && error?.code === "EEXIST") {
          return failure("WORKSPACE_SAVE_AS_TARGET_CHANGED", "另存目标在确认后发生变化，请重新选择。");
        }
        throw error;
      }
      openedStat = fs.fstatSync(fd, { bigint: true });
      if (!openedStat.isFile()) return failure("WORKSPACE_SAVE_AS_NOT_FILE", "另存目标不是普通文件。");
      if (!hasFileIdentity(openedStat)) {
        return failure("WORKSPACE_SAVE_AS_IDENTITY_UNAVAILABLE", "无法确认另存目标身份，请重新选择。");
      }
      if (!hasSingleLink(openedStat)) {
        return failure("WORKSPACE_SAVE_AS_HARDLINK", "另存目标不能是硬链接文件。");
      }
      if (initialTargetStat && !sameFileIdentity(initialTargetStat, openedStat)) {
        return failure("WORKSPACE_SAVE_AS_TARGET_CHANGED", "另存目标在确认后发生变化，请重新选择。");
      }
      if (!parentIsStable()) {
        return failure("WORKSPACE_SAVE_AS_PARENT_CHANGED", "另存目录在确认后发生变化，请重新选择。");
      }
      const pathStatBeforeWrite = fs.lstatSync(canonicalTarget, { bigint: true });
      if (pathStatBeforeWrite.isSymbolicLink() || !sameFileIdentity(openedStat, pathStatBeforeWrite)) {
        return failure("WORKSPACE_SAVE_AS_TARGET_CHANGED", "另存目标在确认后发生变化，请重新选择。");
      }
      if (!hasSingleLink(pathStatBeforeWrite)) {
        return failure("WORKSPACE_SAVE_AS_HARDLINK", "另存目标不能是硬链接文件。");
      }

      const originalSnapshot = createdNew ? { buffer: Buffer.alloc(0), stable: true } : readHandleSnapshot(fd);
      if (!originalSnapshot.stable) {
        return failure("WORKSPACE_SAVE_AS_TARGET_CHANGED", "另存目标正在变化，请重新选择。");
      }

      let mutated = false;
      try {
        mutated = true;
        fs.ftruncateSync(fd, 0);
        writeBufferToHandle(fd, nextBuffer);
        fs.fsyncSync(fd);
        const writtenSnapshot = readHandleSnapshot(fd);
        if (!writtenSnapshot.stable || !writtenSnapshot.buffer.equals(nextBuffer)) {
          throw codedError("WORKSPACE_SAVE_AS_VERIFY_FAILED", "另存内容写入后校验失败。");
        }
        if (!parentIsStable()) {
          throw codedError("WORKSPACE_SAVE_AS_PARENT_CHANGED", "另存目录在写入期间发生变化。");
        }
        const pathStatAfterWrite = fs.lstatSync(canonicalTarget, { bigint: true });
        if (pathStatAfterWrite.isSymbolicLink() || !sameFileIdentity(writtenSnapshot.stat, pathStatAfterWrite)) {
          throw codedError("WORKSPACE_SAVE_AS_TARGET_CHANGED", "另存目标在写入期间发生变化。");
        }
        if (!hasSingleLink(writtenSnapshot.stat) || !hasSingleLink(pathStatAfterWrite)) {
          throw codedError("WORKSPACE_SAVE_AS_HARDLINK", "另存目标在写入期间变成了硬链接文件。");
        }
        snapshot = snapshotFromHandle(canonicalTarget, canonicalRelative, writtenSnapshot);
        completed = true;
      } catch (writeError) {
        if (mutated) {
          try {
            fs.ftruncateSync(fd, 0);
            writeBufferToHandle(fd, createdNew ? Buffer.alloc(0) : originalSnapshot.buffer);
            fs.fsyncSync(fd);
          } catch (rollbackError) {
            const combined = codedError(
              "WORKSPACE_SAVE_AS_ROLLBACK_FAILED",
              `另存失败且原目标回滚失败。save=${writeError?.message || writeError}; rollback=${rollbackError?.message || rollbackError}`,
            );
            combined.cause = writeError;
            combined.rollbackError = rollbackError;
            throw combined;
          }
        }
        throw writeError;
      }
    } finally {
      let closeError = null;
      if (typeof fd === "number") {
        try {
          fs.closeSync(fd);
        } catch (error) {
          closeError = error;
        }
      }
      if (createdNew && !completed && openedStat && hasFileIdentity(openedStat)) {
        try {
          const current = fs.lstatSync(canonicalTarget, { bigint: true });
          if (!current.isSymbolicLink() && sameFileIdentity(openedStat, current)) fs.unlinkSync(canonicalTarget);
        } catch {
          // The new target may already be gone or replaced; never unlink an unverified path.
        }
      }
      if (closeError && !completed) throw closeError;
    }

    let sourceRef = null;
    let sourceRefs = null;
    let warning = null;
    try {
      const store = readStore();
      const project = projectFromPath(trustedRoot);
      sourceRef = upsertSourceRef(store, {
        type: "file",
        path: snapshot.path,
        title: path.basename(snapshot.path),
        project,
        size: snapshot.size,
        sha256: snapshot.sha256,
        updatedAt: snapshot.updatedAt,
        lastOpenedAt: now(),
      });
      writeStore(store);
      broadcastStoreUpdate(store);
      sourceRefs = sanitizeStore(store).sourceRefs;
    } catch (error) {
      warning = {
        code: "WORKSPACE_SAVE_AS_METADATA_FAILED",
        message: `草稿已另存，但来源记录更新失败：${error?.message || String(error)}`,
      };
    }
    return {
      ok: true,
      ...snapshot,
      sourceRef,
      sourceRefs,
      warning,
    };
  } catch (error) {
    return failure(error?.code || "WORKSPACE_SAVE_AS_FAILED", error?.message || String(error));
  }
});

ipcMain.handle("workspace:cancel-command", async (_event, { requestId } = {}) => {
  const key = String(requestId || "");
  if (!key.startsWith("workspace_")) return { cancelled: false };
  const runtime = activeWorkspaceCommandRuns.get(key);
  if (!runtime) return { cancelled: false };

  stopActiveRequest(runtime.requestId);
  if (!await waitForRuntimeCompletion(runtime, RUN_STOP_WAIT_MS)) {
    const error = new Error(
      `WORKSPACE_COMMAND_STOP_TIMEOUT: ${RUN_STOP_WAIT_MS} 毫秒内未确认底层命令停止，请稍后重试。`,
    );
    error.code = "WORKSPACE_COMMAND_STOP_TIMEOUT";
    throw error;
  }

  const store = readStore();
  const commandRun = (store.commandRuns || []).find(
    (item) => item.id === runtime.runId || item.requestId === runtime.requestId,
  );
  const runEvent = (store.runEvents || []).find(
    (item) => item.id === runtime.requestId,
  );
  if (!commandRun || runEvent?.status === "running") {
    const error = new Error("WORKSPACE_COMMAND_STOP_NOT_CONFIRMED: Workspace 命令尚未进入终态。");
    error.code = "WORKSPACE_COMMAND_STOP_NOT_CONFIRMED";
    throw error;
  }
  const sanitized = sanitizeStore(store);
  return {
    ...commandRun,
    commandRun,
    commandRuns: sanitized.commandRuns,
    runEvent,
    runEvents: sanitized.runEvents,
    cancelled: Boolean(commandRun.cancelled),
  };
});

ipcMain.handle("workspace:run-command", async (_event, { projectPath, command, requestId } = {}) => {
  const cwd = resolveProjectRoot(projectPath);
  const cmd = String(command || "").trim();
  if (!cmd) throw new Error("命令为空。");
  const runId = requestId || id("workspace_command");
  if (activeWorkspaceCommandRuns.has(runId) || activeRequests.has(runId)) {
    const error = new Error("WORKSPACE_COMMAND_RUNNING: 这个 Workspace 命令正在运行。");
    error.code = "WORKSPACE_COMMAND_RUNNING";
    throw error;
  }
  const runtime = runtimeCompletion({ runId, requestId: runId, cancelled: false });
  const startedAtIso = now();
  const project = projectFromPath(cwd);
  const startStore = readStore();
  upsertCommandRunEvent(startStore, {
    id: runId,
    requestId: runId,
    kind: "workspace",
    command: cmd,
    cwd,
    project,
    startedAt: startedAtIso,
    runtimeOwner: runtimeInstanceId,
  }, "running");
  writeStore(startStore);
  broadcastStoreUpdate(startStore);
  const liveEventStore = {
    ...startStore,
    runEvents: [...(startStore.runEvents || [])],
  };

  activeWorkspaceCommandRuns.set(runId, runtime);
  try {
    const result = await new Promise((resolve) => {
      const startedAt = Date.now();
      let child;
      try {
        child = spawn(cmd, [], {
          cwd,
          windowsHide: process.platform === "win32",
          env: process.env,
          shell: process.platform === "win32" ? process.env.ComSpec || true : true,
          detached: process.platform !== "win32",
        });
      } catch (error) {
        resolve({
          id: runId,
          requestId: runId,
          command: cmd,
          cwd,
          code: 1,
          stdout: "",
          stderr: trimOutput(error.message || String(error)),
          durationMs: Date.now() - startedAt,
          cancelled: false,
          startedAt: startedAtIso,
          endedAt: now(),
        });
        return;
      }

      let stdout = "";
      let stderr = "";
      let settled = false;
      let settling = false;
      let timedOut = false;
      const requestHandle = createProcessRequestHandle(child, () => {
        runtime.cancelled = true;
      });
      const currentRunEvent = () => upsertCommandRunEvent(
        liveEventStore,
        {
          id: runId,
          requestId: runId,
          command: cmd,
          cwd,
          code: null,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          cancelled: false,
          startedAt: startedAtIso,
          kind: isGitCommandLine(cmd) ? "git" : "workspace",
          project,
          runtimeOwner: runtimeInstanceId,
        },
        "running",
      );
      const liveRunEventEmitter = createProcessRunEventEmitter(
        _event.sender,
        "workspace:command-stream-event",
        runId,
        currentRunEvent,
      );
      const finish = async ({ code, error = null } = {}) => {
        if (settled || settling) return;
        settling = true;
        if (requestHandle.stopRequested) await requestHandle.waitForTreeStop();
        settled = true;
        clearTimeout(timeout);
        if (activeRequests.get(runId) === requestHandle) activeRequests.delete(runId);
        liveRunEventEmitter.flush();
        const cancelled = runtime.cancelled;
        const finalStderr = cancelled
          ? `${stderr}\n命令已取消。`
          : timedOut
            ? `${stderr}\n命令运行超过 120 秒，已停止。`
            : error
              ? `${stderr}\n${error.message || String(error)}`
              : stderr;
        resolve({
          id: runId,
          requestId: runId,
          command: cmd,
          cwd,
          code: cancelled ? 130 : timedOut ? 124 : typeof code === "number" ? code : 1,
          stdout,
          stderr: trimOutput(finalStderr),
          durationMs: Date.now() - startedAt,
          cancelled,
          startedAt: startedAtIso,
          endedAt: now(),
        });
      };

      activeRequests.set(runId, requestHandle);
      const timeout = setTimeout(() => {
        timedOut = true;
        requestHandle.terminate();
      }, 120000);

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        stdout = trimOutput(stdout + text);
        emitProcessChunk(_event.sender, "workspace:command-stream-event", runId, "stdout", text);
        liveRunEventEmitter.schedule();
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        stderr = trimOutput(stderr + text);
        emitProcessChunk(_event.sender, "workspace:command-stream-event", runId, "stderr", text);
        liveRunEventEmitter.schedule();
      });
      child.on("error", (error) => {
        requestHandle.markProcessClosed();
        void finish({ code: 1, error });
      });
      child.on("close", (code) => {
        requestHandle.markProcessClosed();
        void finish({ code });
      });
    });
    const store = readStore();
    const persisted = upsertCommandRun(store, {
      ...result,
      id: runId,
      requestId: runId,
      kind: isGitCommandLine(cmd) ? "git" : "workspace",
      project,
    });
    const runEvent = upsertCommandRunEvent(
      store,
      persisted,
      result.cancelled ? "cancelled" : result.code === 0 ? "ok" : "error",
    );
    writeStore(store);
    broadcastStoreUpdate(store);
    const sanitized = sanitizeStore(store);
    return {
      ...result,
      commandRun: persisted,
      commandRuns: sanitized.commandRuns,
      runEvent,
      runEvents: sanitized.runEvents,
    };
  } finally {
    if (activeWorkspaceCommandRuns.get(runId) === runtime) activeWorkspaceCommandRuns.delete(runId);
    runtime.resolveDone?.();
  }
});
